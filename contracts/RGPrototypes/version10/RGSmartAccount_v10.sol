pragma solidity 0.4.15;

import '../../Interfaces/ERC20Interface.sol';

/// @title RG Smart Account
/// @notice Contains functionality of RGSA
contract RGSmartAccount_v10{
    ///@notice Account name can be set in manager
    string public name;
    ///@notice RGSA by default
    string public symbol;
    ///@notice 2 by default (precision)
    uint8 public decimals;
    ///@notice 100^(10^precision) by default
    uint256 public totalSupply;
    ///@notice number of account users
    uint256 public totalSigners;
    ///@notice RGSA balance
    ///@dev Is utilized as distribution percent
    mapping(address => uint) public balanceOf;
    ///@notice RGSA allowance
    mapping(address => mapping(address => uint)) public allowance;
    ///@notice Signer "is registered" flag
    mapping(address => bool) public isSigner;
    ///@notice List of signers
    ///@dev Contains users hashes
    mapping(uint256 => address) public signers;
    ///@notice hash of manager contract
    bytes32 private managerId;


    function RGSmartAccount_v10(string _name, string _symbol, uint8 _decimals) public{
        name = _name;
        symbol = _symbol;
        decimals =_decimals;
        managerId = sha256(msg.sender, address(this));
        _mint(msg.sender);
    }

    event Transfer(address indexed from, address indexed to, uint value);
    event Approval(address indexed owner, address indexed spender, uint value);
    event Distribution(address indexed token, address indexed to, uint value);
    event Mint(address indexed to, uint value);
    event Burn(address indexed from, uint value);
    event Error(bytes32 error);

    ///@notice Distributes asset balance between users
    ///@dev Utilizes users RGSA balance to count distribution
    ///@param token Asset that has to be distributed 
    function distribute(address token) external returns(bool){
        uint256 balance = ERC20Interface(token).balanceOf(address(this));
        if(balance < totalSupply){
            Error('Not enough tokens');
            return false;
        }
        uint256 change = balance % totalSupply;
        uint256 percent = (balance - change) / totalSupply;
        for(uint256 i=0; i < totalSigners; i++){
            uint256 signerDistribution = balanceOf[signers[i]] * percent;
            ERC20Interface(token).transfer(signers[i], signerDistribution);
            Distribution(token, signers[i], signerDistribution);
        }

        return true;
    }

    ///@notice RGSA transfer functionality
    ///@dev Automatically manages users role after transfer
    ///@param recipient Address of the receiver
    ///@param amount Asset distribution amount
    function transfer(address recipient, uint amount) public returns (bool) {
        require(balanceOf[msg.sender]>=amount);
        
        balanceOf[msg.sender] -= amount;
        balanceOf[recipient] += amount;

        if(balanceOf[recipient] > 0){
            _addUser(recipient);
        }

        if(balanceOf[msg.sender] == 0){ 
            _removeUser(msg.sender);
        }
        Transfer(msg.sender, recipient, amount);
        return true;
    }

    ///@notice RGSA approve functionality
    ///@dev basic ERC20 apprval
    ///@param spender Address of the spender
    ///@param amount Asset distribution amount
    function approve(address spender, uint amount) public returns (bool) {
        allowance[spender][msg.sender] = amount;
        Approval(spender, msg.sender, amount);
        return true;
    }

    ///@notice RGSA transfer functionality
    ///@dev Automatically manages users role after transfer
    ///@param sender Address of the sender
    ///@param recipient Address of the receiver
    ///@param amount Asset distribution amount
    function transferFrom(
        address sender,
        address recipient,
        uint amount
    ) public returns (bool) {
        require(allowance[sender][msg.sender]>=amount);
        require(balanceOf[sender]>=amount);

        allowance[sender][msg.sender] -= amount;
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount;

        if(balanceOf[recipient] > 0){
            _addUser(recipient);
        }

        if(balanceOf[sender] == 0){
            _removeUser(sender);
        }

        Transfer(sender, recipient, amount);
        return true;
    }

    ///@notice RGSA burn functionality
    ///@dev Resets all users destribution. Can be called only by manager
    ///@param amount Must be equal to the total supply to fit the ERC20Burnable
    function burn(uint amount) external returns (bool){
        bytes32 seed = sha256(msg.sender, address(this));
        require(seed==managerId);
        require(amount == totalSupply);
        for(uint i=0; i < totalSigners; i++){
            address signer = signers[i];
            balanceOf[signer] = 0;
            isSigner[signer] = false;
            signers[i] = address(0);
        }
        signers[0] = msg.sender;
        balanceOf[msg.sender] = totalSupply;
        isSigner[msg.sender] = true;
        totalSigners=1;
        return true;
    }

    ///@notice Counts admin hash
    ///@dev Can be called only by manager
    ///@param user User address
    ///@return Counted hash
    function getAdminHash(address user) external returns (bytes32){
        bytes32 seed = sha256(msg.sender, address(this));
        require(seed == managerId);
        return sha256(name, user);
    }
    
    ///@notice Mints RGSA supply
    ///@dev 100^(10^decimals) by default. Sends distribution to provided user. Called on init
    ///@param user Receiver of distribution
    function _mint(address user) internal {
        uint totalPercentage = 100*(10**uint256(decimals));
        balanceOf[user] += totalPercentage;
        totalSupply += totalPercentage;
        _addUser(user);
        Transfer(address(0), msg.sender, totalPercentage);
    }

    ///@notice Adds user from signers list
    ///@dev Is called when user balance becomes > 0
    ///@param user User to add
    function _addUser(address user) internal{
        if(isSigner[user]){
            return;
        }
        signers[totalSigners] = user;
        isSigner[user] = true;
        totalSigners++;
    }

    ///@notice Removes user from signers list
    ///@dev Is called when user balance becomes == 0
    ///@param user User to remove
    function _removeUser(address user) internal{
        if(!isSigner[user]){
            return;
        }
        for(uint i=0; i<totalSigners; i++){
            if(signers[i]==user){
                    signers[i] = signers[totalSigners-1];
                    signers[totalSigners-1] = address(0);
                    isSigner[user] = false;
                    totalSigners--;
            }
        }
    }
}



