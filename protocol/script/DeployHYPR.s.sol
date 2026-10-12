// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { HYPRFactory } from "../src/HYPRFactory.sol";
import { HYPRV4GraduationAdapter } from "../src/HYPRV4GraduationAdapter.sol";

/// @notice Reproducible HYPR V0 testnet deployment plan.
/// @dev This script is deliberately testnet-only. Running without `--broadcast`
///      simulates the deployment; broadcasting still requires an explicitly
///      approved signer and a separately completed deployment review.
contract DeployHYPR is Script {
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

    function run() external returns (HYPRV4GraduationAdapter adapter, HYPRFactory factory) {
        require(block.chainid == ROBINHOOD_TESTNET_CHAIN_ID, "Robinhood testnet only");
        address protocolRecipient = vm.envAddress("HYPR_PROTOCOL_RECIPIENT");

        vm.startBroadcast();
        adapter = new HYPRV4GraduationAdapter(
            POSITION_MANAGER, PERMIT2, POOL_FEE, TICK_SPACING, TICK_LOWER, TICK_UPPER
        );
        factory = new HYPRFactory(
            protocolRecipient,
            address(adapter),
            TOTAL_SUPPLY,
            TRADABLE_SUPPLY,
            VIRTUAL_QUOTE_RESERVE,
            GRADUATION_THRESHOLD,
            TOTAL_FEE_BPS,
            CREATOR_FEE_BPS,
            PROTOCOL_FEE_BPS
        );
        vm.stopBroadcast();

        console2.log("HYPRV4GraduationAdapter", address(adapter));
        console2.log("HYPRFactory", address(factory));
        console2.log("protocol recipient", protocolRecipient);
    }
}
