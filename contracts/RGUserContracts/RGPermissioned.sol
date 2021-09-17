pragma solidity 0.4.15;

import './RGPermissionsManager.sol';

contract RGPermissioned {
    RGPermissionsManager rgPermissionsManager;

    modifier onlyRole(bytes32 _role) {
        if (address(rgPermissionsManager) != 0x0 && rgPermissionsManager.hasRole(this, _role, msg.sender)) {
            _;
        }
    }

    // Setup and claim automically.
    function setupRGPermissionsManager(RGPermissionsManager _rgPermissionsManager) returns(bool) {
        if (address(rgPermissionsManager) != 0x0) {
            return false;
        }
        if (!_rgPermissionsManager.claimFor(this, msg.sender) && !_rgPermissionsManager.isOwner(this, msg.sender)) {
            return false;
        }

        rgPermissionsManager = _rgPermissionsManager;
        return true;
    }
}