pragma solidity 0.4.15;

import './RGSmartAccount_v10.sol';
import '../../Interfaces/ERC20Interface.sol';

/// @title RG Smart Account Manager
/// @notice Contains functionality of RGSA Manger.
contract RGSmartAccountManager_v10 {
    ///@notice counter of account hashes
    mapping(uint256 => bytes32) public accounts;
    ///@notice number of excisting accounts
    uint256 public totalAccounts;

    ///@notice accoutn hash to RGSA
    mapping(bytes32 => RGSmartAccount_v10) private idToAccount;

    event AccountInitialized(string indexed accountName, address admin);
    event AccountReset(string indexed accountName, uint totalSigners);
    event AdminReset(string indexed accountName, address newAdmin);
    event Distribution(address indexed token);
    event Error(bytes32 error);

    ///@notice Creates account with custom name
    ///@dev The whole distribution will be transfered to the owner
    ///@param name Custom name of RGSA
    function initAccount(string name) external returns(bool){
        bytes32 seed = sha256(name, msg.sender);
        if(address(idToAccount[seed]) != 0x0){
            Error('Account already excist');
            return false;
        };
        RGSmartAccount_v10 account = new RGSmartAccount_v10(name, 'RGSA', 2);
        account.transfer(msg.sender, account.totalSupply());
        accounts[totalAccounts] = seed;
        idToAccount[seed] = account;
        uint256 _totalAccounts = totalAccounts;
        totalAccounts++;
        require(totalAccounts > _totalAccounts);
        AccountInitialized(name, msg.sender);
        return true;
    }

    ///@notice Resets account distribution
    ///@dev Collect all the distribution from account users and distributes it again using provided configuration. 
    ///@param name Account name
    ///@param signers New signers. Must be the same length as distribution
    ///@param distribution New distribution. Must be the same length as signers
    function resetAccount(string name, address[] signers, uint256[] distribution) external returns(bool){
        bytes32 seed = sha256(name, msg.sender);
        RGSmartAccount_v10 account = idToAccount[seed];
        if(address(account)==0x0){
            Error('Account does not excist');
            return false;
        }
        account.burn(account.totalSupply());
        for(uint256 i = 0; i < signers.length; i++){
            account.transfer(signers[i], distribution[i]);
        }
        require(account.balanceOf(address(this)) == 0);
        AccountReset(name, signers.length);
        return true;
    }

    ///@notice Pass ownership to another address
    ///@dev Previous owner will not be able to roll back the operation
    ///@param name Account name
    ///@param newAdmin New admin address
    function resetAdmin(string name, address newAdmin) external returns(bool){
        bytes32 seed = sha256(name, msg.sender);
        if(address(idToAccount[seed])==0x0){
            Error('Account does not excist');
            return false;
        }
        bytes32 newSeed = sha256(name, newAdmin);
        for(uint i=0; i < totalAccounts; i++){
            if(seed == accounts[i]){
                accounts[i] = newSeed;
                idToAccount[newSeed] = idToAccount[seed];
                idToAccount[seed] = RGSmartAccount_v10(address(0));
            }
        }
        AdminReset(name, newAdmin);
        return true;
    }

    ///@notice Distributes provided asset for all smart accounts
    ///@param token Address of asset
    function distribute(ERC20Interface token) public {
        for(uint i=0; i<totalAccounts; i++){
            bytes32 seed = accounts[i];
            RGSmartAccount_v10 account = idToAccount[seed];
            account.distrubute(token);
        }
        Distribution(token);
    }

    ///@notice Dispalays all accounts where user is a participant
    ///@return List of accounts
    function myAccountsUser() public constant returns(address[]) {
        address[] memory filterAccounts = new address[](totalAccounts);
        for(uint i=0; i < totalAccounts; i++){
            uint256 balance = idToAccount[accounts[i]].balanceOf(msg.sender);
            if(balance>0){
                filterAccounts[i] = idToAccount[accounts[i]];
            }
        }
        return filterAccounts;
    }

    ///@notice Dispalays all accounts where user is an admin
    ///@return List of accounts
    function myAccountsAdmin() public constant returns(address[]){
        address[] memory filterAccounts = new address[](totalAccounts);
        for(uint i=0; i < totalAccounts; i++){
            RGSmartAccount_v10 account = idToAccount[accounts[i]];
            if(accounts[i] == account.getAdminHash(msg.sender)){
                filterAccounts[i] = address(account);
            }
        }
        return filterAccounts;
    }
}