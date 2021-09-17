pragma solidity 0.4.15;

contract RGRuleAuthorizerInterface {
    function setRuleAuthorizer(address _authorizer) returns(bool);
    function confirm(bytes32 _operationHash, address _consumer, bytes32 _consumerInternalId, uint _operationId, uint _consumptionsRequired, uint _nonce, uint8 _v, bytes32 _r, bytes32 _s) returns(bool);
    function confirmByAuthorizer(bytes32 _operationHash, address _consumer, bytes32 _consumerInternalId, uint _operationId, uint _consumptionsRequired) returns(bool);
    function consumeOperation(bytes32 _operationHash, bytes32 _consumerInternalId) returns(bool sucess, bool isLastConsumption);
}