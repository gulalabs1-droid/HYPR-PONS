// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

interface IHYPRFactoryDeploymentCheck {
    function graduationAdapter() external view returns (address);
    function protocolRecipient() external view returns (address);
    function totalSupply() external view returns (uint256);
    function tradableSupply() external view returns (uint256);
    function virtualQuoteReserve() external view returns (uint256);
    function graduationThreshold() external view returns (uint256);
    function totalFeeBps() external view returns (uint256);
    function creatorFeeBps() external view returns (uint256);
    function protocolFeeBps() external view returns (uint256);
}

interface IHYPRAdapterDeploymentCheck {
    function positionManager() external view returns (address);
    function permit2() external view returns (address);
    function poolFee() external view returns (uint24);
    function tickSpacing() external view returns (int24);
    function tickLower() external view returns (int24);
    function tickUpper() external view returns (int24);
}

interface IPositionManagerDeploymentCheck {
    function permit2() external view returns (address);
    function poolManager() external view returns (address);
}

/// @notice Read-only post-deployment checks for the pinned Robinhood Chain testnet plan.
/// @dev This script never starts a broadcast. It validates addresses supplied through
///      environment variables and is safe to run against a public RPC.
contract CheckHYPRDeployment is Script {
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
    address internal constant POSITION_MANAGER = 0x58daec3116aae6D93017bAAea7749052E8a04fA7;
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    uint24 internal constant POOL_FEE = 3_000;
    int24 internal constant TICK_SPACING = 60;
    int24 internal constant TICK_LOWER = -887_220;
    int24 internal constant TICK_UPPER = 887_220;

    uint256 internal constant TOTAL_SUPPLY = 1_000_000 ether;
    uint256 internal constant TRADABLE_SUPPLY = 800_000 ether;
    uint256 internal constant VIRTUAL_QUOTE_RESERVE = 100 ether;
    uint256 internal constant GRADUATION_THRESHOLD = 10 ether;
    uint256 internal constant TOTAL_FEE_BPS = 125;
    uint256 internal constant CREATOR_FEE_BPS = 30;
    uint256 internal constant PROTOCOL_FEE_BPS = 95;

    function run() external view {
        require(block.chainid == ROBINHOOD_TESTNET_CHAIN_ID, "Robinhood testnet only");

        address factory = vm.envAddress("HYPR_FACTORY_ADDRESS");
        address adapter = vm.envAddress("HYPR_ADAPTER_ADDRESS");
        address protocolRecipient = vm.envAddress("HYPR_PROTOCOL_RECIPIENT");
        require(factory.code.length > 0, "factory has no bytecode");
        require(adapter.code.length > 0, "adapter has no bytecode");
        require(POSITION_MANAGER.code.length > 0, "position manager has no bytecode");
        require(PERMIT2.code.length > 0, "permit2 has no bytecode");

        IHYPRFactoryDeploymentCheck factoryView = IHYPRFactoryDeploymentCheck(factory);
        IHYPRAdapterDeploymentCheck adapterView = IHYPRAdapterDeploymentCheck(adapter);
        require(factoryView.graduationAdapter() == adapter, "factory adapter mismatch");
        require(factoryView.protocolRecipient() == protocolRecipient, "protocol recipient mismatch");
        require(factoryView.totalSupply() == TOTAL_SUPPLY, "total supply mismatch");
        require(factoryView.tradableSupply() == TRADABLE_SUPPLY, "tradable supply mismatch");
        require(
            factoryView.virtualQuoteReserve() == VIRTUAL_QUOTE_RESERVE, "virtual quote mismatch"
        );
        require(factoryView.graduationThreshold() == GRADUATION_THRESHOLD, "threshold mismatch");
        require(factoryView.totalFeeBps() == TOTAL_FEE_BPS, "total fee mismatch");
        require(factoryView.creatorFeeBps() == CREATOR_FEE_BPS, "creator fee mismatch");
        require(factoryView.protocolFeeBps() == PROTOCOL_FEE_BPS, "protocol fee mismatch");

        require(
            adapterView.positionManager() == POSITION_MANAGER, "adapter position manager mismatch"
        );
        require(adapterView.permit2() == PERMIT2, "adapter permit2 mismatch");
        require(adapterView.poolFee() == POOL_FEE, "adapter pool fee mismatch");
        require(adapterView.tickSpacing() == TICK_SPACING, "adapter tick spacing mismatch");
        require(adapterView.tickLower() == TICK_LOWER, "adapter lower tick mismatch");
        require(adapterView.tickUpper() == TICK_UPPER, "adapter upper tick mismatch");

        IPositionManagerDeploymentCheck positionManagerView =
            IPositionManagerDeploymentCheck(POSITION_MANAGER);
        require(positionManagerView.permit2() == PERMIT2, "position manager permit2 mismatch");
        require(
            positionManagerView.poolManager() != address(0), "position manager pool manager missing"
        );

        console2.log("HYPR testnet deployment checks passed");
        console2.log("HYPRFactory", factory);
        console2.log("HYPRV4GraduationAdapter", adapter);
        console2.log("protocol recipient", protocolRecipient);
        console2.log("PositionManager", POSITION_MANAGER);
        console2.log("Permit2", PERMIT2);
        console2.log("PoolManager", positionManagerView.poolManager());
    }
}
