// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import { IPositionManager } from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { StateLibrary } from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { HYPRCurve } from "../src/HYPRCurve.sol";
import { HYPRFactory } from "../src/HYPRFactory.sol";
import { HYPRToken } from "../src/HYPRToken.sol";
import { HYPRV4GraduationAdapter } from "../src/HYPRV4GraduationAdapter.sol";

interface IPositionManagerDependenciesFork {
    function permit2() external view returns (address);
    function poolManager() external view returns (address);
}

interface IERC20Fork {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @dev A registered curve-shaped caller keeps this fork focused on the live
///      v4 boundary and inventory-price settlement policy.
contract ForkCurveCaller {
    address public immutable factory;
    address public immutable token;
    address public immutable graduationAdapter;

    constructor(address factoryAddress, address tokenAddress, address adapterAddress) {
        factory = factoryAddress;
        token = tokenAddress;
        graduationAdapter = adapterAddress;
    }

    function phase() external pure returns (uint8) {
        return 1;
    }

    function graduate(HYPRV4GraduationAdapter adapter, uint256 tokenAmount)
        external
        payable
        returns (bytes32 poolId, uint256 quoteUsed)
    {
        require(IERC20Fork(token).approve(address(adapter), tokenAmount), "adapter approval");
        return adapter.graduate{ value: msg.value }(token, tokenAmount);
    }
}

/// @notice Opt-in fork proof against the deployed Robinhood Chain testnet v4.
/// @dev This test is skipped unless HYPR_TESTNET_RPC_URL is explicitly supplied.
///      It deploys only HYPR-owned contracts on the fork and never broadcasts.
contract HYPRV4ForkTest is Test {
    using StateLibrary for IPoolManager;

    receive() external payable { }

    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
    address internal constant POSITION_MANAGER = 0x58daec3116aae6D93017bAAea7749052E8a04fA7;
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address internal constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    uint24 internal constant POOL_FEE = 3_000;
    int24 internal constant TICK_SPACING = 60;
    int24 internal constant TICK_LOWER = -887_220;
    int24 internal constant TICK_UPPER = 887_220;
    IPositionManager internal positionManager;
    IPoolManager internal poolManager;
    HYPRV4GraduationAdapter internal adapter;
    HYPRToken internal token;
    ForkCurveCaller internal curve;

    function setUp() public {
        string memory rpcUrl = vm.envOr("HYPR_TESTNET_RPC_URL", string(""));
        if (bytes(rpcUrl).length == 0) {
            vm.skip(true, "set HYPR_TESTNET_RPC_URL to run the Robinhood fork proof");
        }

        vm.createSelectFork(rpcUrl);
        require(block.chainid == ROBINHOOD_TESTNET_CHAIN_ID, "wrong fork chain");
        require(POSITION_MANAGER.code.length > 0, "position manager has no code");
        require(PERMIT2.code.length > 0, "permit2 has no code");
        require(POOL_MANAGER.code.length > 0, "pool manager has no code");

        positionManager = IPositionManager(POSITION_MANAGER);
        poolManager = IPoolManager(POOL_MANAGER);
        require(address(positionManager.poolManager()) == POOL_MANAGER, "pool manager mismatch");
        require(
            IPositionManagerDependenciesFork(POSITION_MANAGER).permit2() == PERMIT2,
            "permit2 mismatch"
        );

        adapter = new HYPRV4GraduationAdapter(
            POSITION_MANAGER, PERMIT2, POOL_FEE, TICK_SPACING, TICK_LOWER, TICK_UPPER
        );
        token = new HYPRToken("HYPR Fork", "HFORK", 2 ether, address(this));
        curve = new ForkCurveCaller(address(this), address(token), address(adapter));
        require(token.transfer(address(curve), 2 ether), "curve seed");
        adapter.registerCurve(address(token), address(curve));
        vm.deal(address(this), 1 ether);
    }

    function testGraduatesAgainstRobinhoodTestnetV4() public {
        (bytes32 poolId, uint256 quoteUsed) = curve.graduate{ value: 1 ether }(adapter, 2 ether);

        assertEq(quoteUsed, 1 ether, "quote amount");
        assertTrue(poolId != bytes32(0), "pool id missing");
        assertEq(adapter.poolIds(address(token)), poolId, "pool id not stored");
        assertTrue(adapter.positionIds(address(token)) > 0, "position id missing");
        assertGt(positionManager.getPositionLiquidity(adapter.positionIds(address(token))), 0);

        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(PoolId.wrap(poolId));
        (uint160 selectedPrice,) = adapter.selectedPriceAndLiquidity(2 ether, 1 ether);
        assertEq(sqrtPriceX96, selectedPrice, "pool price");
        assertEq(address(adapter).balance, 0, "adapter ETH residual");
        assertEq(token.balanceOf(address(adapter)), 0, "adapter token residual");
    }

    function testGraduatesInverseInventoryRatioWithoutDust() public {
        HYPRToken inverseToken =
            new HYPRToken("HYPR Inverse Fork", "HIFORK", 1 ether, address(this));
        ForkCurveCaller inverseCurve =
            new ForkCurveCaller(address(this), address(inverseToken), address(adapter));
        require(inverseToken.transfer(address(inverseCurve), 1 ether), "curve seed");
        adapter.registerCurve(address(inverseToken), address(inverseCurve));
        vm.deal(address(this), 2 ether);

        (bytes32 poolId, uint256 quoteUsed) =
            inverseCurve.graduate{ value: 2 ether }(adapter, 1 ether);

        assertEq(quoteUsed, 2 ether, "quote amount");
        assertTrue(poolId != bytes32(0), "pool id missing");
        assertGt(
            positionManager.getPositionLiquidity(adapter.positionIds(address(inverseToken))), 0
        );
        assertEq(address(adapter).balance, 0, "adapter ETH residual");
        assertEq(inverseToken.balanceOf(address(adapter)), 0, "adapter token residual");
    }

    function testGraduatesSkewedInventoryRatioWithoutDust() public {
        HYPRToken skewedToken = new HYPRToken("HYPR Skewed Fork", "HSFORK", 3 ether, address(this));
        ForkCurveCaller skewedCurve =
            new ForkCurveCaller(address(this), address(skewedToken), address(adapter));
        require(skewedToken.transfer(address(skewedCurve), 3 ether), "curve seed");
        adapter.registerCurve(address(skewedToken), address(skewedCurve));
        vm.deal(address(this), 2 ether);

        (bytes32 poolId, uint256 quoteUsed) =
            skewedCurve.graduate{ value: 2 ether }(adapter, 3 ether);

        assertEq(quoteUsed, 2 ether, "quote amount");
        assertTrue(poolId != bytes32(0), "pool id missing");
        assertGt(positionManager.getPositionLiquidity(adapter.positionIds(address(skewedToken))), 0);
        assertEq(address(adapter).balance, 0, "adapter ETH residual");
        assertEq(skewedToken.balanceOf(address(adapter)), 0, "adapter token residual");
    }

    function testFullHyprLifecycleAgainstRobinhoodTestnetV4() public {
        (address launchToken, address launchCurve) = new HYPRFactory(
                address(this),
                address(adapter),
                1_000_000 ether,
                900_000 ether,
                100 ether,
                1 ether,
                100,
                60,
                40
            )
            .createLaunch("HYPR Live Fork", "HLIVE");
        uint256 deadline = block.timestamp + 1 days;

        uint256 bought = HYPRCurve(payable(launchCurve)).buy{ value: 0.5 ether }(0, deadline);
        assertGt(bought, 0, "buy output");
        require(IERC20Fork(launchToken).approve(launchCurve, bought / 10), "sell approval");
        uint256 sold = HYPRCurve(payable(launchCurve)).sell(bought / 10, 0, deadline);
        assertGt(sold, 0, "sell output");
        assertEq(uint8(HYPRCurve(payable(launchCurve)).phase()), 0, "premature graduation");

        vm.deal(address(this), 2 ether);
        HYPRCurve(payable(launchCurve)).buy{ value: 2 ether }(0, deadline);

        assertEq(uint8(HYPRCurve(payable(launchCurve)).phase()), 2, "not graduated");
        assertEq(HYPRCurve(payable(launchCurve)).realQuoteReserve(), 0, "curve quote reserve");
        assertEq(IERC20Fork(launchToken).balanceOf(launchCurve), 0, "curve token residual");
        assertEq(
            HYPRCurve(payable(launchCurve)).graduationPoolId(),
            adapter.poolIds(launchToken),
            "pool id mismatch"
        );
        assertGt(adapter.positionIds(launchToken), 0, "position id missing");
        assertGt(positionManager.getPositionLiquidity(adapter.positionIds(launchToken)), 0);
        assertEq(address(adapter).balance, 0, "adapter ETH residual");
        assertEq(IERC20Fork(launchToken).balanceOf(address(adapter)), 0, "adapter token residual");
        assertGt(HYPRCurve(payable(launchCurve)).creatorFees(), 0, "creator fee missing");
        assertGt(HYPRCurve(payable(launchCurve)).protocolFees(), 0, "protocol fee missing");
    }
}
