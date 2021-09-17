pragma solidity 0.4.15;

import '../../OwnedPrototype.sol';

contract RGTransactionRulesPrototype_v6 is OwnedPrototype {

    //whitelist
    mapping(address => bool) public whitelist;

    event Error(bytes32 error);
    event AddedToWhitelist(address addressAdded);
    event RemovedFromWhitelist(address addressRemoved);

    modifier onlyWallet() {
        if (!whitelist[tx.origin]) {
            Error('Origin isn\'t in whitelist');
            return;
        }
        _;
    }
    
    function RGTransactionRulesPrototype_v6() {
        constructTransactionRules(0x1);
    }

    function constructTransactionRules(address _owner) returns(bool) {
        require(super.constructOwned(_owner));
        return true;
    }

    function addToWhitelist(address _address) onlyContractOwner() returns(bool) {
        whitelist[_address] = true;
        AddedToWhitelist(_address);
        return true;
    }

    function removeFromWhitelist(address _address) onlyContractOwner() returns(bool) {
        whitelist[_address] = false;
        RemovedFromWhitelist(_address);
        return true;
    }

    function isTransferAllowed(address _from, address _to, uint _value, address _txSender) returns(bool) {
        if (!whitelist[tx.origin]) {
            Error('Origin isnt allowed for transfer');
            return false;
        }

        //todo add KYC
        return true;
    }
}