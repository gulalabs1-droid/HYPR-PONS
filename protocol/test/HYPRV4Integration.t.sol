// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { HYPRFactory } from "../src/HYPRFactory.sol";
import { HYPRToken } from "../src/HYPRToken.sol";
import { HYPRV4GraduationAdapter } from "../src/HYPRV4GraduationAdapter.sol";

interface IERC20AdapterTest {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @dev Strict local double for the PoolManager's extsload state read.
contract MockPoolManagerForAdapter {
    function extsload(bytes32) external pure returns (bytes32) {
        return bytes32(0);
    }
}

/// @dev Permit2-shaped double that proves the two-step approval flow and pulls
///      tokens only for the approved PositionManager caller.
contract MockPermit2ForAdapter {
    mapping(
        address owner => mapping(address token => mapping(address spender => uint256 amount))
    ) public approved;

    function approve(address token, address spender, uint160 amount, uint48) external {
        approved[msg.sender][token][spender] = amount;
    }

    function pull(address token, address owner, address recipient, uint256 amount) external {
        require(approved[owner][token][msg.sender] >= amount, "permit2 allowance");
        approved[owner][token][msg.sender] -= amount;
        require(IERC20AdapterTest(token).transferFrom(owner, recipient, amount), "token pull");
    }
}

/// @dev PositionManager-shaped double. It decodes the official action payload,
///      consumes the requested token amount through Permit2, and retains ETH as
///      the simulated pool balance.
contract MockPositionManagerForAdapter {
    MockPermit2ForAdapter public immutable permit2Contract;
    MockPoolManagerForAdapter public immutable manager;
    uint256 public nextTokenId = 1;
    uint128 public lastLiquidity;
    bool public revertOnModify;
    uint256 public nextTokenIdAfterModify = 2;

    constructor(MockPermit2ForAdapter permit2Address, MockPoolManagerForAdapter managerAddress) {
        permit2Contract = permit2Address;
        manager = managerAddress;
    }

    function poolManager() external view returns (address) {
        return address(manager);
    }

    function permit2() external view returns (address) {
        return address(permit2Contract);
    }

    function setRevertOnModify(bool value) external {
        revertOnModify = value;
    }

    function setNextTokenIdAfterModify(uint256 value) external {
        nextTokenIdAfterModify = value;
    }

    function initializePool(PoolKey calldata, uint160) external pure returns (int24) {
        return 0;
    }

    function modifyLiquidities(bytes calldata unlockData, uint256) external payable {
        if (revertOnModify) revert("manager revert");
        (bytes memory actions, bytes[] memory params) = abi.decode(unlockData, (bytes, bytes[]));
        require(
            actions.length == 2 && uint8(actions[0]) == 0x02 && uint8(actions[1]) == 0x0d, "actions"
        );
        require(params.length == 2, "params");
        (
            PoolKey memory key,
            int24 lower,
            int24 upper,
            uint256 liquidity,
            uint128 amount0Max,
            uint128 amount1Max,
            address owner,
            bytes memory hookData
        ) = abi.decode(
            params[0], (PoolKey, int24, int24, uint256, uint128, uint128, address, bytes)
        );
        require(owner == msg.sender, "position owner");
        require(lower < upper && amount0Max > 0 && hookData.length == 0, "mint params");
        lastLiquidity = uint128(liquidity);
        permit2Contract.pull(Currency.unwrap(key.currency1), msg.sender, address(this), amount1Max);
        nextTokenId = nextTokenIdAfterModify;
    }

    function getPositionLiquidity(uint256) external view returns (uint128) {
        return lastLiquidity;
    }

    receive() external payable { }
}

/// @dev Curve-shaped caller used to prove that the adapter only accepts a
///      curve registered by the factory that created it.
contract MockCurveCallerForAdapter {
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
        require(IERC20AdapterTest(token).approve(address(adapter), tokenAmount), "adapter approval");
        return adapter.graduate{ value: msg.value }(token, tokenAmount);
    }

    receive() external payable { }
}

contract HYPRV4IntegrationTest is Test {
    MockPoolManagerForAdapter internal manager;
    MockPermit2ForAdapter internal permit2;
    MockPositionManagerForAdapter internal positionManager;
    HYPRV4GraduationAdapter internal adapter;
    HYPRToken internal token;
    MockCurveCallerForAdapter internal curve;

    function setUp() public {
        manager = new MockPoolManagerForAdapter();
        permit2 = new MockPermit2ForAdapter();
        positionManager = new MockPositionManagerForAdapter(permit2, manager);
        adapter = new HYPRV4GraduationAdapter(
            address(positionManager), address(permit2), 3_000, 60, -887_220, 887_220
        );
        token = new HYPRToken("HYPR Integration", "HINT", 1 ether, address(this));
        curve = new MockCurveCallerForAdapter(address(this), address(token), address(adapter));
        require(token.transfer(address(curve), 1 ether), "curve seed");
        adapter.registerCurve(address(token), address(curve));
    }

    function testGraduatesWithPermit2PayloadAndNoResidualAssets() public {
        (bytes32 poolId, uint256 quoteUsed) = curve.graduate{ value: 1 ether }(adapter, 1 ether);

        require(quoteUsed == 1 ether, "quote used");
        require(poolId != bytes32(0), "pool id");
        require(adapter.poolIds(address(token)) == poolId, "stored pool");
        require(adapter.positionIds(address(token)) == 1, "position id");
        require(positionManager.getPositionLiquidity(1) > 0, "no position liquidity");
        require(address(adapter).balance == 0, "ETH residual");
        require(token.balanceOf(address(adapter)) == 0, "token residual");
        require(token.balanceOf(address(positionManager)) == 1 ether, "token not settled");
    }

    function testRejectsSecondGraduationForSameToken() public {
        curve.graduate{ value: 1 ether }(adapter, 1 ether);
        vm.expectRevert(bytes("already graduated"));
        curve.graduate{ value: 1 ether }(adapter, 1 ether);
    }

    function testRejectsUnregisteredCurve() public {
        vm.expectRevert(bytes("unauthorized curve"));
        adapter.graduate{ value: 1 ether }(address(token), 1 ether);
    }

    function testExternalManagerRevertRollsBackTokenPull() public {
        positionManager.setRevertOnModify(true);
        uint256 curveTokenBalance = token.balanceOf(address(curve));

        vm.expectRevert(bytes("manager revert"));
        curve.graduate{ value: 1 ether }(adapter, 1 ether);

        require(token.balanceOf(address(curve)) == curveTokenBalance, "curve token changed");
        require(token.balanceOf(address(adapter)) == 0, "adapter token stranded");
        require(address(adapter).balance == 0, "adapter ETH stranded");
        require(adapter.poolIds(address(token)) == bytes32(0), "pool recorded on revert");
    }

    function testUnexpectedPositionCountRollsBackMigration() public {
        positionManager.setNextTokenIdAfterModify(3);
        uint256 curveTokenBalance = token.balanceOf(address(curve));

        vm.expectRevert(bytes("unexpected position count"));
        curve.graduate{ value: 1 ether }(adapter, 1 ether);

        require(token.balanceOf(address(curve)) == curveTokenBalance, "curve token changed");
        require(token.balanceOf(address(adapter)) == 0, "adapter token stranded");
        require(address(adapter).balance == 0, "adapter ETH stranded");
        require(adapter.poolIds(address(token)) == bytes32(0), "pool recorded on malformed state");
    }

    function testFactoryRegistersCurveWithAdapter() public {
        HYPRFactory factory = new HYPRFactory(
            address(this), address(adapter), 2 ether, 1 ether, 1 ether, 10 ether, 125, 30, 95
        );
        (address tokenAddress, address curveAddress) = factory.createLaunch("Registered", "REG");
        require(adapter.authorizedCurves(tokenAddress) == curveAddress, "curve not registered");
    }
}
