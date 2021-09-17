pragma solidity 0.4.15;

contract RGAccountInterface {
    function constructAccount(address _organization) returns(bool);
    function forward(address _to, uint _value, bytes _data, bool _revertOnFailedCall);
}