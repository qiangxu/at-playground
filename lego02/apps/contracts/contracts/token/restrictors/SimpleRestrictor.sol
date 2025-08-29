// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./ITransferRestrictor.sol";

contract SimpleRestrictor is ITransferRestrictor, AccessControl {
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    mapping(address => bool) public allow;

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
    }

    function setWhitelist(address user, bool allowed) external onlyRole(COMPLIANCE_ROLE) {
        allow[user] = allowed;
    }

    function check(address from, address to, uint256) external view returns (bool) {
        return allow[from] && allow[to];
    }
}
