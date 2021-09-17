pragma solidity 0.4.15;

contract BaseDeployer {
    // 0000000000000000000000000000000000000000 - placeholder of clone's prototype constant.
    // There is 54 bytes to the left. So when the bytecode for the clone contract is loaded into memory the layout is as follows:
    // 32 bytes of lengthOfTheBytecode, then first 54 bytes of bytecode, then 20 bytes of placeholder, then the rest of the bytecode.
    // ...|00000000000000000000000000000000000000000000000000000000000000e6|54 bytes of bytecode|0000000000000000000000000000000000000000|...
    function _deployClone(address resolverAddress) internal returns(address) {
        address result;
        //Bytecode is pasted here manually without the trailing 43 bytes of metadata. Remember to update bytecode length marker.
        bytes memory scaffold = hex'60606040523415600e57600080fd5b5b60568061001d6000396000f30060606040525b5b59368101604052366000823760008036837300000000000000000000000000000000000000006040603f5a0204f4593d81016040523d6000823e818015604a573d82f35b3d82fd5b505050505b0000';
        bytes32 shiftedAddress = bytes32(resolverAddress) << 96;
        assembly {
            //Reading 32 bytes of bytecode skipping the 32 bytes length cell and 54 bytes of code before marker.
            let placeholder := mload(add(scaffold, 86))
            //placeholder is 0000000000000000000000000000000000000000************************
            let replace := or(shiftedAddress, placeholder)
            //replace is     clonableAddressClonableAddressClonableAd************************
            mstore(add(scaffold, 86), replace)
            result := create(0, add(scaffold, 32), mload(scaffold))
        }
        return result;
    }
}
