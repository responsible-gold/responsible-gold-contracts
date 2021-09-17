pragma solidity 0.4.15;
import './RGOrganizationPrototype_v9.sol';

contract FakeOrganizationPrototype_v9 is RGOrganizationPrototype_v9 {
    modifier onlySigned() {
        _;
    }
}
