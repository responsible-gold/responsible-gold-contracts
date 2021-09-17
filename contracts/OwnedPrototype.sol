pragma solidity 0.4.15;

contract OwnedPrototype {
    address public contractOwner;
    address public pendingContractOwner;

    event PendingOwnerSet(address pendingOwner);
    event OwnerChanged(address newOwner);

    function constructOwned(address _owner) returns(bool) {
        if (contractOwner != 0x0) {
            return false;
        }

        if (_owner == 0x0) {
            return false;
        }

        contractOwner = _owner;
        return true;
    }

    modifier onlyContractOwner() {
        if (contractOwner == msg.sender) {
            _;
        }
    }

    function changeContractOwnership(address _to) onlyContractOwner() returns(bool) {
        pendingContractOwner = _to;
        PendingOwnerSet(pendingContractOwner);
        return true;
    }

    function claimContractOwnership() returns(bool) {
        if (pendingContractOwner != msg.sender) {
            return false;
        }
        contractOwner = pendingContractOwner;
        delete pendingContractOwner;
        OwnerChanged(contractOwner);
        return true;
    }
}