pragma solidity 0.4.15;

contract Clone {

    function () payable {
        assembly {
            let calldatastart := msize()
            mstore(0x40, add(calldatastart, calldatasize))
            calldatacopy(calldatastart, 0, calldatasize)
            //resolver address
            let res := delegatecall(div(mul(gas, 63), 64), 0xcafecafecafecafecafecafecafecafecafecafe, calldatastart, calldatasize, 0, 0)
            let returndatastart := msize()
            mstore(0x40, add(returndatastart, returndatasize))
            returndatacopy(returndatastart, 0, returndatasize)
            switch res case 0 { revert(returndatastart, returndatasize) } default { return(returndatastart, returndatasize) }
        }
    }
}