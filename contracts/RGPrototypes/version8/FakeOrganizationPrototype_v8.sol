pragma solidity 0.4.15;
import './RGOrganizationPrototype_v8.sol';

contract FakeOrganizationPrototype_v8 is RGOrganizationPrototype_v8 {
    modifier onlySigned() {
        _;
    }
}
