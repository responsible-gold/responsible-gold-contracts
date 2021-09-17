pragma solidity 0.4.15;
import './RGOrganizationPrototype_v10.sol';

contract FakeOrganizationPrototype_v10 is RGOrganizationPrototype_v10 {
    modifier onlySigned() {
        _;
    }
}
