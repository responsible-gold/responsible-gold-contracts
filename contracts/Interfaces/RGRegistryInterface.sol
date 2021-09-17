pragma solidity 0.4.15;

contract RGRegistryInterface {
    function parse(bytes32 _icap) constant returns(address, bytes32, bool);
}
