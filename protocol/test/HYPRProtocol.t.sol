// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { HYPRFactory } from "../src/HYPRFactory.sol";
import { HYPRCurve } from "../src/HYPRCurve.sol";
import { HYPRToken } from "../src/HYPRToken.sol";

interface Vm {
    struct RecordedLog {
        bytes32[] topics;
        bytes data;
        address emitter;
    }

    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes calldata reason) external;
    function recordLogs() external;
    function getRecordedLogs() external returns (RecordedLog[] memory);
    function warp(uint256 newTimestamp) external;
}

contract MockGraduationAdapter {
    bytes32 public constant POOL_ID = keccak256("hypr-test-pool");
    address public lastToken;
    uint256 public lastTokenAmount;
    uint256 public lastQuoteAmount;

    function registerCurve(address, address) external { }

    function graduate(address token, uint256 tokenAmount)
        external
        payable
        returns (bytes32, uint256)
    {
        lastToken = token;
        lastTokenAmount = tokenAmount;
        lastQuoteAmount = msg.value;
        require(HYPRToken(token).transferFrom(msg.sender, address(this), tokenAmount), "token pull");
        return (POOL_ID, msg.value);
    }
}

contract BadGraduationAdapter {
    function registerCurve(address, address) external { }

    function graduate(address, uint256) external payable returns (bytes32, uint256) {
        return (keccak256("bad-pool"), msg.value);
    }
}

contract ReentrantSeller {
    HYPRCurve public immutable curve;
    HYPRToken public immutable token;
    uint256 public deadline;
    bool public attempted;
    bool public blocked;

    constructor(HYPRCurve curveAddress, HYPRToken tokenAddress) {
        curve = curveAddress;
        token = tokenAddress;
    }

    function attack(uint256 amount, uint256 deadlineValue) external {
        deadline = deadlineValue;
        require(token.approve(address(curve), amount), "approval");
        curve.sell(amount, 0, deadlineValue);
    }

    receive() external payable {
        if (!attempted) {
            attempted = true;
            try curve.sell(1, 0, deadline) {
                revert("reentry succeeded");
            } catch {
                blocked = true;
            }
        }
    }
}

contract ForceSender {
    constructor() payable { }

    function force(address target) external {
        selfdestruct(payable(target));
    }
}

contract HYPRProtocolTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal creator = address(0xC0FFEE);
    address internal protocol = address(0xBEEF);
    address internal trader = address(0xABCD);
    HYPRFactory internal factory;
    MockGraduationAdapter internal adapter;
    HYPRToken internal token;
    HYPRCurve internal curve;

    function setUp() public {
        adapter = new MockGraduationAdapter();
        factory = new HYPRFactory(
            protocol,
            address(adapter),
            1_000_000 ether,
            800_000 ether,
            100 ether,
            10 ether,
            125,
            30,
            95
        );
        vm.prank(creator);
        (address tokenAddress, address curveAddress) = factory.createLaunch("HYPR Test", "HYPT");
        token = HYPRToken(tokenAddress);
        curve = HYPRCurve(payable(curveAddress));
        vm.deal(trader, 100 ether);
    }

    function testCreateSeedsFixedSupplyAndStartsLive() public view {
        require(token.totalSupply() == 1_000_000 ether, "supply");
        require(token.balanceOf(address(curve)) == 1_000_000 ether, "curve seed");
        require(uint256(curve.phase()) == uint256(HYPRCurve.Phase.Live), "phase");
        require(curve.creator() == creator, "creator");
    }

    function testBuyAccruesExactFeeSplit() public {
        (uint256 quotedTokens, uint256 quotedFee,) = curve.quoteBuy(1 ether);
        vm.prank(trader);
        uint256 bought = curve.buy{ value: 1 ether }(1, block.timestamp + 1 days);
        require(bought > 0, "buy output");
        require(bought == quotedTokens, "buy quote mismatch");
        require(quotedFee == 0.0125 ether, "buy quote fee");
        require(curve.creatorFees() == 0.003 ether, "creator fee");
        require(curve.protocolFees() == 0.0095 ether, "protocol fee");
        require(token.balanceOf(trader) == bought, "buyer balance");
    }

    function testBuySellAndClaim() public {
        vm.startPrank(trader);
        uint256 bought = curve.buy{ value: 2 ether }(1, block.timestamp + 1 days);
        token.approve(address(curve), bought / 2);
        (uint256 quotedEth,,) = curve.quoteSell(bought / 2);
        uint256 before = trader.balance;
        uint256 sold = curve.sell(bought / 2, 1, block.timestamp + 1 days);
        vm.stopPrank();
        require(sold == quotedEth, "sell quote mismatch");
        require(trader.balance > before, "sell payout");
        require(curve.creatorFees() > 0 && curve.protocolFees() > 0, "fees");

        uint256 creatorBefore = creator.balance;
        vm.prank(creator);
        uint256 creatorClaimed = curve.claimCreatorFees();
        require(creatorClaimed > 0, "creator claim amount");
        require(creator.balance > creatorBefore, "creator claim");
        vm.prank(creator);
        require(curve.claimCreatorFees() == 0, "creator claimed twice");

        uint256 protocolBefore = protocol.balance;
        vm.prank(protocol);
        uint256 protocolClaimed = curve.claimProtocolFees();
        require(protocolClaimed > 0, "protocol claim amount");
        require(protocol.balance > protocolBefore, "protocol claim");
        vm.prank(protocol);
        require(curve.claimProtocolFees() == 0, "protocol claimed twice");
    }

    function testFuzzBuyConservesFeesAndSolvency(uint96 rawAmount) public {
        uint256 amount = (uint256(rawAmount) % 1 ether) + 1;
        vm.deal(trader, amount);
        (uint256 quotedTokens,,) = curve.quoteBuy(amount);
        vm.prank(trader);
        uint256 bought = curve.buy{ value: amount }(1, block.timestamp + 1 days);
        require(bought == quotedTokens, "fuzz buy quote mismatch");

        uint256 expectedFee = (amount * 125) / 10_000;
        require(curve.creatorFees() + curve.protocolFees() == expectedFee, "fee conservation");
        require(
            address(curve).balance
                == curve.realQuoteReserve() + curve.creatorFees() + curve.protocolFees(),
            "quote solvency"
        );
        require(token.balanceOf(address(curve)) >= curve.realTokenReserve(), "token reserve");
    }

    function testFuzzBuySellPreservesSolvency(uint96 rawAmount) public {
        uint256 sellBps = (uint256(rawAmount) % 4_000) + 1;
        vm.deal(trader, 10 ether);
        vm.startPrank(trader);
        uint256 bought = curve.buy{ value: 2 ether }(1, block.timestamp + 1 days);
        uint256 sellAmount = (bought * sellBps) / 10_000;
        if (sellAmount == 0) sellAmount = 1;
        token.approve(address(curve), sellAmount);
        (uint256 quotedEth,,) = curve.quoteSell(sellAmount);
        uint256 sold = curve.sell(sellAmount, 1, block.timestamp + 1 days);
        vm.stopPrank();
        require(sold == quotedEth, "fuzz sell quote mismatch");

        require(
            address(curve).balance
                == curve.realQuoteReserve() + curve.creatorFees() + curve.protocolFees(),
            "round trip solvency"
        );
        require(token.balanceOf(address(curve)) >= curve.realTokenReserve(), "round trip tokens");
    }

    function testGraduatesExactlyOnceAtThreshold() public {
        vm.prank(trader);
        curve.buy{ value: 11 ether }(1, block.timestamp + 1 days);
        require(uint256(curve.phase()) == uint256(HYPRCurve.Phase.Graduated), "not graduated");
        require(curve.graduationPoolId() == adapter.POOL_ID(), "pool id");
        require(adapter.lastToken() == address(token), "adapter token");
        require(adapter.lastQuoteAmount() == 10.8625 ether, "reserved quote");
        require(adapter.lastTokenAmount() > 0, "reserved token");
        require(token.balanceOf(address(curve)) == 0, "curve token balance");
        require(
            token.balanceOf(address(adapter)) == adapter.lastTokenAmount(), "adapter token balance"
        );
    }

    function testLaunchAndGraduationEventsMatchState() public {
        vm.recordLogs();
        vm.prank(creator);
        (address eventToken, address eventCurve) = factory.createLaunch("HYPR Events", "HEVT");
        Vm.RecordedLog[] memory launchLogs = vm.getRecordedLogs();
        bytes32 launchSignature = keccak256(
            "LaunchCreated(address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,string,string)"
        );
        bool sawLaunch;
        for (uint256 i; i < launchLogs.length; ++i) {
            Vm.RecordedLog memory log = launchLogs[i];
            if (log.emitter != address(factory) || log.topics.length != 4) continue;
            if (log.topics[0] != launchSignature) continue;
            sawLaunch = true;
            require(address(uint160(uint256(log.topics[1]))) == eventToken, "launch token topic");
            require(address(uint160(uint256(log.topics[2]))) == eventCurve, "launch curve topic");
            require(address(uint160(uint256(log.topics[3]))) == creator, "launch creator topic");
            (
                uint256 emittedTotalSupply,
                uint256 emittedTradableSupply,
                uint256 emittedVirtualQuote,
                uint256 emittedThreshold,
                uint256 emittedTotalFee,
                uint256 emittedCreatorFee,
                uint256 emittedProtocolFee,
                string memory emittedName,
                string memory emittedSymbol
            ) = abi.decode(
                log.data,
                (uint256, uint256, uint256, uint256, uint256, uint256, uint256, string, string)
            );
            require(emittedTotalSupply == factory.totalSupply(), "launch supply data");
            require(emittedTradableSupply == factory.tradableSupply(), "launch tradable data");
            require(
                emittedVirtualQuote == factory.virtualQuoteReserve(), "launch virtual quote data"
            );
            require(emittedThreshold == factory.graduationThreshold(), "launch threshold data");
            require(emittedTotalFee == factory.totalFeeBps(), "launch total fee data");
            require(emittedCreatorFee == factory.creatorFeeBps(), "launch creator fee data");
            require(emittedProtocolFee == factory.protocolFeeBps(), "launch protocol fee data");
            require(keccak256(bytes(emittedName)) == keccak256("HYPR Events"), "launch name data");
            require(keccak256(bytes(emittedSymbol)) == keccak256("HEVT"), "launch symbol data");
        }
        require(sawLaunch, "launch event missing");

        vm.recordLogs();
        vm.prank(trader);
        curve.buy{ value: 11 ether }(1, block.timestamp + 1 days);
        Vm.RecordedLog[] memory graduationLogs = vm.getRecordedLogs();
        bytes32 startedSignature = keccak256("GraduationStarted(uint256,uint256)");
        bytes32 graduatedSignature = keccak256("Graduated(bytes32,uint256,uint256)");
        bool sawStarted;
        bool sawGraduated;
        for (uint256 i; i < graduationLogs.length; ++i) {
            Vm.RecordedLog memory log = graduationLogs[i];
            if (log.emitter != address(curve) || log.topics.length == 0) continue;
            if (log.topics[0] == startedSignature) {
                (uint256 emittedTokenAmount, uint256 emittedQuoteAmount) =
                    abi.decode(log.data, (uint256, uint256));
                require(emittedTokenAmount == adapter.lastTokenAmount(), "started token data");
                require(emittedQuoteAmount == adapter.lastQuoteAmount(), "started quote data");
                sawStarted = true;
            }
            if (log.topics[0] == graduatedSignature) {
                (uint256 emittedTokenAmount, uint256 emittedQuoteAmount) =
                    abi.decode(log.data, (uint256, uint256));
                require(bytes32(log.topics[1]) == curve.graduationPoolId(), "graduated pool topic");
                require(emittedTokenAmount == adapter.lastTokenAmount(), "graduated token data");
                require(emittedQuoteAmount == adapter.lastQuoteAmount(), "graduated quote data");
                sawGraduated = true;
            }
        }
        require(sawStarted, "graduation started event missing");
        require(sawGraduated, "graduated event missing");
    }

    function testTradeAndFeeClaimEventsMatchState() public {
        vm.recordLogs();
        vm.prank(trader);
        curve.buy{ value: 1 ether }(1, block.timestamp + 1 days);
        Vm.RecordedLog[] memory tradeLogs = vm.getRecordedLogs();
        bytes32 tradeSignature = keccak256(
            "TradeExecuted(address,bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256)"
        );
        bool sawTrade;
        for (uint256 i; i < tradeLogs.length; ++i) {
            Vm.RecordedLog memory log = tradeLogs[i];
            if (log.emitter != address(curve) || log.topics.length != 3) continue;
            if (log.topics[0] != tradeSignature) continue;
            sawTrade = true;
            require(address(uint160(uint256(log.topics[1]))) == trader, "trade trader topic");
            require(log.topics[2] == bytes32(uint256(1)), "trade buy topic");
            (
                uint256 grossQuoteAmount,
                uint256 tokenAmount,
                uint256 fee,
                uint256 creatorFee,
                uint256 protocolFee,
                uint256 emittedQuoteReserve,
                uint256 emittedTokenReserve
            ) = abi.decode(
                log.data, (uint256, uint256, uint256, uint256, uint256, uint256, uint256)
            );
            require(grossQuoteAmount == 1 ether, "trade gross amount");
            require(tokenAmount > 0, "trade token amount");
            require(creatorFee + protocolFee == fee, "trade fee split");
            require(emittedQuoteReserve == curve.realQuoteReserve(), "trade quote state");
            require(emittedTokenReserve == curve.realTokenReserve(), "trade token state");
        }
        require(sawTrade, "trade event missing");

        vm.recordLogs();
        vm.prank(creator);
        uint256 creatorClaimed = curve.claimCreatorFees();
        Vm.RecordedLog[] memory claimLogs = vm.getRecordedLogs();
        bytes32 claimSignature = keccak256("FeesClaimed(address,uint256,uint8)");
        bool sawCreatorClaim;
        for (uint256 i; i < claimLogs.length; ++i) {
            Vm.RecordedLog memory log = claimLogs[i];
            if (log.emitter != address(curve) || log.topics.length != 3) continue;
            if (log.topics[0] != claimSignature) continue;
            require(address(uint160(uint256(log.topics[1]))) == creator, "claim recipient topic");
            require(log.topics[2] == bytes32(uint256(1)), "creator claim kind");
            require(abi.decode(log.data, (uint256)) == creatorClaimed, "creator claim amount");
            sawCreatorClaim = true;
        }
        require(sawCreatorClaim && creatorClaimed > 0, "creator claim event missing");

        vm.recordLogs();
        vm.prank(protocol);
        uint256 protocolClaimed = curve.claimProtocolFees();
        claimLogs = vm.getRecordedLogs();
        bool sawProtocolClaim;
        for (uint256 i; i < claimLogs.length; ++i) {
            Vm.RecordedLog memory log = claimLogs[i];
            if (log.emitter != address(curve) || log.topics.length != 3) continue;
            if (log.topics[0] != claimSignature) continue;
            require(
                address(uint160(uint256(log.topics[1]))) == protocol, "protocol recipient topic"
            );
            require(log.topics[2] == bytes32(uint256(2)), "protocol claim kind");
            require(abi.decode(log.data, (uint256)) == protocolClaimed, "protocol claim amount");
            sawProtocolClaim = true;
        }
        require(sawProtocolClaim && protocolClaimed > 0, "protocol claim event missing");
    }

    function testGraduationThresholdBoundaryAndOneWayQuotes() public {
        vm.startPrank(trader);
        curve.buy{ value: 10 ether }(1, block.timestamp + 1 days);
        require(uint256(curve.phase()) == uint256(HYPRCurve.Phase.Live), "premature graduation");
        require(curve.realQuoteReserve() == 9.875 ether, "boundary reserve");

        curve.buy{ value: 0.2 ether }(1, block.timestamp + 1 days);
        require(
            uint256(curve.phase()) == uint256(HYPRCurve.Phase.Graduated), "threshold not crossed"
        );
        vm.expectRevert(bytes("not live"));
        curve.quoteBuy(1 ether);
        vm.expectRevert(bytes("not live"));
        curve.quoteSell(1 ether);
        vm.stopPrank();
    }

    function testGraduationBoundaryHandlesOneWeiFeeRounding() public {
        MockGraduationAdapter belowAdapter = new MockGraduationAdapter();
        HYPRFactory belowFactory = new HYPRFactory(
            protocol, address(belowAdapter), 1_000_000, 800_000, 1_000_000, 1_000, 125, 30, 95
        );
        vm.prank(creator);
        (, address belowCurveAddress) = belowFactory.createLaunch("Rounding Below", "RBELOW");
        HYPRCurve belowCurve = HYPRCurve(payable(belowCurveAddress));
        vm.deal(trader, 2_000);

        // 1011 - floor(1011 * 125 / 10_000) = 999: one unit below.
        vm.prank(trader);
        belowCurve.buy{ value: 1_011 }(1, block.timestamp + 1 days);
        require(belowCurve.realQuoteReserve() == 999, "one below threshold");
        require(
            uint256(belowCurve.phase()) == uint256(HYPRCurve.Phase.Live),
            "premature rounding graduation"
        );

        // A one-wei net increment reaches the threshold and graduates atomically.
        vm.prank(trader);
        belowCurve.buy{ value: 1 }(1, block.timestamp + 1 days);
        require(belowAdapter.lastQuoteAmount() == 1_000, "exact rounded threshold");
        require(
            uint256(belowCurve.phase()) == uint256(HYPRCurve.Phase.Graduated),
            "rounded threshold not graduated"
        );

        MockGraduationAdapter exactAdapter = new MockGraduationAdapter();
        HYPRFactory exactFactory = new HYPRFactory(
            protocol, address(exactAdapter), 1_000_000, 800_000, 1_000_000, 1_000, 125, 30, 95
        );
        vm.prank(creator);
        (, address exactCurveAddress) = exactFactory.createLaunch("Rounding Exact", "REXACT");
        HYPRCurve exactCurve = HYPRCurve(payable(exactCurveAddress));

        // 1012 has the same 12-wei rounded fee, so its net is exactly 1000.
        vm.deal(trader, 2_000);
        vm.prank(trader);
        exactCurve.buy{ value: 1_012 }(1, block.timestamp + 1 days);
        require(exactAdapter.lastQuoteAmount() == 1_000, "direct rounded threshold");
        require(
            uint256(exactCurve.phase()) == uint256(HYPRCurve.Phase.Graduated),
            "direct threshold not graduated"
        );
    }

    function testDirectEthAndTradingAfterGraduationAreRejected() public {
        vm.deal(address(this), 1 ether);
        (bool accepted,) = address(curve).call{ value: 1 ether }("");
        require(!accepted, "direct ETH accepted");

        vm.prank(trader);
        curve.buy{ value: 11 ether }(1, block.timestamp + 1 days);
        vm.prank(trader);
        vm.expectRevert(bytes("not live"));
        curve.buy{ value: 1 ether }(1, block.timestamp + 1 days);
    }

    function testRejectsExpiredTradeAndWrongClaimant() public {
        vm.warp(100);
        vm.prank(trader);
        vm.expectRevert(bytes("expired"));
        curve.buy{ value: 1 ether }(1, 99);
        vm.prank(trader);
        vm.expectRevert(bytes("not creator"));
        curve.claimCreatorFees();
    }

    function testGraduationRejectsAdapterThatDoesNotMigrateTokens() public {
        BadGraduationAdapter badAdapter = new BadGraduationAdapter();
        HYPRFactory badFactory = new HYPRFactory(
            protocol,
            address(badAdapter),
            1_000_000 ether,
            800_000 ether,
            100 ether,
            10 ether,
            125,
            30,
            95
        );
        vm.prank(creator);
        (, address badCurveAddress) = badFactory.createLaunch("HYPR Bad Adapter", "BAD");
        HYPRCurve badCurve = HYPRCurve(payable(badCurveAddress));

        vm.prank(trader);
        vm.expectRevert(bytes("token not migrated"));
        badCurve.buy{ value: 11 ether }(1, block.timestamp + 1 days);
        require(uint256(badCurve.phase()) == uint256(HYPRCurve.Phase.Live), "reverted phase");
    }

    function testSellRefundCannotReenter() public {
        vm.prank(trader);
        uint256 bought = curve.buy{ value: 2 ether }(1, block.timestamp + 1 days);
        ReentrantSeller attacker = new ReentrantSeller(curve, token);
        vm.prank(trader);
        require(token.transfer(address(attacker), bought / 2), "attacker funding");

        attacker.attack(bought / 2, block.timestamp + 1 days);

        require(attacker.attempted(), "reentry not attempted");
        require(attacker.blocked(), "reentry not blocked");
        require(
            address(curve).balance
                == curve.realQuoteReserve() + curve.creatorFees() + curve.protocolFees(),
            "post-reentry solvency"
        );
    }

    function testForcedEthDoesNotBreakRecordedLiabilityAccounting() public {
        uint256 recordedBefore =
            curve.realQuoteReserve() + curve.creatorFees() + curve.protocolFees();
        ForceSender sender = new ForceSender{ value: 1 ether }();
        sender.force(address(curve));

        require(address(curve).balance == recordedBefore + 1 ether, "forced ETH accounting");
        vm.prank(trader);
        curve.buy{ value: 1 ether }(1, block.timestamp + 1 days);
        require(
            address(curve).balance
                >= curve.realQuoteReserve() + curve.creatorFees() + curve.protocolFees(),
            "forced ETH solvency"
        );
    }

    function testFactoryRejectsInvalidFeeSplit() public {
        vm.expectRevert(bytes("invalid fee split"));
        new HYPRFactory(
            protocol,
            address(adapter),
            1_000_000 ether,
            800_000 ether,
            100 ether,
            10 ether,
            125,
            30,
            90
        );
    }

    function testFactoryRejectsFullFeeConfiguration() public {
        vm.expectRevert(bytes("invalid total fee"));
        new HYPRFactory(
            protocol,
            address(adapter),
            1_000_000 ether,
            800_000 ether,
            100 ether,
            10 ether,
            10_000,
            5_000,
            5_000
        );
    }

    function testFactoryRejectsAssetsTooWideForV4Settlement() public {
        vm.expectRevert(bytes("supply too large"));
        new HYPRFactory(
            protocol,
            address(adapter),
            uint256(type(uint128).max) + 1,
            1,
            100 ether,
            10 ether,
            125,
            30,
            95
        );
    }

    function testFactoryBoundsLaunchMetadata() public {
        vm.prank(creator);
        vm.expectRevert(bytes("invalid name"));
        factory.createLaunch("", "EMPTY");

        vm.prank(creator);
        vm.expectRevert(bytes("invalid symbol"));
        factory.createLaunch("Valid Name", "");

        bytes memory oversizedName = new bytes(33);
        vm.prank(creator);
        vm.expectRevert(bytes("invalid name"));
        factory.createLaunch(string(oversizedName), "LONG");

        bytes memory oversizedSymbol = new bytes(11);
        vm.prank(creator);
        vm.expectRevert(bytes("invalid symbol"));
        factory.createLaunch("Valid Name", string(oversizedSymbol));
    }
}
