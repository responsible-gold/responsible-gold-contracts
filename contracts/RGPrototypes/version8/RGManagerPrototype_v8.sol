pragma solidity 0.4.15;

import {RGAssetOwnershipCardPrototype_v8 as RGAssetOwnershipCard} from './RGAssetOwnershipCardPrototype_v8.sol';
import '../../OwnedPrototype.sol';
import {ERC20Interface as ERC20} from '../../Interfaces/ERC20Interface.sol';

contract RGAssetOwnershipCardCloneFactoryInterface {
    function deploy() returns(RGAssetOwnershipCard);
}

contract RGTransactionRulesInterface {
    function isTransferAllowed(address _from, address _to, uint _value, address _txSender) returns(bool);
}

/**
 * @title RG manager contract with ERC20 interface implementation.
 *
 * Main contract with possibility to deploy, store Ownership cards and transfer Gcoins.
 *
 * Note: all the non constant functions return false instead of throwing in case if state change
 * didn't happen yet.
 */
contract RGManagerPrototype_v8 is ERC20, OwnedPrototype {
    //Counter for deployed ownership cards
    uint public cardId;
    //Total Supply of Gcoins in system
    uint internal _totalSupply;
    //Divisibility factor of GCoins
    uint8 public baseUnit;
    //symbol
    string constant public symbol = 'GCoin';
    //name
    string constant public name = 'Responsible Gold Coin';
    //RGAC clone factory
    RGAssetOwnershipCardCloneFactoryInterface public cloneFactory;
    //mapping of deployed Asset Ownership cards in system
    mapping(uint => RGAssetOwnershipCard) public rgAssetOwnershipCards;
    //mapping of user's balances with Gcoins
    mapping(address => uint) public balances;
    //mapping of user's allowances for transfering Gcoins
    mapping(address => mapping (address => uint)) public allowances;
    //mapping of RGAssetOwnershipCard where user has AC coins
    mapping(address => RGAssetOwnershipCard[]) public userRGAssetOwnershipCards;
    //1st index of RGAssetOwnershipCard where user has AC coins
    mapping(address => uint) public userRGAssetOwnershipCardsIndex;
    //mapping of RGAssetOwnershipCard addresses
    mapping(address => mapping (address => uint)) public userRGAssetOwnershipCardPosition;
    //mapping of unique asset card chips
    mapping(bytes32 => address) public rGAssetOwnershipCardChips;

    //migration flag
    bool public underMigration;
    //invoices mapping
    mapping(address => address) public userInvoice;

    //RG transaction rules
    RGTransactionRulesInterface public transactionRules;

    //Events
    event Error(bytes32 error);
    event Deployed(address rgAssetOwnershipCardAddress, string chip, uint coins);
    event Minted(address rgAssetOwnershipCardAddress, address owner, uint coins);
    event MigrationStatusSet(bool value);
    event Burned(address assetCard, uint value);
    event InvoiceCreated(address invoiceOwner, string invoice, address invoiceAddress, uint amount);
    event InvoiceCancelled(string invoice, address invoiceAddress, uint amount);
    event InvoiceSwapped(address rgAssetCard, address invoiceAddress, address barOwner, uint amount);
    event FullBarLocked(address rgAssetCard, address invoiceAddress, address barOwner, uint amount);
    event Spent(address from, address to, uint value, uint8 channel, string comment);

    modifier onlyOwner() {
        if (msg.sender != contractOwner) {
            Error('Call allowed only for owner');
            return;
        }
        _;
    }

    modifier onlyUnique(string _chip) {
        if (rGAssetOwnershipCardChips[keccak256(_chip)] != 0x0) {
            Error('AC with chip already exist');
            return;
        }
        _;
    }

    modifier notInvoice(address _address) {
        if (_isInvoice(_address)) {
            Error('Transfer to invoice not allowed');
            return;
        }
        _;
    }

    modifier notUnderMigration() {
        if (underMigration) {
            Error('Contract is under migration');
            return;
        }
        _;
    }

    modifier isTransferAllowed(address _from, address _to, uint _value, address _txSender) {
        if (!transactionRules.isTransferAllowed(_from, _to, _value, _txSender)) {
            Error('Transfer not allowed for sender');
            return;
        }
        _;
    }

    function RGManagerPrototype_v8() {
        constructRGManager(0x1, 0, RGAssetOwnershipCardCloneFactoryInterface(0x0), RGTransactionRulesInterface(0x0));
    }

    /**
     * Sets rgOwner address, GCoins divisibility factor and clone factory
     *
     */
    function constructRGManager(address _owner, uint8 _baseUnit, RGAssetOwnershipCardCloneFactoryInterface _cloneFactory, RGTransactionRulesInterface _transactionRules) returns(bool) {
        require(super.constructOwned(_owner));
        baseUnit = _baseUnit;
        cloneFactory = _cloneFactory;
        cardId = 1;
        transactionRules = _transactionRules;
        return true;
    }

    function setRGTransactionRules(RGTransactionRulesInterface _transactionRules) onlyOwner() returns(bool) {
        if (address(_transactionRules) == 0x0) {
            Error('Tx Rules address is not valid');
            return false;
        }

        transactionRules = _transactionRules;
        return true;
    }

    /**
     * Gets divisibility factor of GCoin
     * @return baseUnit.
     */
    function decimals() constant returns(uint8) {
        return baseUnit;
    }

    /**
     * Gets owner of RGManager
     * @return rgOwner.
     */
    function rgOwner() constant returns(address) {
        return contractOwner;
    }

    function totalSupply() constant returns(uint) {
        return _totalSupply;
    }

    /**
     * Deploys Ownership card with Gcoins generation
     *
     * Sets all generated Gcoins to the rgOwner
     *
     * @param _totalCoins Gcoins that should be generated
     * @param _chip unique identifier of RGAC in system. Sets only once on deploy step.
     * @param _coinsOwner address where coins will be moved.
     *
     * @return success.
     */
    function deploy(string _chip, uint _totalCoins, address _coinsOwner) onlyOwner() onlyUnique(_chip) notUnderMigration() returns(bool) {
        _deploy(_chip, _totalCoins, _coinsOwner);
        return true;
    }

    function _deploy(string _chip, uint _totalCoins, address _coinsOwner) internal {
        RGAssetOwnershipCard rgAssetOwnershipCard = _deployRGAssetCard(_chip, _totalCoins, _coinsOwner);
        _mint(rgAssetOwnershipCard, _coinsOwner, _totalCoins);
    }

    /**
     * Deploys Asset Ownership card without Gcoins generation
     *
     * Sets rgOwner as owner of all Asset ownership card coins
     *
     * @param _totalCoins Gcoins that should be generated
     * @param _chip unique identifier of RGAC in system. Sets only once on deploy step.
     * @param _assetCardOwner address where coins will be moved.
     *
     * @return success.
     */
    function deployWithoutGcoins(string _chip, uint _totalCoins, address _assetCardOwner) onlyOwner() onlyUnique(_chip) notUnderMigration() returns(bool) {
        _deployRGAssetCard(_chip, _totalCoins, _assetCardOwner);
        return true;
    }

    function _deployRGAssetCard(string _chip, uint _totalCoins, address _coinsOwner) internal returns(RGAssetOwnershipCard) {
        RGAssetOwnershipCard rgAssetOwnershipCard = cloneFactory.deploy();
        require(rgAssetOwnershipCard.constructRGAssetOwnershipCard(_chip, _coinsOwner, _totalCoins, baseUnit, this));

        rgAssetOwnershipCards[cardId] = rgAssetOwnershipCard;
        rGAssetOwnershipCardChips[keccak256(_chip)] = address(rgAssetOwnershipCard);

        Deployed(address(rgAssetOwnershipCard), _chip, _totalCoins);
        cardId++;
        return rgAssetOwnershipCard;
    }

    /**
     * Generate GCoins for specific Asset Ownership card in system
     *
     * @param _gCoinsOwner Address where GCoins will be generated
     * @param _chip unique identifier of RGAC in system. Sets only once on deploy step.
     *
     * @return success.
     */
    function mintGcoins(string _chip, address _gCoinsOwner) onlyOwner() notUnderMigration() returns(bool) {
        address rgAssetOwnershipCardAddress = rGAssetOwnershipCardChips[keccak256(_chip)];

        if (rgAssetOwnershipCardAddress == 0x0) {
            Error('RGAC does not exist');
            return false;
        }

        RGAssetOwnershipCard rgAssetOwnershipCard = RGAssetOwnershipCard(rgAssetOwnershipCardAddress);
        uint userBalance = rgAssetOwnershipCard.balanceOf(_gCoinsOwner);

        if (userBalance == 0) {
            Error('User doesnt have AC coins');
            return false;
        }

        if (userBalance != rgAssetOwnershipCard.totalSupply()) {
            Error('User owns not all AC coins');
            return false;
        }

        if (userRGAssetOwnershipCardPosition[_gCoinsOwner][rgAssetOwnershipCardAddress] != 0) {
            Error('Nothing to mint, GCoins minted');
            return false;
        } 

        _mint(rgAssetOwnershipCard, _gCoinsOwner, userBalance);
        return true;
    }

    function _mint(RGAssetOwnershipCard rgAssetOwnershipCard, address _gCoinsOwner, uint coinsToMint) internal {
        _addToUserCards(_gCoinsOwner, rgAssetOwnershipCard);
        balances[_gCoinsOwner] += coinsToMint;
        _totalSupply += coinsToMint;
        Minted(address(rgAssetOwnershipCard), _gCoinsOwner, coinsToMint);
        Transfer(0, _gCoinsOwner, coinsToMint);
    }

    /**
     * Gets Ownership card address
     *
     * @param _id ownership card Id
     *
     * @return address.
     */
    function getOwnershipCardAddress(uint _id) constant returns(address) {
        return address(rgAssetOwnershipCards[_id]);
    }

    /**
     * Gets Gcoins user balance
     *
     * @param _owner user address
     *
     * @return balance.
     */
    function balanceOf(address _owner) constant returns(uint) {
        return balances[_owner];
    }

    /**
     * Transfers user balance from the caller to specified receiver.
     *
     * @param _to holder address to give to.
     * @param _value amount to transfer.
     *
     * @return success.
     */
    function transfer(address _to, uint _value) returns(bool success) {
        return spend(_to, _value, 0, '');
    }

    function _transfer(address _from, address _to, uint _value) internal returns(bool success) {
        if (balances[_from] < _value) {
            Error('Not enough balance for transfer');
            return false;
        }

        if (balances[_to] + _value < balances[_to]) {
            Error('Overflow');
            return false;
        }

        _transferACcoins(_from, _to, _value);

        balances[_from] -= _value;
        balances[_to] += _value;
        Transfer(_from, _to, _value);
        return true;
    }

    function spend(address _to, uint _value, uint8 _channel, string _comment) returns(bool success) {
        return _spend(msg.sender, _to, _value, msg.sender, _channel, _comment);
    }

    function _spend(address _from, address _to, uint _value, address _txSender, uint8 _channel, string _comment) notUnderMigration() notInvoice(_to) isTransferAllowed(_from, _to, _value, _txSender) internal returns(bool success) {
        if (!_transfer(_from, _to, _value)) {
            return false;
        }

        Spent(_from, _to, _value, _channel, _comment);
        return true;
    }

    /**
     * Sets spending allowance for a specified spender.
     *
     * @param _spender holder address to set allowance to.
     * @param _value amount to allow.
     *
     * @return success.
     */
    function approve(address _spender, uint _value) notUnderMigration() returns (bool success) {
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
     * Performs allowance transfer of balance between holders.
     *
     * @param _from holder address to take from.
     * @param _to holder address to give to.
     * @param _value amount to transfer.
     *
     * @return success.
     */
    function transferFrom(address _from, address _to, uint _value) returns(bool success) {
        return spendFrom(_from, _to, _value, 0, '');
    }

    function spendFrom(address _from, address _to, uint _value, uint8 _channel, string _comment) returns(bool success) {
        if (allowances[_from][msg.sender] < _value) {
            Error('Allowance is not enough');
            return false;
        }

        if (!_spend(_from, _to, _value, msg.sender, _channel, _comment)) {
            return false;
        }

        allowances[_from][msg.sender] -= _value;
        return true;
    }

    /**
     * Transfer holder's available coins in RGAC with 1st in 1st out rule to the specific receiver. 
     *
     * @param _from holder address to take from.
     * @param _to holder address to give to.
     * @param _value amount to transfer.
     *
     */
    function _transferACcoins(address _from, address _to, uint _value) internal {
        //Go through all senders RGAC and transfer needed coins
        for (uint i = userRGAssetOwnershipCardsIndex[_from]; i < userRGAssetOwnershipCards[_from].length; i++) {
            RGAssetOwnershipCard rgAssetOwnershipCard = userRGAssetOwnershipCards[_from][i];

            //Add rgAssetOwnershipCard if user has coins on AC
            if (userRGAssetOwnershipCardPosition[_to][rgAssetOwnershipCard] == 0) {
                _addToUserCards(_to, rgAssetOwnershipCard);
            }

            uint rgAssetOwnershipCardBalance = rgAssetOwnershipCard.balanceOf(_from);

            //Delete sender's userRGAssetOwnershipCards if he sent all AC coins
            if (rgAssetOwnershipCardBalance <= _value) {
                delete userRGAssetOwnershipCards[_from][i];
                userRGAssetOwnershipCardPosition[_from][rgAssetOwnershipCard] = 0;
            }

            //If senders RGAC balance more than _value to transfer, make transfer and finish the action
            if (rgAssetOwnershipCardBalance >= _value) {
                require(rgAssetOwnershipCard.managedTransfer(_from, _to, _value));
                userRGAssetOwnershipCardsIndex[_from] = rgAssetOwnershipCardBalance == _value ? i + 1 : i;
                _value = 0;
                break;
            //If senders RGAC balance less than _value to transfer, move all available coins to the receiver,
            //decrease _value and go to the next senders RGAC
            } else {
                require(rgAssetOwnershipCard.managedTransfer(_from, _to, rgAssetOwnershipCardBalance));
                _value -= rgAssetOwnershipCardBalance;
            }
        }

        //_value to transer shoule be equal to 0 after all transers
        assert(_value == 0);
    }

    /**
     * Checks if user has coins in specific RGAC
     *
     * @param _owner supposed owner of RGAC coins
     * @param _assetCardAddress address of RGAC
     *
     * @return bool
     */
    function hasUserRGACcoinsInAssetCard(address _owner, address _assetCardAddress) constant returns(bool) {
        return userRGAssetOwnershipCardPosition[_owner][_assetCardAddress] != 0;
    }

    /**
     * Checks in how many RGAC user has coins
     *
     * @param _owner address of user
     *
     * @return count of RGAC
     */
    function getCountOfUsersRGAC(address _owner) constant returns(uint) {
        return userRGAssetOwnershipCards[_owner].length - userRGAssetOwnershipCardsIndex[_owner];
    }

    /**
     * Transfer holder's available coins on specific RGAC, can be called only from RGAC with minted GCoins
     *
     * @param _from holder address to take from.
     * @param _to holder address to give to.
     * @param _value amount to transfer.
     *
     */
    function callbackTransfer(address _from, address _to, address _txSender, uint _value, uint8 _channel, string _comment) notUnderMigration() notInvoice(_to) isTransferAllowed(_from, _to, _value, _txSender) returns(bool success) {
        if (!_callbackTransfer(_from, _to, _value, msg.sender)) {
            return false;
        }

        Spent(_from, _to, _value, _channel, _comment);
        return true;
    }

    function callbackTransferToInvoice(address _from, string _invoice, uint _value) returns(bool) {
        address invoice = address(keccak256(_invoice));
        if (!_callbackTransfer(_from, invoice, _value, msg.sender)) {
            return false;
        }
        userInvoice[invoice] = _from;
        FullBarLocked(msg.sender, invoice, _from, _value);
        return true;
    }

    function _callbackTransfer(address _from, address _to, uint _value, address _sender) internal returns(bool) {
        RGAssetOwnershipCard rgAssetOwnershipCard = RGAssetOwnershipCard(_sender);

        //Only if user has positive balance in RGAC and GCoins are minted for this AC
        if (userRGAssetOwnershipCardPosition[_from][rgAssetOwnershipCard] == 0) {
            Error('Sender hasnt balance in RGAC');
            return false;
        }

        //Ask for transfer AC coins via managed transfer on RGAC
        if (!rgAssetOwnershipCard.managedTransfer(_from, _to, _value)) {
            Error('managedTransfer failed');
            return false;
        }

        //If all sender's coins were sent via managedTransfer, it deletes record from userRGAssetOwnershipCards array of AC
        if (rgAssetOwnershipCard.balanceOf(_from) == 0) {
            _removeFromUserCards(_from, rgAssetOwnershipCard);
        }

        //If receiver gets coins from this RGAC in first time, add a record to the userRGAssetOwnershipCards
        if (userRGAssetOwnershipCardPosition[_to][rgAssetOwnershipCard] == 0 && _value > 0) {
            _addToUserCards(_to, rgAssetOwnershipCard);
        }

        balances[_from] -= _value;
        balances[_to] += _value;
        Transfer(_from, _to, _value);
        return true;
    }

    /**
     * allow/disallow using main features in contracts for migration process
     *
     * @param _value bool value for allowing/disallowing send main transactions
     *
     */
    function migrationSetMigrationLock(bool _value) onlyOwner() returns(bool) {
        underMigration = _value;
        MigrationStatusSet(_value);
        return true;
    }

    function getAddressByChip(string _chip) constant returns(address) {
        return rGAssetOwnershipCardChips[keccak256(_chip)];
    }

    function getUserBalancesInAssetCards(address _owner) constant returns(bytes32[4][]) {
        bytes32[4][] memory assetCards = new bytes32[4][](userRGAssetOwnershipCards[_owner].length - userRGAssetOwnershipCardsIndex[_owner]);

        uint k = 0;
        for (uint i = userRGAssetOwnershipCardsIndex[_owner]; i < userRGAssetOwnershipCards[_owner].length; i++) {
            RGAssetOwnershipCard rgAssetOwnershipCard = userRGAssetOwnershipCards[_owner][i];
            assetCards[k] = [
                bytes32(address(rgAssetOwnershipCard)),
                bytes32(rgAssetOwnershipCard.totalSupply()),
                bytes32(rgAssetOwnershipCard.balanceOf(_owner)),
                bytes32(rgAssetOwnershipCard.balanceOf(_owner) == rgAssetOwnershipCard.totalSupply() ? 1 : 0)
            ];

            k++;
        }
        return assetCards;
    }

    function redemptionBurnGcoins(address _rgAssetCard, string _invoice) notUnderMigration() onlyOwner() returns(bool) {
        address invoice = address(keccak256(_invoice));

        if (!_isInvoice(invoice)) {
            Error('Provided address is not invoice');
            return false;
        }

        RGAssetOwnershipCard rgAssetOwnershipCard = RGAssetOwnershipCard(_rgAssetCard);
        uint invoiceBalance = rgAssetOwnershipCard.balanceOf(invoice);

        if (rgAssetOwnershipCard.totalSupply() != invoiceBalance) {
            Error('Invoice owns not all coins of AC');
            return false;
        }

        require(rgAssetOwnershipCard.burnCoins(invoice));
        _removeFromUserCards(invoice, rgAssetOwnershipCard);

        Burned(_rgAssetCard, invoiceBalance);
        Transfer(invoice, 0x0, invoiceBalance);
        balances[invoice] -= invoiceBalance;
        _totalSupply -= invoiceBalance;
        userInvoice[invoice] = 0x0;
        return true;
    }

    function redemptionCancel(string _invoice) notUnderMigration() onlyOwner() returns(bool) {
        address invoice = address(keccak256(_invoice));
        uint invoiceBalance = balanceOf(invoice);

        if (!_isInvoice(invoice)) {
            Error('Provided address is not invoice');
            return false;
        }

        if (!_transfer(invoice, userInvoice[invoice], invoiceBalance)) {
            return false;
        }
        userInvoice[invoice] = 0x0;
        InvoiceCancelled(_invoice, invoice, invoiceBalance);
        return true;
    }

    function _addToUserCards(address _user, RGAssetOwnershipCard _rgAssetOwnershipCard) internal {
        userRGAssetOwnershipCards[_user].push(_rgAssetOwnershipCard);
        userRGAssetOwnershipCardPosition[_user][_rgAssetOwnershipCard] = userRGAssetOwnershipCards[_user].length;
    }

    function _removeFromUserCards(address _from, RGAssetOwnershipCard _rgAssetOwnershipCard) internal {
        uint fromPositionInRGACArray = userRGAssetOwnershipCardPosition[_from][_rgAssetOwnershipCard];

        //Delete usersAssetCard and move last user's assertcard to the current index
        delete userRGAssetOwnershipCards[_from][fromPositionInRGACArray - 1];

        uint fromACArrayLength = userRGAssetOwnershipCards[_from].length;

        //If deleted usersAssetCard record was not last, set last user's assert card to the deleted one
        if (fromACArrayLength > fromPositionInRGACArray) {
            RGAssetOwnershipCard lastCard = userRGAssetOwnershipCards[_from][fromACArrayLength - 1];
            //Move last user's assert card to the deleted one
            userRGAssetOwnershipCards[_from][fromPositionInRGACArray - 1] = lastCard;
            //Update position in array for moved users assert card
            userRGAssetOwnershipCardPosition[_from][lastCard] = fromPositionInRGACArray;
        }

        userRGAssetOwnershipCards[_from].length--;
        userRGAssetOwnershipCardPosition[_from][_rgAssetOwnershipCard] = 0;
    }

    function redemptionTransferToInvoice(string _invoice, uint _value) notUnderMigration() returns(bool) {
        address invoice = address(keccak256(_invoice));

        if (_isInvoice(invoice)) {
            Error('Invoice already exist');
            return false;
        }

        if (!_transfer(msg.sender, invoice, _value)) {
            return false;
        }

        userInvoice[invoice] = msg.sender;
        InvoiceCreated(msg.sender, _invoice, invoice, _value);
        return true;
    }

    function redemptionSwap(address _rgAssetCard, string _invoice, address _rgHotWallet) onlyOwner() notUnderMigration() returns(bool) {
        address invoice = address(keccak256(_invoice));
        uint balance = balanceOf(invoice);
        RGAssetOwnershipCard rgAssetOwnershipCard = RGAssetOwnershipCard(_rgAssetCard);

        if (!_isInvoice(invoice)) {
            Error('Provided address is not invoice');
            return false;
        }

        if (balance != rgAssetOwnershipCard.totalSupply()) {
            Error('Locked coins != to asset coins');
            return false;
        }

        if (rgAssetOwnershipCard.totalSupply() != rgAssetOwnershipCard.balanceOf(_rgHotWallet) + rgAssetOwnershipCard.balanceOf(invoice)) {
            Error('RGAC is not full for exchange');
            return false;
        }

        if (!_transfer(invoice, _rgHotWallet, balance)) {
            return false;
        }

        require(rgAssetOwnershipCard.managedTransfer(_rgHotWallet, invoice, balance));
        //add asset card to the users asset cards
        _addToUserCards(invoice, rgAssetOwnershipCard);

        InvoiceSwapped(address(rgAssetOwnershipCard), invoice, userInvoice[invoice], balance);
        return true;
    }

    function _isInvoice(address _invoice) internal returns(bool) {
        return userInvoice[_invoice] != 0x0;
    }
}