pragma solidity 0.4.15;
import './ERC20Interface.sol';

contract RGAssetOwnershipCardInterface is ERC20Interface {
    function constructRGAssetOwnershipCard(string _chip, address _owner, uint _totalSupply, uint8 _baseUnit, address _rgManager) returns(bool);
    function managedTransfer(address _from, address _to, uint _value) returns(bool success);
}