pragma solidity 0.4.15;

import '../../OwnedPrototype.sol';

contract RGAccountPrototype_v8 is OwnedPrototype {
    address public destination;

    function RGAccountPrototype_v8() {
        constructAccount(0x1);
    }

    function constructAccount(address _organization) returns(bool) {
        require(super.constructOwned(_organization));
        return true;
    }

    /**
     * Forwards call to the rgManager contract.
     *
     * @param _to is rgManager contract
     * @param _value eth value
     * @param _data data that will be sent to rgManager contract (i.e: rgManager.spend(receiver, amount, channel, 'comment'))
     * @param _revertOnFailedCall will revert when true;
     *
     */
    function forward(address _to, uint _value, bytes _data, bool _revertOnFailedCall) onlyContractOwner() {
        assembly {
            let res := call(gas, _to, _value, add(_data, 32), mload(_data), 0, 0)
            let revertOnFailedCall := _revertOnFailedCall
            returndatacopy(0, 0, returndatasize)
            switch and(revertOnFailedCall, iszero(res)) case 1 { revert(0, returndatasize) } default { return(0, returndatasize) }
        }
    }

}
