pragma solidity 0.4.15;

import '../OwnedPrototype.sol';

contract RGProxyPrototype is OwnedPrototype {
    event EtherAccepted(address from, uint amount);
    event Error(bytes32 message);

    function () payable {
        if (msg.value != 0) {
            EtherAccepted(msg.sender, msg.value);
        }
    }

    function forward(
        address _destination,
        uint _value,
        bytes _data,
        bool _throwOnFailedCall
    )
        onlyContractOwner()
    {
        assembly {
            let res := call(div(mul(gas, 63), 64), _destination, _value, add(_data, 32), mload(_data), 0, 0)
            let returndatastart := msize()
            mstore(0x40, add(returndatastart, returndatasize))
            returndatacopy(returndatastart, 0, returndatasize)
            switch and(_throwOnFailedCall, iszero(res)) case 1 { revert(returndatastart, returndatasize) } default {}
            switch iszero(res) case 1 {} default { return(returndatastart, returndatasize) }
        }
        Error('External call failed');
    }
}