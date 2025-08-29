// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ITransferRestrictor {
    function check(address from, address to, uint256 amount) external view returns (bool);
}
