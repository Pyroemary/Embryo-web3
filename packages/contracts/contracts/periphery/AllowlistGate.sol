// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IAccessGate} from "../interfaces/IAccessGate.sol";

/// @title AllowlistGate
/// @notice On-chain mirror of off-chain KYC status. The Embryo compliance service sets
///         `allowed` after Sumsub approval + geo checks and revokes on sanctions hits.
contract AllowlistGate is IAccessGate, AccessControl {
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    mapping(address => bool) private _allowed;

    event AllowedSet(address indexed account, bool allowed);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function isAllowed(address account) external view override returns (bool) {
        return _allowed[account];
    }

    function setAllowed(address[] calldata accounts, bool allowed) external onlyRole(COMPLIANCE_ROLE) {
        for (uint256 i; i < accounts.length; ++i) {
            _allowed[accounts[i]] = allowed;
            emit AllowedSet(accounts[i], allowed);
        }
    }
}
