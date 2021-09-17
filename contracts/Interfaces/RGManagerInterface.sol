pragma solidity 0.4.15;

contract RGManagerInterface {
    function callbackTransfer(address _from, address _to, address _txSender, uint _value, uint8 _channel, string _comment) returns(bool);
    function callbackTransferToInvoice(address _from, string _invoice, uint _value) returns(bool);
}