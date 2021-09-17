pragma solidity 0.4.15;

import '../RGUserContracts/RGUserClonePool.sol';

contract RGUserClonePoolTestable is RGUserClonePool {
    modifier onlyRole(bytes32 _role) {
        _;
    }
}