pragma solidity 0.4.15;

import '../helpers/BaseDeployer.sol';
import '../Interfaces/RGOrganizationFactoryInterface.sol';
import '../Interfaces/RGOrganizationInterface.sol';
import '../Interfaces/RGRuleAuthorizerInterface.sol';

contract RGOrganizationFactory is BaseDeployer, RGOrganizationFactoryInterface {
    address constant rgAccountResolverAddressPlaceholder = 0xcafecafecafecafecafecafecafecafecafecafe;
    address constant rgOrganizationResolverAddressPlaceholder = 0xfefefefefefefefefefefefefefefefefefefefe;
    address constant rgRuleAutorizerPlaceholder = 0xcacacacacacacacacacacacacacacacacacacaca;

    event OrganizationDeployed(address organization);
    event AccountDeployed(address account);

    function deployOrganization(address _organizationUser) returns(bool) {
        address organization = _deployClone(rgOrganizationResolverAddressPlaceholder);
        require(RGOrganizationInterface(organization).constructOrganization(this, RGRuleAuthorizerInterface(rgRuleAutorizerPlaceholder), _organizationUser));
        OrganizationDeployed(organization);
        return true;
    }

    function deployAccount() returns(address) {
        address account = _deployClone(rgAccountResolverAddressPlaceholder);
        AccountDeployed(account);
        return account;
    }
}