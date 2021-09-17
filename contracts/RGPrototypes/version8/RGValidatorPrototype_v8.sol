pragma solidity 0.4.15;

contract RGValidatorPrototype_v8 {
    event Error(bytes32 error);
    event CalledTransactions(uint count);

    function forwardCalls(
        address[11] _addresses, bytes _data1,
        bytes _data2, bytes _data3,
        bytes _data4, bytes _data5,
        bytes _data6, bytes _data7,
        bytes _data8, bytes _data9,
        bytes _data10, bytes _data11
    ) returns(bool) {
        uint txCount;

        if (_addresses[0] != 0x0) {
            _assemblyCall(_addresses[0], _data1);
            txCount++;
        }
        if (_addresses[1] != 0x0) {
            _assemblyCall(_addresses[1], _data2);
            txCount++;
        }
        if (_addresses[2] != 0x0) {
            _assemblyCall(_addresses[2], _data3);
            txCount++;
        }
        if (_addresses[3] != 0x0) {
            _assemblyCall(_addresses[3], _data4);
            txCount++;
        }
        if (_addresses[4] != 0x0) {
            _assemblyCall(_addresses[4], _data5);
            txCount++;
        }
        if (_addresses[5] != 0x0) {
            _assemblyCall(_addresses[5], _data6);
            txCount++;
        }
        if (_addresses[6] != 0x0) {
            _assemblyCall(_addresses[6], _data7);
            txCount++;
        }
        if (_addresses[7] != 0x0) {
            _assemblyCall(_addresses[7], _data8);
            txCount++;
        }
        if (_addresses[8] != 0x0) {
            _assemblyCall(_addresses[8], _data9);
            txCount++;
        }
        if (_addresses[9] != 0x0) {
            _assemblyCall(_addresses[9], _data10);
            txCount++;
        }
        if (_addresses[10] != 0x0) {
            _assemblyCall(_addresses[10], _data11);
            txCount++;
        }
        CalledTransactions(txCount);
        return true;
    }

    function _assemblyCall(address _destination, bytes _data) internal {
        assembly {
            let res := call(gas, _destination, 0, add(_data, 32), mload(_data), 0, 0)
            returndatacopy(0, 0, returndatasize)
            switch res case 0 { revert(0, returndatasize) } default {}
        }
    }
}
