// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

interface IHYPRFactoryLaunchCheck {
    function graduationAdapter() external view returns (address);
    function protocolRecipient() external view returns (address);
    function totalSupply() external view returns (uint256);
    function tradableSupply() external view returns (uint256);
    function totalFeeBps() external view returns (uint256);
    function creatorFeeBps() external view returns (uint256);
    function protocolFeeBps() external view returns (uint256);
}

interface IHYPRTokenLaunchCheck {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function totalSupply() external view returns (uint256);
    function factory() external view returns (address);
    function balanceOf(address account) external view returns (uint256);
}

interface IHYPRCurveLaunchCheck {
    function token() external view returns (address);
    function factory() external view returns (address);
    function creator() external view returns (address);
    function protocolRecipient() external view returns (address);
    function graduationAdapter() external view returns (address);
    function realQuoteReserve() external view returns (uint256);
    function realTokenReserve() external view returns (uint256);
    function creatorFees() external view returns (uint256);
    function protocolFees() external view returns (uint256);
    function phase() external view returns (uint8);
    function graduationPoolId() external view returns (bytes32);
}

/// @notice Read-only verification for one factory-created HYPR launch.
/// @dev This script never starts a broadcast. It checks address coupling,
///      fixed-supply identity, fee split, reserve solvency, and lifecycle state.
contract CheckHYPRLaunch is Script {
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;

    function run() external view {
        require(block.chainid == ROBINHOOD_TESTNET_CHAIN_ID, "Robinhood testnet only");

        address factory = vm.envAddress("HYPR_FACTORY_ADDRESS");
        address token = vm.envAddress("HYPR_TOKEN_ADDRESS");
        address curve = vm.envAddress("HYPR_CURVE_ADDRESS");
        require(factory.code.length > 0, "factory has no bytecode");
        require(token.code.length > 0, "token has no bytecode");
        require(curve.code.length > 0, "curve has no bytecode");

        IHYPRFactoryLaunchCheck factoryView = IHYPRFactoryLaunchCheck(factory);
        IHYPRTokenLaunchCheck tokenView = IHYPRTokenLaunchCheck(token);
        IHYPRCurveLaunchCheck curveView = IHYPRCurveLaunchCheck(curve);

        require(tokenView.factory() == factory, "token factory mismatch");
        require(curveView.factory() == factory, "curve factory mismatch");
        require(curveView.token() == token, "curve token mismatch");
        require(curveView.creator() != address(0), "creator missing");
        require(
            curveView.protocolRecipient() == factoryView.protocolRecipient(), "recipient mismatch"
        );
        require(
            curveView.graduationAdapter() == factoryView.graduationAdapter(), "adapter mismatch"
        );
        require(tokenView.totalSupply() == factoryView.totalSupply(), "supply mismatch");
        require(
            factoryView.tradableSupply() > 0
                && factoryView.tradableSupply() < factoryView.totalSupply(),
            "invalid supply split"
        );
        require(
            factoryView.creatorFeeBps() + factoryView.protocolFeeBps() == factoryView.totalFeeBps(),
            "fee split mismatch"
        );

        uint8 phase = curveView.phase();
        require(phase <= 2, "invalid phase");
        if (phase == 2) {
            require(curveView.graduationPoolId() != bytes32(0), "graduated pool missing");
        }
        if (phase != 2) {
            require(curveView.graduationPoolId() == bytes32(0), "pool set before graduation");
        }

        uint256 recordedLiabilities =
            curveView.realQuoteReserve() + curveView.creatorFees() + curveView.protocolFees();
        require(address(curve).balance >= recordedLiabilities, "quote liabilities uncovered");
        require(
            tokenView.balanceOf(curve) == curveView.realTokenReserve(), "token reserve mismatch"
        );

        console2.log("HYPR launch checks passed");
        console2.log("HYPRFactory", factory);
        console2.log("HYPRToken", token);
        console2.log("HYPRCurve", curve);
        console2.log("name", tokenView.name());
        console2.log("symbol", tokenView.symbol());
        console2.log("creator", curveView.creator());
        console2.log("phase", phase);
        console2.log("real quote reserve", curveView.realQuoteReserve());
        console2.log("real token reserve", curveView.realTokenReserve());
        console2.log("creator fees", curveView.creatorFees());
        console2.log("protocol fees", curveView.protocolFees());
        console2.log("graduation pool id");
        console2.logBytes32(curveView.graduationPoolId());
    }
}
