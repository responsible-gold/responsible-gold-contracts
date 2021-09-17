pragma solidity 0.4.15;

import './OwnedPrototype.sol';

contract Router is OwnedPrototype {
    address prototype;
    event VersionUpdated(address newPrototype);

    function Router() {
        super.constructOwned(msg.sender);
    }

    function getPrototype() public constant returns(address) {
        return prototype;
    }

    function updateVersion(address _newPrototype) onlyContractOwner() returns(bool) {
        if (_newPrototype == 0x0) {
            return false;
        }
        prototype = _newPrototype;
        VersionUpdated(_newPrototype);
        return true;
    }
}