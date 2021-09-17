pragma solidity 0.4.15;

import './RGRuleAuthorizerInterface.sol';

contract RGOrganizationInterface {
    function constructOrganization(address _organizationFactory, RGRuleAuthorizerInterface _ruleAuthorizer, address _organizationUser) returns(bool);
}