pragma solidity 0.4.15;

import '../../OwnedPrototype.sol';
import '../../Interfaces/RGRuleAuthorizerInterface.sol';
import '../../Interfaces/RGTransactionRulesInterface.sol';

contract RGTransactionRulesPrototype_v10 is OwnedPrototype, RGTransactionRulesInterface {

    //whitelist
    mapping(address => bool) public whitelist;
    //RG rule authorizer contract
    RGRuleAuthorizerInterface public ruleAuthorizer;

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
    
    function RGTransactionRulesPrototype_v10() {
        constructTransactionRules(0x1);
    }

    function constructTransactionRules(address _owner) returns(bool) {
        require(super.constructOwned(_owner));
        return true;
    }

    function setRuleAuthorizer(RGRuleAuthorizerInterface _ruleAuthorizer) onlyContractOwner() returns(bool) {
        if (address(_ruleAuthorizer) == 0x0) {
            Error('Rule authorizer is not valid');
            return false;
        }

        if (address(ruleAuthorizer) != 0x0) {
            Error('Rule authorizer already set');
            return false;
        }

        ruleAuthorizer = _ruleAuthorizer;
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

    /**
    * Check is transfer allowed on rgManager in 3 steps:
    * Is origin in whitelist or not
    * If not in whitelist, is this transaction signed by rule authorizer
    */
    function isTransferAllowed(address _from, address _to, uint _value, address _txSender) returns(bool) {
        if (!whitelist[tx.origin]) {
            bytes32 data = keccak256(_from, _to, _value);
            bytes32 internalId = bytes32(_txSender);
            bool success;
            bool isLastConsumption;

            (success, isLastConsumption) = ruleAuthorizer.consumeOperation(data, internalId);
            if (!success) {
                Error('Origin isnt allowed for transfer');
                return false;
            }

            if (!isLastConsumption) {
                Error('Not all signatures collected');
                return false;
            }
        }

        return true;
    }
}
