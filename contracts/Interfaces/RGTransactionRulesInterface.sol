pragma solidity 0.4.15;

contract RGTransactionRulesInterface {
    function isTransferAllowed(address _from, address _to, uint _value, address _txSender) returns(bool);
}