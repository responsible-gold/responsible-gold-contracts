pragma solidity 0.4.15;
import '../../Interfaces/RGRuleAuthorizerInterface.sol';
import '../../Interfaces/RGAccountInterface.sol';
import '../../Interfaces/RGOrganizationFactoryInterface.sol';
import '../../Interfaces/RGOrganizationInterface.sol';


contract RGOrganizationPrototype_v9 is RGOrganizationInterface {
    address public organizationFactory;
    mapping(address => bool) public companyUsers;
    mapping(address => bool) public companyAccounts;
    RGRuleAuthorizerInterface public ruleAuthorizer;
    mapping(address => bool) public deactivatedUsers;

    event Error(bytes32 error);
    event OrganizationFactoryChanged(address newFactory);
    event AccountCreated(address account);
    event UserAdded(address userAdded);
    event UserRemoved(address userRemoved);
    event UserDeactivated(address user);
    event UserActivated(address user);

    modifier onlyOrganizationUser() {
        if (!companyUsers[msg.sender]) {
            Error('Caller is not a company user');
            return;
        }
        _;
    }

    /**
     * Only signed transactions
     * Returns (true, true) when success and all signs are collected.
     * Returns (true, false) when success and not all signs are collected.
     * Returns (false, false) when failed and not all signs are collected.
     */
    modifier onlySigned() {
        bytes32 data = keccak256(msg.data);
        bytes32 internalId = bytes32(msg.sender);
        bool success;
        bool isLastConsumption;

        (success, isLastConsumption) = ruleAuthorizer.consumeOperation(data, internalId);
        if (!success) {
            Error('Tx is not signed');
            return;
        }

        if (!isLastConsumption) {
            Error('Not all signatures collected');
            return;
        }
        _;
    }

    function RGOrganizationPrototype_v9() {
        constructOrganization(0x1, RGRuleAuthorizerInterface(0x1), 0x1);
    }

    function constructOrganization(address _organizationFactory, RGRuleAuthorizerInterface _ruleAuthorizer, address _user) returns(bool) {
        if (address(ruleAuthorizer) != 0x0) {
            Error('Organization already constructed');
            return false;
        }

        organizationFactory = _organizationFactory;
        ruleAuthorizer = _ruleAuthorizer;
        //add 1st user
        companyUsers[_user] = true;
        UserAdded(_user);
        return true;
    }

    function updateOrganizationFactory(address _newOrganizationFactory) onlyOrganizationUser() onlySigned() returns(bool) {
        if (_newOrganizationFactory == 0x0) {
            Error('New companyFactory is not valid');
            return false;
        }

        organizationFactory = _newOrganizationFactory;
        OrganizationFactoryChanged(organizationFactory);
        return true;
    }

    function addUser(address _address) onlyOrganizationUser() onlySigned() returns(bool) {
        if (_address == 0x0) {
            Error('Address is not valid');
            return false;
        }

        if (companyUsers[_address]) {
            Error('Already organization user');
            return false;
        }

        companyUsers[_address] = true;
        UserAdded(_address);
        return true;
    }

    function removeUser(address _address) onlyOrganizationUser() onlySigned() returns(bool) {
        if (!companyUsers[_address]) {
            Error('Is not an organization user');
            return false;
        }

        companyUsers[_address] = false;
        UserRemoved(_address);
        return true;
    }

    function deactivateUser(address _address) onlyOrganizationUser() onlySigned() returns(bool) {
        if (!companyUsers[_address]) {
            Error('Is not an organization user');
            return false;
        }

        if (deactivatedUsers[_address]) {
            Error('User deactivated');
            return false;
        }

        companyUsers[_address] = false;
        deactivatedUsers[_address] = true;
        UserDeactivated(_address);
        return true;
    }

    function removeDeactivatedUser(address _address) onlyOrganizationUser() onlySigned() returns(bool) {
        if (!deactivatedUsers[_address]) {
            Error('Address activated or not user');
            return false;
        }

        deactivatedUsers[_address] = false;
        UserRemoved(_address);
        return true;
    }

    function activateUser(address _address) onlyOrganizationUser() onlySigned() returns(bool) {
        if (!deactivatedUsers[_address]) {
            Error('Address activated or not user');
            return false;
        }

        deactivatedUsers[_address] = false;
        companyUsers[_address] = true;
        UserActivated(_address);
        return true;
    }

    /**
     * Creates new organization account via RGOrganizationFactory contract
     *
     * @return success.
     */
    function createAccount() onlyOrganizationUser() onlySigned() returns(bool) {
        address account = RGOrganizationFactoryInterface(organizationFactory).deployAccount();
        RGAccountInterface(account).constructAccount(this);

        companyAccounts[account] = true;
        AccountCreated(account);
        return true;
    }

    /**
     * Forwards call to the account contract.
     *
     * @param _from organization account address
     * @param _to is rgManager contract
     * @param _value eth value
     * @param _data data that will be sent to rgManager contract (i.e: rgManager.spend(receiver, amount, channel, 'comment'))
     * @param _revertOnFailedCall will revert when true;
     *
     */
    function forward(address _from, address _to, uint _value, bytes _data, bool _revertOnFailedCall) onlyOrganizationUser() onlySigned() returns(bool) {
        if (!companyAccounts[_from]) {
            Error('Address from is not an account');
            return false;
        }

        RGAccountInterface(_from).forward(_to, _value, _data, _revertOnFailedCall);
        _returnData();
    }

    function _returnData() internal {
        assembly {
            returndatacopy(0, 0, returndatasize)
            return(0, returndatasize)
        }
    }
}
