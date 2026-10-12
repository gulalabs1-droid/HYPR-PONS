// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { HYPRFactory } from "../src/HYPRFactory.sol";
import { HYPRCurve } from "../src/HYPRCurve.sol";
import { HYPRToken } from "../src/HYPRToken.sol";
import { CheckHYPRLaunch } from "../script/CheckHYPRLaunch.s.sol";
import { MockGraduationAdapter } from "./HYPRProtocol.t.sol";

contract HYPRLaunchCheckTest is Test {
    HYPRFactory internal factory;
    HYPRCurve internal curve;
    HYPRToken internal token;
    CheckHYPRLaunch internal checker;

    receive() external payable { }

    function setUp() public {
        vm.chainId(46_630);
        factory = new HYPRFactory(
            address(this),
            address(new MockGraduationAdapter()),
            1_000_000 ether,
            800_000 ether,
            100 ether,
            10 ether,
            125,
            30,
            95
        );
        (address tokenAddress, address curveAddress) = factory.createLaunch("Checker Test", "CHECK");
        token = HYPRToken(tokenAddress);
        curve = HYPRCurve(payable(curveAddress));
        checker = new CheckHYPRLaunch();
        vm.setEnv("HYPR_FACTORY_ADDRESS", vm.toString(address(factory)));
        vm.setEnv("HYPR_TOKEN_ADDRESS", vm.toString(tokenAddress));
        vm.setEnv("HYPR_CURVE_ADDRESS", vm.toString(curveAddress));
        vm.deal(address(this), 12 ether);
    }

    function testCheckerAcceptsFreshCurveIncludingGraduationAllocation() public view {
        assertEq(token.balanceOf(address(curve)), curve.realTokenReserve() + 200_000 ether);
        checker.run();
    }

    function testCheckerAcceptsPartialBuySellWithRetainedAllocation() public {
        uint256 bought = curve.buy{ value: 1 ether }(1, block.timestamp + 600);
        token.approve(address(curve), bought / 2);
        curve.sell(bought / 2, 1, block.timestamp + 600);
        checker.run();
    }

    function testCheckerAcceptsGraduatedZeroInventory() public {
        curve.buy{ value: 11 ether }(1, block.timestamp + 600);
        assertEq(token.balanceOf(address(curve)), 0);
        assertEq(curve.realTokenReserve(), 0);
        checker.run();
    }

    function testCheckerStillRejectsUnexpectedTokenInventory() public {
        curve.buy{ value: 1 ether }(1, block.timestamp + 600);
        token.transfer(address(curve), 1);
        vm.expectRevert(bytes("token reserve mismatch"));
        checker.run();
    }
}
