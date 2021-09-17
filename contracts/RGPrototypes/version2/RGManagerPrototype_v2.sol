pragma solidity 0.4.15;

import {RGAssetOwnershipCardPrototype_v2 as RGAssetOwnershipCard} from './RGAssetOwnershipCardPrototype_v2.sol';
import '../../OwnedPrototype.sol';
import {ERC20Interface as ERC20} from '../../Interfaces/ERC20Interface.sol';

contract RGAssetOwnershipCardCloneFactoryInterface {
    function deploy() returns(RGAssetOwnershipCard);
}

/**
 * @title RG manager contract with ERC20 interface implementation.
 *
 * Main contract with possibility to deploy, store Ownership cards and transfer Gcoins.
 *
 * Note: all the non constant functions return false instead of throwing in case if state change
 * didn't happen yet.
 */
contract RGManagerPrototype_v2 is ERC20, OwnedPrototype {
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

    //Events
    event Error(bytes32 error);
    event Deployed(address rgAssetOwnershipCardAddress, string chip, uint coins);
    event Minted(address rgAssetOwnershipCardAddress, address owner, uint coins);
    event MigrationStatusSet(bool value);

    modifier onlyOwner() {
        if (msg.sender != contractOwner) {
            Error('Deploy is not allowed for caller');
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

    modifier notUnderMigration() {
        if (underMigration) {
            Error('Contract is under migration');
            return;
        }
        _;
    }

    function RGManagerPrototype_v2() {
        constructRGManager(0x1, 0, RGAssetOwnershipCardCloneFactoryInterface(0x0));
    }

    /**
     * Sets rgOwner address, GCoins divisibility factor and clone factory
     *
     */
    function constructRGManager(address _owner, uint8 _baseUnit, RGAssetOwnershipCardCloneFactoryInterface _cloneFactory) returns(bool) {
        require(super.constructOwned(_owner));
        baseUnit = _baseUnit;
        cloneFactory = _cloneFactory;
        cardId = 1;
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
        RGAssetOwnershipCard rgAssetOwnershipCard = _deployRGAssetCard(_chip, _totalCoins, _coinsOwner);
        _mint(rgAssetOwnershipCard, _coinsOwner, _totalCoins);

        return true;
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
        userRGAssetOwnershipCards[_gCoinsOwner].push(rgAssetOwnershipCard);
        userRGAssetOwnershipCardPosition[_gCoinsOwner][address(rgAssetOwnershipCard)] = userRGAssetOwnershipCards[_gCoinsOwner].length;
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
    function transfer(address _to, uint _value) notUnderMigration() returns(bool success) {
        if (balances[msg.sender] < _value) {
            Error('Not enough balance for transfer');
            return false;
        }

        if (balances[_to] + _value < balances[_to]) {
            Error('Overflow');
            return false;
        }

        _transferACcoins(msg.sender, _to, _value);

        balances[msg.sender] -= _value;
        balances[_to] += _value;
        Transfer(msg.sender, _to, _value);
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
    function transferFrom(address _from, address _to, uint _value) notUnderMigration() returns(bool success) {
        if (balances[_from] < _value) {
            Error('Not enough balance for transfer');
            return false;
        }

        if (balances[_to] + _value < balances[_to]) {
            Error('Overflow');
            return false;
        }

        if (allowances[_from][msg.sender] < _value) {
            Error('Allowance is not enough');
            return false;
        }

        _transferACcoins(_from, _to, _value);

        balances[_from] -= _value;
        allowances[_from][msg.sender] -= _value;
        balances[_to] += _value;
        Transfer(_from, _to, _value);
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
                userRGAssetOwnershipCards[_to].push(rgAssetOwnershipCard);
                userRGAssetOwnershipCardPosition[_to][rgAssetOwnershipCard] = userRGAssetOwnershipCards[_to].length;
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
        return userRGAssetOwnershipCards[_owner].length;
    }

    /**
     * Transfer holder's available coins on specific RGAC, can be called only from RGAC with minted GCoins
     *
     * @param _from holder address to take from.
     * @param _to holder address to give to.
     * @param _value amount to transfer.
     *
     */
    function callbackTransfer(address _from, address _to, uint _value) notUnderMigration() returns(bool success) {
        RGAssetOwnershipCard rgAssetOwnershipCard = RGAssetOwnershipCard(msg.sender);

        //Only if user has positive balance in RGAC and GCoins are minted for this AC
        if (userRGAssetOwnershipCardPosition[_from][rgAssetOwnershipCard] == 0) {
            Error('Sender hasnt balance in RGAC');
            return false;
        }

        //Ask for transfer AC coins via managed transfer on RGAC
        require(rgAssetOwnershipCard.managedTransfer(_from, _to, _value));

        //If all sender's coins were sent via managedTransfer, it deletes record from userRGAssetOwnershipCards array of AC
        if (rgAssetOwnershipCard.balanceOf(_from) == 0) {
            uint fromPositionInRGACArray = userRGAssetOwnershipCardPosition[_from][rgAssetOwnershipCard];

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
            userRGAssetOwnershipCardPosition[_from][rgAssetOwnershipCard] = 0;
        }

        //If receiver gets coins from this RGAC in first time, add a record to the userRGAssetOwnershipCards
        if (userRGAssetOwnershipCardPosition[_to][rgAssetOwnershipCard] == 0 && _value > 0) {
            userRGAssetOwnershipCards[_to].push(rgAssetOwnershipCard);
            userRGAssetOwnershipCardPosition[_to][rgAssetOwnershipCard] = userRGAssetOwnershipCards[_to].length;
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

    /**
     * Migrate old chips from bytest32 to string
     *
     * @param _chipToMigrate old bytes32 chip
     * @param _chip new string chip
     *
     */
    function migrationMigrateChips(bytes32 _chipToMigrate, string _chip) onlyOwner() returns(bool) {
        if (rGAssetOwnershipCardChips[_chipToMigrate] == 0x0) {
            Error('Chip is migrated or missing');
            return false;
        }

        address rgAssetOwnershipCardAddress = rGAssetOwnershipCardChips[_chipToMigrate];
        rGAssetOwnershipCardChips[keccak256(_chip)] = rgAssetOwnershipCardAddress;
        RGAssetOwnershipCard rgAssetOwnershipCard = RGAssetOwnershipCard(rgAssetOwnershipCardAddress);
        require(rgAssetOwnershipCard.migrationSetChip(_chip));
        delete rGAssetOwnershipCardChips[_chipToMigrate];
        return true;
    }

    function getAddressByChip(string _chip) constant returns(address) {
        return rGAssetOwnershipCardChips[keccak256(_chip)];
    }
}