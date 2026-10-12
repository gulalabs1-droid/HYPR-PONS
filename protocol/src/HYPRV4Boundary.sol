// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";

/// @notice Pure v4 payload helpers used to pin HYPR's graduation boundary to
///         the official PositionManager action format.
/// @dev This is deliberately not a live adapter. It does not call a manager,
///      move funds, choose a deployment address, or calculate liquidity. Those
///      decisions require verified Robinhood Chain testnet state and a fork test.
library HYPRV4Boundary {
    uint8 internal constant MINT_POSITION = 0x02;
    uint8 internal constant SETTLE_PAIR = 0x0d;

    function nativeEthPoolKey(address token, uint24 fee, int24 tickSpacing)
        internal
        pure
        returns (PoolKey memory key)
    {
        require(token != address(0), "zero token");
        key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(token),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: IHooks(address(0))
        });
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
    ) internal pure returns (bytes memory) {
        require(tickLower < tickUpper, "invalid ticks");
        require(owner != address(0), "zero owner");

        bytes memory actions = abi.encodePacked(MINT_POSITION, SETTLE_PAIR);
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(
            key, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner, hookData
        );
        params[1] = abi.encode(key.currency0, key.currency1);
        return abi.encode(actions, params);
    }
}
