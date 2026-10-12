// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20Like {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IHYPRGraduationAdapter {
    function graduate(address token, uint256 tokenAmount)
        external
        payable
        returns (bytes32 poolId, uint256 quoteUsed);
}

/// @notice One fixed-parameter ETH bonding curve for a HYPR launch.
/// @dev This is the mechanical V0 core. The adapter must be a separately verified
///      Robinhood Chain Uniswap v4 integration before any public deployment.
contract HYPRCurve {
    enum Phase {
        Live,
        Graduating,
        Graduated
    }

    uint256 public constant BPS = 10_000;

    address public immutable token;
    address public immutable factory;
    address public immutable creator;
    address public immutable protocolRecipient;
    address public immutable graduationAdapter;
    uint256 public immutable virtualQuoteReserve;
    uint256 public immutable virtualTokenReserve;
    uint256 public immutable graduationThreshold;
    uint256 public immutable totalFeeBps;
    uint256 public immutable creatorFeeBps;
    uint256 public immutable protocolFeeBps;

    uint256 public realQuoteReserve;
    uint256 public realTokenReserve;
    uint256 public creatorFees;
    uint256 public protocolFees;
    Phase public phase;
    bytes32 public graduationPoolId;

    uint256 private _locked = 1;

    event TradeExecuted(
        address indexed trader,
        bool indexed isBuy,
        uint256 grossQuoteAmount,
        uint256 tokenAmount,
        uint256 fee,
        uint256 creatorFee,
        uint256 protocolFee,
        uint256 realQuoteReserve,
        uint256 realTokenReserve
    );
    event FeesClaimed(address indexed recipient, uint256 amount, uint8 indexed kind);
    event GraduationStarted(uint256 tokenAmount, uint256 quoteAmount);
    event Graduated(bytes32 indexed poolId, uint256 tokenAmount, uint256 quoteAmount);

    modifier nonReentrant() {
        require(_locked == 1, "reentrant");
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(
        address tokenAddress,
        address creatorAddress,
        address protocolRecipientAddress,
        address graduationAdapterAddress,
        uint256 virtualQuote,
        uint256 virtualToken,
        uint256 graduationQuoteThreshold,
        uint256 tradableTokenSupply,
        uint256 totalFee,
        uint256 creatorFee,
        uint256 protocolFee
    ) {
        require(
            tokenAddress != address(0) && creatorAddress != address(0)
                && protocolRecipientAddress != address(0) && graduationAdapterAddress != address(0),
            "invalid address"
        );
        require(virtualQuote > 0 && virtualToken > 0, "invalid virtual reserve");
        require(graduationQuoteThreshold > 0 && tradableTokenSupply > 0, "invalid curve");
        require(totalFee > 0 && totalFee < BPS, "invalid total fee");
        require(creatorFee + protocolFee == totalFee, "invalid fee split");
        token = tokenAddress;
        factory = msg.sender;
        creator = creatorAddress;
        protocolRecipient = protocolRecipientAddress;
        graduationAdapter = graduationAdapterAddress;
        virtualQuoteReserve = virtualQuote;
        virtualTokenReserve = virtualToken;
        graduationThreshold = graduationQuoteThreshold;
        totalFeeBps = totalFee;
        creatorFeeBps = creatorFee;
        protocolFeeBps = protocolFee;
        realTokenReserve = tradableTokenSupply;
        phase = Phase.Live;
    }

    receive() external payable {
        revert("direct ETH");
    }

    function buy(uint256 minTokensOut, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256)
    {
        require(block.timestamp <= deadline, "expired");
        require(phase == Phase.Live, "not live");
        require(msg.value > 0, "zero input");

        (uint256 fee, uint256 creatorFee, uint256 protocolFee) = _splitFee(msg.value);
        uint256 netQuote = msg.value - fee;
        uint256 oldQuote = virtualQuoteReserve + realQuoteReserve;
        uint256 oldToken = virtualTokenReserve + realTokenReserve;
        uint256 invariant = _invariant(oldQuote, oldToken);
        uint256 newQuote = oldQuote + netQuote;
        uint256 newToken = invariant / newQuote;
        uint256 tokensOut = oldToken - newToken;

        require(tokensOut > 0 && tokensOut <= realTokenReserve, "insufficient output");
        require(tokensOut >= minTokensOut, "slippage");

        realQuoteReserve += netQuote;
        realTokenReserve -= tokensOut;
        creatorFees += creatorFee;
        protocolFees += protocolFee;
        require(IERC20Like(token).transfer(msg.sender, tokensOut), "token transfer");

        emit TradeExecuted(
            msg.sender,
            true,
            msg.value,
            tokensOut,
            fee,
            creatorFee,
            protocolFee,
            realQuoteReserve,
            realTokenReserve
        );

        if (realQuoteReserve >= graduationThreshold) _graduate();
        return tokensOut;
    }

    function sell(uint256 tokenAmount, uint256 minEthOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256)
    {
        require(block.timestamp <= deadline, "expired");
        require(phase == Phase.Live, "not live");
        require(tokenAmount > 0, "zero input");

        uint256 oldQuote = virtualQuoteReserve + realQuoteReserve;
        uint256 oldToken = virtualTokenReserve + realTokenReserve;
        uint256 invariant = _invariant(oldQuote, oldToken);
        uint256 newToken = oldToken + tokenAmount;
        uint256 newQuote = invariant / newToken;
        uint256 grossQuoteOut = oldQuote - newQuote;
        require(grossQuoteOut > 0 && grossQuoteOut <= realQuoteReserve, "insufficient reserve");

        (uint256 fee, uint256 creatorFee, uint256 protocolFee) = _splitFee(grossQuoteOut);
        uint256 netEthOut = grossQuoteOut - fee;
        require(netEthOut >= minEthOut, "slippage");

        require(
            IERC20Like(token).transferFrom(msg.sender, address(this), tokenAmount), "token input"
        );
        realTokenReserve += tokenAmount;
        realQuoteReserve -= grossQuoteOut;
        creatorFees += creatorFee;
        protocolFees += protocolFee;
        (bool sent,) = msg.sender.call{ value: netEthOut }("");
        require(sent, "ETH transfer");

        emit TradeExecuted(
            msg.sender,
            false,
            grossQuoteOut,
            tokenAmount,
            fee,
            creatorFee,
            protocolFee,
            realQuoteReserve,
            realTokenReserve
        );
        return netEthOut;
    }

    /// @notice Returns the exact buy result for a gross ETH input.
    /// @dev This mirrors `buy` without changing state, so frontends can set a
    ///      minimum output and show the fee before asking a wallet to sign.
    function quoteBuy(uint256 grossQuoteAmount)
        external
        view
        returns (uint256 tokensOut, uint256 fee, uint256 netQuote)
    {
        require(phase == Phase.Live, "not live");
        require(grossQuoteAmount > 0, "zero input");
        (fee,,) = _splitFee(grossQuoteAmount);
        netQuote = grossQuoteAmount - fee;
        uint256 oldQuote = virtualQuoteReserve + realQuoteReserve;
        uint256 oldToken = virtualTokenReserve + realTokenReserve;
        uint256 invariant = _invariant(oldQuote, oldToken);
        uint256 newToken = invariant / (oldQuote + netQuote);
        tokensOut = oldToken - newToken;
        require(tokensOut > 0 && tokensOut <= realTokenReserve, "insufficient output");
    }

    /// @notice Returns the exact sell result for a token input.
    /// @dev This mirrors `sell` without changing state, so frontends can set a
    ///      minimum ETH output and show the fee before asking a wallet to sign.
    function quoteSell(uint256 tokenAmount)
        external
        view
        returns (uint256 netEthOut, uint256 grossQuoteOut, uint256 fee)
    {
        require(phase == Phase.Live, "not live");
        require(tokenAmount > 0, "zero input");
        uint256 oldQuote = virtualQuoteReserve + realQuoteReserve;
        uint256 oldToken = virtualTokenReserve + realTokenReserve;
        uint256 invariant = _invariant(oldQuote, oldToken);
        uint256 newToken = oldToken + tokenAmount;
        uint256 newQuote = invariant / newToken;
        grossQuoteOut = oldQuote - newQuote;
        require(grossQuoteOut > 0 && grossQuoteOut <= realQuoteReserve, "insufficient reserve");
        (fee,,) = _splitFee(grossQuoteOut);
        netEthOut = grossQuoteOut - fee;
    }

    function claimCreatorFees() external nonReentrant returns (uint256 amount) {
        require(msg.sender == creator, "not creator");
        amount = creatorFees;
        creatorFees = 0;
        _pay(msg.sender, amount);
        emit FeesClaimed(msg.sender, amount, 1);
    }

    function claimProtocolFees() external nonReentrant returns (uint256 amount) {
        require(msg.sender == protocolRecipient, "not protocol");
        amount = protocolFees;
        protocolFees = 0;
        _pay(msg.sender, amount);
        emit FeesClaimed(msg.sender, amount, 2);
    }

    function _splitFee(uint256 grossAmount)
        internal
        view
        returns (uint256 fee, uint256 creatorFee, uint256 protocolFee)
    {
        fee = (grossAmount * totalFeeBps) / BPS;
        creatorFee = (grossAmount * creatorFeeBps) / BPS;
        protocolFee = fee - creatorFee;
        // `protocolFeeBps` is validated against the configured total. The final
        // subtraction preserves exact fee conservation when integer rounding occurs.
        assert(creatorFeeBps + protocolFeeBps == totalFeeBps);
    }

    function _invariant(uint256 quoteReserve, uint256 tokenReserve)
        internal
        pure
        returns (uint256)
    {
        require(quoteReserve <= type(uint256).max / tokenReserve, "invariant overflow");
        return quoteReserve * tokenReserve;
    }

    function _graduate() internal {
        phase = Phase.Graduating;
        uint256 tokenAmount = IERC20Like(token).balanceOf(address(this));
        uint256 quoteAmount = realQuoteReserve;
        require(tokenAmount <= type(uint128).max, "token too large");
        require(quoteAmount <= type(uint128).max, "quote too large");
        emit GraduationStarted(tokenAmount, quoteAmount);
        require(IERC20Like(token).approve(graduationAdapter, tokenAmount), "token approval");
        (bytes32 poolId, uint256 quoteUsed) = IHYPRGraduationAdapter(graduationAdapter)
        .graduate{ value: quoteAmount }(
            token, tokenAmount
        );
        require(quoteUsed == quoteAmount, "quote not migrated");
        require(IERC20Like(token).balanceOf(address(this)) == 0, "token not migrated");
        realQuoteReserve = 0;
        realTokenReserve = 0;
        graduationPoolId = poolId;
        phase = Phase.Graduated;
        emit Graduated(poolId, tokenAmount, quoteAmount);
    }

    function _pay(address recipient, uint256 amount) internal {
        if (amount == 0) return;
        (bool sent,) = recipient.call{ value: amount }("");
        require(sent, "ETH transfer");
    }
}
