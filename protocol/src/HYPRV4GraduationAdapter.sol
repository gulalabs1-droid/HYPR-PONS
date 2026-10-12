// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IPositionManager } from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import { LiquidityAmounts } from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import { FixedPointMathLib } from "@uniswap/v4-core/lib/solmate/src/utils/FixedPointMathLib.sol";
import { FullMath } from "@uniswap/v4-core/src/libraries/FullMath.sol";
import { SqrtPriceMath } from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { StateLibrary } from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId, PoolIdLibrary } from "@uniswap/v4-core/src/types/PoolId.sol";
import { IAllowanceTransfer } from "permit2/src/interfaces/IAllowanceTransfer.sol";
import { HYPRV4Boundary } from "./HYPRV4Boundary.sol";

interface IERC20Graduation {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IPositionManagerDependencies {
    function permit2() external view returns (address);
    function poolManager() external view returns (address);
}

interface IHYPRCurveIdentity {
    function factory() external view returns (address);
    function token() external view returns (address);
    function graduationAdapter() external view returns (address);
    function phase() external view returns (uint8);
}

interface IHYPRTokenIdentity {
    function factory() external view returns (address);
}

/// @notice Fixed-configuration, non-withdrawable Uniswap v4 graduation path for a HYPR launch.
/// @dev The constructor pins every v4 dependency and pool parameter. The adapter
///      derives a launch-specific initial price from the exact migrated amounts and
///      has no owner or sweep function: any residual asset makes graduation revert.
contract HYPRV4GraduationAdapter {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPositionManager public immutable positionManager;
    IAllowanceTransfer public immutable permit2;
    uint24 public immutable poolFee;
    int24 public immutable tickSpacing;
    int24 public immutable tickLower;
    int24 public immutable tickUpper;

    mapping(address token => bytes32 poolId) public poolIds;
    mapping(address token => uint256 positionId) public positionIds;
    mapping(address token => address curve) public authorizedCurves;

    event CurveRegistered(address indexed token, address indexed curve, address indexed factory);

    event GraduationPositionCreated(
        address indexed token,
        bytes32 indexed poolId,
        uint256 indexed positionId,
        uint256 tokenAmount,
        uint256 quoteAmount,
        uint128 liquidity
    );

    constructor(
        address positionManagerAddress,
        address permit2Address,
        uint24 fee,
        int24 spacing,
        int24 lower,
        int24 upper
    ) {
        require(
            positionManagerAddress != address(0) && permit2Address != address(0),
            "invalid dependency"
        );
        require(spacing > 0 && lower < upper, "invalid ticks");
        require(spacing <= type(int16).max, "tick spacing too large");
        require(fee <= 1_000_000, "fee too large");
        require(lower % spacing == 0 && upper % spacing == 0, "unaligned ticks");
        require(lower >= TickMath.minUsableTick(spacing), "lower tick too small");
        require(upper <= TickMath.maxUsableTick(spacing), "upper tick too large");
        require(
            IPositionManagerDependencies(positionManagerAddress).permit2() == permit2Address,
            "permit2 mismatch"
        );
        require(
            IPositionManagerDependencies(positionManagerAddress).poolManager() != address(0),
            "pool manager missing"
        );
        positionManager = IPositionManager(positionManagerAddress);
        permit2 = IAllowanceTransfer(permit2Address);
        poolFee = fee;
        tickSpacing = spacing;
        tickLower = lower;
        tickUpper = upper;
    }

    /// @notice Binds a factory-created curve before it can graduate.
    /// @dev Registration is permissionless at the adapter surface, but only
    ///      the immutable factory recorded by the curve can perform it.
    function registerCurve(address token, address curve) external {
        require(token != address(0) && curve != address(0), "invalid registration");
        require(authorizedCurves[token] == address(0), "curve already registered");
        IHYPRCurveIdentity identity = IHYPRCurveIdentity(curve);
        require(identity.factory() == msg.sender, "not curve factory");
        require(identity.token() == token, "curve token mismatch");
        require(identity.graduationAdapter() == address(this), "curve adapter mismatch");
        require(IHYPRTokenIdentity(token).factory() == msg.sender, "token factory mismatch");
        authorizedCurves[token] = curve;
        emit CurveRegistered(token, curve, msg.sender);
    }

    function graduate(address token, uint256 tokenAmount)
        external
        payable
        returns (bytes32 poolId, uint256 quoteUsed)
    {
        require(token != address(0) && tokenAmount > 0 && msg.value > 0, "invalid assets");
        require(authorizedCurves[token] == msg.sender, "unauthorized curve");
        require(IHYPRCurveIdentity(msg.sender).phase() == 1, "curve not graduating");
        require(poolIds[token] == bytes32(0), "already graduated");
        require(
            tokenAmount <= type(uint128).max && msg.value <= type(uint128).max, "asset too large"
        );
        require(
            IERC20Graduation(token).transferFrom(msg.sender, address(this), tokenAmount),
            "token pull"
        );

        PoolKey memory key = HYPRV4Boundary.nativeEthPoolKey(token, poolFee, tickSpacing);
        (uint160 sqrtPriceX96, uint128 liquidity) = _selectPriceAndLiquidity(tokenAmount, msg.value);
        poolId = PoolId.unwrap(key.toId());
        address poolManagerAddress = address(positionManager.poolManager());
        (uint160 existingSqrtPrice,,,) =
            IPoolManager(poolManagerAddress).getSlot0(PoolId.wrap(poolId));
        if (existingSqrtPrice == 0) {
            int24 initializedTick = positionManager.initializePool(key, sqrtPriceX96);
            require(initializedTick != type(int24).max, "pool init");
        } else {
            require(existingSqrtPrice == sqrtPriceX96, "pool price mismatch");
        }

        require(
            IERC20Graduation(token).approve(address(permit2), tokenAmount), "permit2 token approval"
        );
        permit2.approve(token, address(positionManager), uint160(tokenAmount), type(uint48).max);

        uint256 expectedPositionId = positionManager.nextTokenId();

        bytes memory plan = HYPRV4Boundary.encodeMintAndSettlePair(
            key,
            tickLower,
            tickUpper,
            liquidity,
            uint128(msg.value),
            uint128(tokenAmount),
            address(this),
            bytes("")
        );
        positionManager.modifyLiquidities{ value: msg.value }(plan, block.timestamp);
        require(
            positionManager.nextTokenId() == expectedPositionId + 1, "unexpected position count"
        );

        require(address(this).balance == 0, "quote dust");
        require(IERC20Graduation(token).balanceOf(address(this)) == 0, "token dust");
        uint256 positionId = expectedPositionId;
        poolIds[token] = poolId;
        positionIds[token] = positionId;
        quoteUsed = msg.value;
        emit GraduationPositionCreated(token, poolId, positionId, tokenAmount, quoteUsed, liquidity);
    }

    /// @notice Derives the v4 Q64.96 price for the exact migrated token/ETH ratio.
    /// @dev Native ETH is currency0 and HYPR token is currency1, so this is
    ///      sqrt(tokenAmount / quoteAmount) * 2^96. The full-precision product
    ///      avoids truncating the ratio before taking its square root.
    function sqrtPriceForAmounts(uint256 tokenAmount, uint256 quoteAmount)
        external
        pure
        returns (uint160)
    {
        return _sqrtPriceForAmounts(tokenAmount, quoteAmount);
    }

    /// @notice Returns the exact-settlement price and liquidity selected by
    /// the graduation path for a migrated inventory pair.
    function selectedPriceAndLiquidity(uint256 tokenAmount, uint256 quoteAmount)
        external
        view
        returns (uint160 sqrtPriceX96, uint128 liquidity)
    {
        return _selectPriceAndLiquidity(tokenAmount, quoteAmount);
    }

    function _sqrtPriceForAmounts(uint256 tokenAmount, uint256 quoteAmount)
        internal
        pure
        returns (uint160)
    {
        require(tokenAmount > 0 && quoteAmount > 0, "zero price amounts");
        uint256 ratioX192 = FullMath.mulDivRoundingUp(tokenAmount, uint256(1) << 192, quoteAmount);
        // Move one Q96 unit above the mathematical ratio. This keeps the
        // token side from being rounded down by v4 while the quote max still
        // caps ETH consumption at the migrated amount.
        uint256 sqrtPrice = FixedPointMathLib.sqrt(ratioX192) + 1;
        require(
            sqrtPrice > uint256(TickMath.MIN_SQRT_PRICE)
                && sqrtPrice < uint256(TickMath.MAX_SQRT_PRICE),
            "price out of range"
        );
        return uint160(sqrtPrice);
    }

    function _selectPriceAndLiquidity(uint256 tokenAmount, uint256 quoteAmount)
        internal
        view
        returns (uint160 sqrtPriceX96, uint128 liquidity)
    {
        uint160 lowerSqrtPriceX96 = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 upperSqrtPriceX96 = TickMath.getSqrtPriceAtTick(tickUpper);
        sqrtPriceX96 = _sqrtPriceForAmounts(tokenAmount, quoteAmount);

        // The official pool math rounds each required asset upward. Search
        // only the tiny neighborhood around the inventory ratio so the
        // selected pair is proven against those same rounded formulas.
        for (uint256 i; i < 32; ++i) {
            liquidity = LiquidityAmounts.getLiquidityForAmounts(
                sqrtPriceX96, lowerSqrtPriceX96, upperSqrtPriceX96, quoteAmount, tokenAmount
            );
            if (liquidity > 0) {
                uint256 requiredQuote = SqrtPriceMath.getAmount0Delta(
                    sqrtPriceX96, upperSqrtPriceX96, liquidity, true
                );
                uint256 requiredToken = SqrtPriceMath.getAmount1Delta(
                    lowerSqrtPriceX96, sqrtPriceX96, liquidity, true
                );
                if (requiredQuote <= quoteAmount && requiredToken == tokenAmount) {
                    return (sqrtPriceX96, liquidity);
                }

                if (requiredToken < tokenAmount || requiredQuote > quoteAmount) {
                    uint256 step = requiredToken < tokenAmount
                        ? FullMath.mulDivRoundingUp(
                            tokenAmount - requiredToken, uint256(1) << 96, liquidity
                        )
                        : 1;
                    require(
                        uint256(sqrtPriceX96) + step < uint256(TickMath.MAX_SQRT_PRICE),
                        "price search high"
                    );
                    sqrtPriceX96 += uint160(step);
                } else {
                    uint256 step = requiredToken > tokenAmount
                        ? FullMath.mulDivRoundingUp(
                            requiredToken - tokenAmount, uint256(1) << 96, liquidity
                        )
                        : 1;
                    require(
                        uint256(sqrtPriceX96) > uint256(TickMath.MIN_SQRT_PRICE) + step,
                        "price search low"
                    );
                    sqrtPriceX96 -= uint160(step);
                }
            } else {
                revert("zero liquidity");
            }
        }
        revert("no exact migration");
    }
}
