pragma solidity 0.4.15;

import {ERC20Interface as ERC20} from '../../Interfaces/ERC20Interface.sol';
import '../../OwnedPrototype.sol';

contract RGManagerInterface {
    function callbackTransfer(address _from, address _to, uint _value) returns(bool);
}

contract RGAssetOwnershipCardPrototype_v1 is ERC20, OwnedPrototype {

    //Total Supply of coins in Ownership card
    uint internal _totalSupply;
    //Divisibility factor of Ownership card. Same as on RG manager contract
    uint8 public baseUnit;
    //Transfers allowed only from rgManager caller
    address public rgManagerAddress;
    //RGAC unigue chip
    bytes32 public chip;

    //mapping of user's balances with OC coins
    mapping(address => uint) public balances;
    //mapping of user's allowances for transfering OC coins
    mapping(address => mapping (address => uint)) public allowances;

    event Error(bytes32 error);

    modifier onlyRGManager() {
        if (msg.sender != rgManagerAddress) {
            Error('Caller isnt RGmanager contract');
            return;
        }
        _;
    }

    modifier enoughBalance(address _user, uint _value) {
        if (balances[_user] < _value) {
            Error('Not enough balance for transfer');
            return;
        }
        _;
    }

    modifier notOverflow(address _user, uint _value) {
        if (balances[_user] + _value < balances[_user]) {
            Error('Overflow');
            return;
        }
        _;
    }

    function RGAssetOwnershipCardPrototype_v1() {
        constructRGAssetOwnershipCard('chip', 0x1, 0, 8, 0x0);
    }

    /**
     * Generates Asset Ownership card and sets all coins to the creator
     *
     * @param _initialSupply OC coins that should be generated
     * @param _baseUnit divisibility factor
     * @param _chip unique identifier of RGAC in system. Sets only once on deploy step.
     * @param _owner Owner of RGAC and all coins on deployment step.
     * @param _rgManager Address of main contract.
     *
     */
    function constructRGAssetOwnershipCard(bytes32 _chip, address _owner, uint _initialSupply, uint8 _baseUnit, address _rgManager) returns(bool) {
        require(super.constructOwned(_owner));
        baseUnit = _baseUnit;
        balances[_owner] = _initialSupply;
        _totalSupply = _initialSupply;
        rgManagerAddress = _rgManager;
        chip = _chip;
        Transfer(0, _owner, _initialSupply);
        return true;
    }

    /**
     * Gets OC coins user balance
     *
     * @param _owner user address
     *
     * @return balance.
     */
    function balanceOf(address _owner) constant returns(uint) {
        return balances[_owner];
    }

    function totalSupply() constant returns(uint) {
        return _totalSupply;
    }

    /**
     * Gets divisibility factor of GCoin
     * @return baseUnit.
     */
    function decimals() constant returns(uint8) {
        return baseUnit;
    }

    /**
     * Transfer balance from sender to specific receiver via main RG manager contract
     *
     * @param _from holder address to take from.
     * @param _to holder address to give to.
     * @param _value amount to transfer.
     *
     * @return success.
     */
    function managedTransfer(address _from, address _to, uint _value) onlyRGManager() enoughBalance(_from, _value) notOverflow(_to, _value) returns(bool success) {
        
        balances[_from] -= _value;
        balances[_to] += _value;
        Transfer(_from, _to, _value);
        return true;
    }

    /**
     * Pending contract owner accepts his ownership of RGAC and receives all coins from previous owner
     * @return success.
     */
    function claimContractOwnership() returns(bool success) {
        var value = balances[contractOwner];

        if (balances[contractOwner] != _totalSupply) {
            Error('Owner doesnt have all AC coins');
            return false;
        }
        address newOwner = pendingContractOwner;
        address oldOwner = contractOwner;

        require(super.claimContractOwnership());
        
        balances[oldOwner] -= value;
        balances[newOwner] += value;
        Transfer(oldOwner, newOwner, value);
        return true;
    }

    /**
     * Transfers user balance from the caller to specified receiver through RGManager contract.
     *
     * @param _to holder address to give to.
     * @param _value amount to transfer.
     *
     * @return success.
     */
    function transfer(address _to, uint _value) returns(bool success) {
        return RGManagerInterface(rgManagerAddress).callbackTransfer(msg.sender, _to, _value);
    }

    /**
     * Sets spending allowance for a specified spender.
     *
     * @param _spender holder address to set allowance to.
     * @param _value amount to allow.
     *
     * @return success.
     */
    function approve(address _spender, uint _value) returns (bool success) {
        allowances[msg.sender][_spender] = _value;
        Approval(msg.sender, _spender, _value);
        return true;
    }

    /**
     * Returns allowance from one holder to another.
     *
     * @param _owner holder that allowed spending.
     * @param _spender holder that is allowed to spend.
     *
     * @return holder to spender allowance.
     */
    function allowance(address _owner, address _spender) constant returns(uint remaining) {
        return allowances[_owner][_spender];
    }

    /**
     * Performs allowance transfer of balance between holders through RGManager contract.
     *
     * @param _from holder address to take from.
     * @param _to holder address to give to.
     * @param _value amount to transfer.
     *
     * @return success.
     */
    function transferFrom(address _from, address _to, uint _value) returns(bool success) {
        if (allowances[_from][msg.sender] < _value) {
            Error('Allowance is not enough');
            return false;
        }

        if (!RGManagerInterface(rgManagerAddress).callbackTransfer(_from, _to, _value)) {
            return false;
        }

        allowances[_from][msg.sender] -= _value;
        return true;
    }
}