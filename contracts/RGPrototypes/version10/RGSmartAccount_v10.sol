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

    ///@notice hash of manager contract
    bytes32 private managerId;

    ///@notice Signer to user hash
    ///@dev The hashes are counted internally using sha256
    mapping(bytes32 => address) public idToSigner;
    ///@notice List of signers
    ///@dev Contains users hashes
    mapping(uint256 => bytes32) public signers;


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
    function distrubute(address token) external returns(bool){
        uint256 balance = ERC20Interface(token).balanceOf(address(this));
        if(balance > totalSupply){
            Error('Account must be reset');
            return false;
        }
        ERC20Interface(token).transfer(msg.sender, balance);
        uint256 rawDistribution = ERC20Interface(token).balanceOf(address(this));
        uint256 totalDistributuon = rawDistribution % totalSupply;
        uint256 change = rawDistribution - totalDistributuon;
        if(change>0){
            ERC20Interface(token).transfer(msg.sender, change);
        }
        uint256 percent = totalDistributuon / totalSupply;
    
        for(uint256 i=0; i<totalSigners; i++){
            address signer = idToSigner[signers[i]];
            uint256 signerDistribution = balanceOf[signer] * percent;
            ERC20Interface(token).transfer(signer, signerDistribution);
            Distribution(token, msg.sender, signerDistribution);
        }
        return true;
    }

    ///@notice RGSA transfer functionality
    ///@dev Automatically manages users role after transfer
    ///@param recipient Address of the receiver
    ///@param amount Asset distribution amount
    function transfer(address recipient, uint amount) public returns (bool) {
        require(balanceOf[msg.sender]>=amount);
        if(balanceOf[recipient]==0){
            _addUser(recipient);
        }
        balanceOf[msg.sender] -= amount;
        balanceOf[recipient] += amount;

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

        if(balanceOf[recipient]==0){
            _addUser(sender);
        }

        allowance[sender][msg.sender] -= amount;
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount;

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
        uint indexSearch;
        uint indexStep;
        while(indexStep<totalSigners){
            address signer = idToSigner[signers[indexSearch]];
            if(signer!=address(0)){
                uint balance = balanceOf[signer];
                if(balance > 0){
                    balanceOf[msg.sender] += balanceOf[signer];
                    Burn(signer, balanceOf[signer]);
                    balanceOf[signer] = 0;
                    _removeUser(signer);
                }
                indexStep++;     
            }
            indexSearch++;
        }
        return true;
    }

    ///@notice Counts admin hash
    ///@dev Can be called inly bu manager
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
        balanceOf[admin] += totalPercentage;
        totalSupply += totalPercentage;
        _addUser(user);
        Transfer(address(0), msg.sender, totalPercentage);
    }

    ///@notice Adds user from signers list
    ///@dev Is called when user balance becomes > 0
    ///@param user User to add
    function _addUser(address user) internal{
        bytes32 seed = sha256(user, address(this));
        idToSigner[seed] = user;
        for(uint i=0; i<totalSigners+1; i++){
            if(signers[i] == bytes32(0)){
                signers[i] = seed;
            }
        }
        totalSigners++;
    }

    ///@notice Removes user from signers list
    ///@dev Is called when user balance becomes == 0
    ///@param user User to remove
    function _removeUser(address user) internal{
        bytes32 seed = sha256(user, address(this));
        
        idToSigner[seed] = address(0);
        uint256 signersLeft = totalSigners;
        uint index;
        while(signersLeft>0){
            if(signers[index] == seed){
                signers[index] = bytes32(0);
            }
            index++;
            signersLeft--;
        }
        totalSigners--;
    }
}



