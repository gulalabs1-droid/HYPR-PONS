// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal fixed-supply ERC-20 used by the V0 protocol.
/// @dev No mint, burn, transfer tax, rebasing, or admin path exists.
contract HYPRToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;
    address public immutable factory;

    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        uint256 supply,
        address recipient
    ) {
        require(bytes(tokenName).length > 0 && bytes(tokenSymbol).length > 0, "empty metadata");
        require(supply > 0 && recipient != address(0), "invalid token");
        name = tokenName;
        symbol = tokenSymbol;
        totalSupply = supply;
        factory = msg.sender;
        balanceOf[recipient] = supply;
        emit Transfer(address(0), recipient, supply);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 approved = allowance[from][msg.sender];
        require(approved >= amount, "allowance");
        if (approved != type(uint256).max) {
            allowance[from][msg.sender] = approved - amount;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "zero recipient");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
