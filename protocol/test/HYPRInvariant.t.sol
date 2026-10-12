// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import { HYPRCurve } from "../src/HYPRCurve.sol";
import { HYPRFactory } from "../src/HYPRFactory.sol";
import { HYPRToken } from "../src/HYPRToken.sol";

contract InvariantGraduationAdapter {
    bytes32 public constant POOL_ID = keccak256("hypr-invariant-pool");

    function registerCurve(address, address) external { }

    function graduate(address token, uint256 tokenAmount)
        external
        payable
        returns (bytes32 poolId, uint256 quoteUsed)
    {
        require(HYPRToken(token).transferFrom(msg.sender, address(this), tokenAmount), "token pull");
        return (POOL_ID, msg.value);
    }
}

contract HYPRInvariantHandler {
    HYPRCurve public immutable curve;
    HYPRToken public immutable token;

    constructor(HYPRCurve curveAddress, HYPRToken tokenAddress) {
        curve = curveAddress;
        token = tokenAddress;
        require(token.approve(address(curveAddress), type(uint256).max), "handler approval");
    }

    function buy(uint96 rawAmount) external {
        if (uint256(curve.phase()) != uint256(HYPRCurve.Phase.Live)) return;
        uint256 amount = (uint256(rawAmount) % 0.25 ether) + 1;
        try curve.buy{ value: amount }(0, type(uint256).max) { } catch { }
    }

    function sell(uint96 rawAmount) external {
        if (uint256(curve.phase()) != uint256(HYPRCurve.Phase.Live)) return;
        uint256 balance = token.balanceOf(address(this));
        if (balance == 0) return;
        uint256 amount = (uint256(rawAmount) % balance) + 1;
        try curve.sell(amount, 0, type(uint256).max) { } catch { }
    }

    receive() external payable { }
}

contract HYPRInvariantTest is Test {
    uint256 internal constant INITIAL_SUPPLY = 1_000_000 ether;
    HYPRFactory internal factory;
    InvariantGraduationAdapter internal adapter;
    HYPRToken internal token;
    HYPRCurve internal curve;
    HYPRInvariantHandler internal handler;

    function setUp() public {
        adapter = new InvariantGraduationAdapter();
        factory = new HYPRFactory(
            address(this),
            address(adapter),
            INITIAL_SUPPLY,
            800_000 ether,
            10 ether,
            100 ether,
            125,
            30,
            95
        );
        (address tokenAddress, address curveAddress) =
            factory.createLaunch("HYPR Invariant", "HINV");
        token = HYPRToken(tokenAddress);
        curve = HYPRCurve(payable(curveAddress));
        handler = new HYPRInvariantHandler(curve, token);
        vm.deal(address(handler), 1_000 ether);

        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = HYPRInvariantHandler.buy.selector;
        selectors[1] = HYPRInvariantHandler.sell.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
    }

    function invariant_totalSupplyIsConstant() public view {
        assertEq(token.totalSupply(), INITIAL_SUPPLY);
    }

    function invariant_curveCoversRecordedLiabilities() public view {
        uint256 liabilities = curve.realQuoteReserve() + curve.creatorFees() + curve.protocolFees();
        assertGe(address(curve).balance, liabilities);
        assertGe(token.balanceOf(address(curve)), curve.realTokenReserve());
    }

    function invariant_phaseIsOneWayAndBounded() public view {
        uint256 currentPhase = uint256(curve.phase());
        assertLe(currentPhase, uint256(HYPRCurve.Phase.Graduated));
        if (currentPhase == uint256(HYPRCurve.Phase.Graduated)) {
            assertEq(curve.realQuoteReserve(), 0);
            assertEq(curve.realTokenReserve(), 0);
            assertTrue(curve.graduationPoolId() != bytes32(0));
        }
    }
}
