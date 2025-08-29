// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20CappedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./restrictors/ITransferRestrictor.sol";

contract SecurityTokenV1Upgradeable is Initializable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    ERC20CappedUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant OWNER = keccak256("OWNER");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    ITransferRestrictor public restrictor;
    uint8 private _decimalsCustom;

    /// initializer
    function initialize(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 cap_,
        address owner_,
        address restrictor_
    ) external initializer {
        __ERC20_init(name_, symbol_);
        __ERC20Permit_init(name_);
        __ERC20Capped_init(cap_);
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _decimalsCustom = decimals_;
        restrictor = ITransferRestrictor(restrictor_);

        _grantRole(OWNER, owner_);
        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(GUARDIAN_ROLE, owner_);
        _grantRole(MINTER_ROLE, owner_);
        _grantRole(COMPLIANCE_ROLE, owner_);
    }

    function decimals() public view override returns (uint8) {
        return _decimalsCustom;
    }

    function pause() external onlyRole(GUARDIAN_ROLE) { _pause(); }
    function unpause() external onlyRole(GUARDIAN_ROLE) { _unpause(); }

    function setRestrictor(address r) external onlyRole(OWNER) {
        restrictor = ITransferRestrictor(r);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function _authorizeUpgrade(address) internal override onlyRole(OWNER) {}

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20Upgradeable, ERC20CappedUpgradeable)
    {
        require(!paused(), "paused");
        if (from != address(0) && to != address(0) && address(restrictor) != address(0)) {
            require(restrictor.check(from, to, value), "restricted");
        }
        super._update(from, to, value);
    }
}
