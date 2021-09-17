pragma solidity 0.4.15;

import '../../OwnedPrototype.sol';

contract RGRuleAuthorizerPrototype_v7 is OwnedPrototype {
    struct Operation {
        bytes32 hash;
        bytes32 id;
    }

    mapping(address => mapping(bytes32 => Operation)) public operations;
    mapping(bytes32 => mapping(bytes32 => uint)) public consumptionsRequired;
    mapping(address => mapping(bytes32 => uint)) public nonces;
    address public authorizer;

    function RGRuleAuthorizerPrototype_v7() {
        constructRuleAuthorizer(0x1);
    }

    function constructRuleAuthorizer(address _owner) returns(bool) {
        require(super.constructOwned(_owner));
        return true;
    }

    function setRuleAuthorizer(address _authorizer) onlyContractOwner() returns(bool) {
        if (_authorizer == 0x0) {
            return false;
        }
        
        authorizer = _authorizer;
        return true;
    }

    function confirm(
        bytes32 _operationHash,
        address _consumer,
        bytes32 _consumerInternalId,
        bytes32 _operationId,
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
            return false;
        }
        if (nonces[_consumer][_consumerInternalId] >= _nonce) {
            return false;
        }
        nonces[_consumer][_consumerInternalId] = _nonce;
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
        bytes32 _operationId,
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
        bytes32 _operationId,
        uint _consumptionsRequired,
        address _authorizer
    )
        internal returns(bool)
    {
        if (_authorizer != authorizer) {
            return false;
        }
        operations[_consumer][_consumerInternalId].hash = _operationHash;
        operations[_consumer][_consumerInternalId].id = _operationId;
        if (consumptionsRequired[_operationHash][_operationId] == 0) {
            consumptionsRequired[_operationHash][_operationId] = _consumptionsRequired;
        }
        return true;
    }

    function consumeOperation(
        bytes32 _operationHash,
        bytes32 _consumerInternalId
    )
        returns(bool success, bool isLastConsumption)
    {
        if (operations[msg.sender][_consumerInternalId].hash != _operationHash) {
            return (false, false);
        }
        bytes32 operationId = operations[msg.sender][_consumerInternalId].id;
        delete operations[msg.sender][_consumerInternalId];
        consumptionsRequired[_operationHash][operationId] -= 1;
        if (consumptionsRequired[_operationHash][operationId] == 0) {
            return (true, true);
        }
        return (true, false);
    }
}
