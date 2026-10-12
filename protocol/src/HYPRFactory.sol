// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { HYPRToken } from "./HYPRToken.sol";
import { HYPRCurve } from "./HYPRCurve.sol";

interface IHYPRCurveRegistry {
    function registerCurve(address token, address curve) external;
}

/// @notice Creates identical, fixed-parameter HYPR V0 launches.
contract HYPRFactory {
    uint256 public immutable totalSupply;
    uint256 public immutable tradableSupply;
    uint256 public immutable virtualQuoteReserve;
    uint256 public immutable virtualTokenReserve;
    uint256 public immutable graduationThreshold;
    uint256 public immutable totalFeeBps;
    uint256 public immutable creatorFeeBps;
    uint256 public immutable protocolFeeBps;
    address public immutable protocolRecipient;
    address public immutable graduationAdapter;

    event LaunchCreated(
        address indexed token,
        address indexed curve,
        address indexed creator,
        uint256 totalSupply,
        uint256 tradableSupply,
        uint256 virtualQuoteReserve,
        uint256 graduationThreshold,
        uint256 totalFeeBps,
        uint256 creatorFeeBps,
        uint256 protocolFeeBps,
        string name,
        string symbol
    );

    constructor(
        address protocolRecipientAddress,
        address graduationAdapterAddress,
        uint256 totalSupplyAmount,
        uint256 tradableSupplyAmount,
        uint256 virtualQuoteAmount,
        uint256 graduationQuoteThreshold,
        uint256 totalFee,
        uint256 creatorFee,
        uint256 protocolFee
    ) {
        require(
            protocolRecipientAddress != address(0) && graduationAdapterAddress != address(0),
            "invalid address"
        );
        require(
            totalSupplyAmount > tradableSupplyAmount && tradableSupplyAmount > 0, "invalid supply"
        );
        require(totalSupplyAmount <= type(uint128).max, "supply too large");
        require(virtualQuoteAmount > 0 && graduationQuoteThreshold > 0, "invalid curve");
        require(totalFee > 0 && totalFee < 10_000, "invalid total fee");
        require(creatorFee + protocolFee == totalFee, "invalid fee split");
        protocolRecipient = protocolRecipientAddress;
        graduationAdapter = graduationAdapterAddress;
        totalSupply = totalSupplyAmount;
        tradableSupply = tradableSupplyAmount;
        virtualQuoteReserve = virtualQuoteAmount;
        virtualTokenReserve = tradableSupplyAmount;
        graduationThreshold = graduationQuoteThreshold;
        totalFeeBps = totalFee;
        creatorFeeBps = creatorFee;
        protocolFeeBps = protocolFee;
    }

    function createLaunch(string calldata name, string calldata symbol)
        external
        returns (address tokenAddress, address curveAddress)
    {
        require(bytes(name).length > 0 && bytes(name).length <= 32, "invalid name");
        require(bytes(symbol).length > 0 && bytes(symbol).length <= 10, "invalid symbol");
        HYPRToken token = new HYPRToken(name, symbol, totalSupply, address(this));
        HYPRCurve curve = new HYPRCurve(
            address(token),
            msg.sender,
            protocolRecipient,
            graduationAdapter,
            virtualQuoteReserve,
            virtualTokenReserve,
            graduationThreshold,
            tradableSupply,
            totalFeeBps,
            creatorFeeBps,
            protocolFeeBps
        );
        require(token.transfer(address(curve), totalSupply), "seed token");
        tokenAddress = address(token);
        curveAddress = address(curve);
        IHYPRCurveRegistry(graduationAdapter).registerCurve(tokenAddress, curveAddress);
        emit LaunchCreated(
            tokenAddress,
            curveAddress,
            msg.sender,
            totalSupply,
            tradableSupply,
            virtualQuoteReserve,
            graduationThreshold,
            totalFeeBps,
            creatorFeeBps,
            protocolFeeBps,
            name,
            symbol
        );
    }
}
