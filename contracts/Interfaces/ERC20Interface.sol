pragma solidity 0.4.15;

contract ERC20Interface {
    event Transfer(address indexed from, address indexed to, uint value);
    event Approval(address indexed from, address indexed spender, uint value);

    function balanceOf(address _owner) constant returns(uint balance);
    function decimals() constant returns(uint8);
    function totalSupply() constant returns(uint);
    function transfer(address _to, uint _value) returns(bool success);
    function transferFrom(address _from, address _to, uint _value) returns(bool success);
    function approve(address _spender, uint _value) returns(bool success);
    function allowance(address _owner, address _spender) constant returns(uint remaining);
}