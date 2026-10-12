// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { HYPRV4Boundary } from "../src/HYPRV4Boundary.sol";

contract HYPRV4BoundaryHarness {
    function nativeEthPoolKey(address token, uint24 fee, int24 tickSpacing)
        external
        pure
        returns (PoolKey memory)
    {
        return HYPRV4Boundary.nativeEthPoolKey(token, fee, tickSpacing);
    }

    function encodeMintAndSettlePair(
        PoolKey memory key,
        int24 tickLower,
        int24 tickUpper,
        uint256 liquidity,
        uint128 amount0Max,
        uint128 amount1Max,
        address owner,
        bytes memory hookData
    ) external pure returns (bytes memory) {
        return HYPRV4Boundary.encodeMintAndSettlePair(
            key, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner, hookData
        );
    }
}

contract HYPRV4BoundaryTest {
    HYPRV4BoundaryHarness internal harness = new HYPRV4BoundaryHarness();
    address internal token = address(0x1234);
    address internal owner = address(0xBEEF);

    function testNativePoolKeySortsETHBeforeTokenAndDisablesHooks() public view {
        PoolKey memory key = harness.nativeEthPoolKey(token, 3_000, 60);
        require(Currency.unwrap(key.currency0) == address(0), "ETH is not currency0");
        require(Currency.unwrap(key.currency1) == token, "token is not currency1");
        require(key.fee == 3_000 && key.tickSpacing == 60, "pool config");
        require(address(key.hooks) == address(0), "hook enabled");
    }

    function testPlanMatchesOfficialMintThenSettlePairShape() public view {
        PoolKey memory key = harness.nativeEthPoolKey(token, 3_000, 60);
        bytes memory encoded = harness.encodeMintAndSettlePair(
            key, -1_200, 1_200, 1 ether, 2 ether, 3 ether, owner, bytes("demo")
        );
        (bytes memory actions, bytes[] memory params) = abi.decode(encoded, (bytes, bytes[]));
        require(actions.length == 2, "action count");
        require(uint8(actions[0]) == 0x02 && uint8(actions[1]) == 0x0d, "action order");
        require(params.length == 2, "parameter count");

        (
            PoolKey memory decodedKey,
            int24 tickLower,
            int24 tickUpper,
            uint256 liquidity,
            uint128 amount0Max,
            uint128 amount1Max,
            address decodedOwner,
            bytes memory hookData
        ) = abi.decode(
            params[0], (PoolKey, int24, int24, uint256, uint128, uint128, address, bytes)
        );
        (Currency currency0, Currency currency1) = abi.decode(params[1], (Currency, Currency));
        require(Currency.unwrap(decodedKey.currency0) == Currency.unwrap(key.currency0), "key0");
        require(Currency.unwrap(decodedKey.currency1) == Currency.unwrap(key.currency1), "key1");
        require(tickLower == -1_200 && tickUpper == 1_200, "ticks");
        require(liquidity == 1 ether && amount0Max == 2 ether && amount1Max == 3 ether, "amounts");
        require(decodedOwner == owner && keccak256(hookData) == keccak256(bytes("demo")), "owner");
        require(Currency.unwrap(currency0) == address(0), "settle0");
        require(Currency.unwrap(currency1) == token, "settle1");
    }

    function testRejectsZeroTokenAndInvalidRange() public view {
        try harness.nativeEthPoolKey(address(0), 3_000, 60) {
            revert("zero token accepted");
        } catch { }

        PoolKey memory key = harness.nativeEthPoolKey(token, 3_000, 60);
        try harness.encodeMintAndSettlePair(key, 1, 1, 1, 1, 1, owner, bytes("")) {
            revert("invalid range accepted");
        } catch { }
    }
}
