pragma solidity 0.4.15;

import '../../OwnedPrototype.sol';
import '../../Interfaces/RGRuleAuthorizerInterface.sol';

contract RGRuleAuthorizerPrototype_v9 is OwnedPrototype, RGRuleAuthorizerInterface {
    struct Operation {
        bytes32 hash;
        uint id;
    }

    mapping(address => mapping(bytes32 => Operation)) public operations;
    mapping(bytes32 => mapping(uint => uint)) public consumptionsRequired;
    mapping(address => mapping(uint => bool)) public usedNonces;
    address public authorizer;

    event Error(bytes32 error);
    event Warning(bytes32 warning);
    event Confirmation(bytes32 operationHash, address consumer, bytes32 consumerInternalId, uint operationId);
    event Consumption(bytes32 operationHash, address consumer, bytes32 consumerInternalId, uint operationId, uint consumptionsLeft);
    event AuthorizerSet(address authorizerAddress);

    function RGRuleAuthorizerPrototype_v9() {
        constructRuleAuthorizer(0x1);
    }

    function constructRuleAuthorizer(address _owner) returns(bool) {
        require(super.constructOwned(_owner));
        return true;
    }

    function setRuleAuthorizer(address _authorizer) onlyContractOwner() returns(bool) {
        if (_authorizer == 0x0) {
            Error('Authorizer is not valid');
            return false;
        }
        
        authorizer = _authorizer;
        AuthorizerSet(_authorizer);
        return true;
    }

    function confirm(
        bytes32 _operationHash,
        address _consumer,
        bytes32 _consumerInternalId,
        uint _operationId,
        uint _consumptionsRequired,
        uint _nonce,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        returns(bool)
    {
        bytes32 signedHash = keccak256(
            _operationHash,
            _consumer,
            _consumerInternalId,
            _operationId,
            _consumptionsRequired,
            address(this),
            _nonce,
            msg.sender
        );
        address recoveredAuthorizer = ecrecover(signedHash, _v, _r, _s);
        if (recoveredAuthorizer == 0x0) {
            Error('Recovered Authorizer isn\'t valid');
            return false;
        }
        if (usedNonces[_consumer][_nonce] == true) {
            Error('Used nonce provided');
            return false;
        }
        usedNonces[_consumer][_nonce] = true;

        return _confirmByAuthorizer(
            _operationHash,
            _consumer,
            _consumerInternalId,
            _operationId,
            _consumptionsRequired,
            recoveredAuthorizer
        );
    }

    function confirmByAuthorizer(
        bytes32 _operationHash,
        address _consumer,
        bytes32 _consumerInternalId,
        uint _operationId,
        uint _consumptionsRequired
    )
        returns(bool)
    {
        return _confirmByAuthorizer(
            _operationHash,
            _consumer,
            _consumerInternalId,
            _operationId,
            _consumptionsRequired,
            msg.sender
        );
    }

    function _confirmByAuthorizer(
        bytes32 _operationHash,
        address _consumer,
        bytes32 _consumerInternalId,
        uint _operationId,
        uint _consumptionsRequired,
        address _authorizer
    )
        internal returns(bool)
    {
        if (_authorizer != authorizer) {
            Error('Provided address isn\'t signer');
            return false;
        }
        operations[_consumer][_consumerInternalId].hash = _operationHash;
        operations[_consumer][_consumerInternalId].id = _operationId;
        if (consumptionsRequired[_operationHash][_operationId] == 0) {
            consumptionsRequired[_operationHash][_operationId] = _consumptionsRequired;
        }
        Confirmation(_operationHash, _consumer, _consumerInternalId, _operationId);
        return true;
    }

    function consumeOperation(
        bytes32 _operationHash,
        bytes32 _consumerInternalId
    )
        returns(bool success, bool isLastConsumption)
    {
        if (operations[msg.sender][_consumerInternalId].hash != _operationHash) {
            Error('Operation was not signed');
            return (false, false);
        }
        uint operationId = operations[msg.sender][_consumerInternalId].id;
        delete operations[msg.sender][_consumerInternalId];
        consumptionsRequired[_operationHash][operationId] -= 1;

        Consumption(_operationHash, msg.sender, _consumerInternalId, operationId, consumptionsRequired[_operationHash][operationId]);
        if (consumptionsRequired[_operationHash][operationId] == 0) {
            return (true, true);
        }
        Warning('Not all signatures collected');
        return (true, false);
    }
}
