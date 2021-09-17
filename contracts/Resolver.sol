pragma solidity 0.4.15;

contract RouterInterface {
    function getPrototype() constant returns(address);
}

contract Resolver {
    function () payable {
        //Router address
        address _implementation = RouterInterface(0xcafecafecafecafecafecafecafecafecafecafe).getPrototype();
        assembly {
            let calldatastart := msize()
            mstore(0x40, add(calldatastart, calldatasize))
            calldatacopy(calldatastart, 0, calldatasize)
            let res := delegatecall(div(mul(gas, 63), 64), _implementation, calldatastart, calldatasize, 0, 0)
            let returndatastart := msize()
            mstore(0x40, add(returndatastart, returndatasize))
            returndatacopy(returndatastart, 0, returndatasize)
            switch res case 0 { revert(returndatastart, returndatasize) } default { return(returndatastart, returndatasize) }
        }
    }
}