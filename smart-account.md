RG Smart Account.
=========

# Contracts:
- RGSmartAccount
- RGSmartAccountManager


# RGSmartAccount:
## Write:
- _distrubute(address token)_ - Distributes asset balance between users. Utilizes users RGSA balance to count distribution. Address of token to distribute must be passed as an argument.
- _transfer(address recipient, uint amount)_ - RGSA transfer. Automatically manages users role after transfer. 
- _approve(address spender, uint amount)_ - RGSA approval. Basic ERC20 apprval.
- _transferFrom(address sender,address recipient,uint amount)_ - RGSA transferFrom functionality. Automatically manages users role after transfer.
- _burn(uint amount)_ - RGSA burn. Resets all users destribution. **May be called only by manager contract**

## Read
- _name()_ - Custom name of the account. Could be set on account initialization.
- _symbol()_ - ERC20 ticker. "RGSA" by default.
- _decimals()_ - ERC20 preceision. 2 by default.
- _totalSupply()_ - Base distributioj supply. 100^(10^decimals) by default.
- _totalSigners()_ - Number of distribution holders.
- _balanceOf(address signer)_ - Map: user address to his distribution balance
- _allowance(address signer, address to)_ - Map: user address to his distribution allowance to some address.
- _isSigner(bytes32 id)_ - Map: user is a signer flag
- _signers(uint256 i)_ - List of signers counting from 0.
- _getAdminHash(address user)_ - Checks admin hash for provided address. **May be called only by manager contract**


# RGSmartAccountManager:
## Write:
- _initAccount(string name)_ - Creates smart account with custom name. The caller becomes an owner of the account and will get the whole distribution.
- _resetAccount(string name, address[] signers, uint256[] distribution)_ - Resets account distribution. Collects all the distribution from account users and distributes it again using provided configuration. The length of signers and distribution must be equal. The summ of distributions must be equal to RGSA total supply (The whole RGSA supply has to be distributed) **Only owner of the account can reset the account**
- _resetAdmin(string name, address newAdmin)_ - Pass ownership to another address. Previous owner will not be able to roll back the operation. **Only owner of the account can reset admin**
- _distribute(ERC20Interface token)_ - Calls "distribute" for the provided ERC20 for the service porpose.

## Read
- _accounts(uint256 i)_ - List of smart accounts Ids counting from 0.
- _totalAccounts()_ - Number of smart accounts registered.
- _idToAccount(bytes32 id) - Map: Account hash id to its address
- _myAccountsUser()_ - List of accounts where caller has a signer role.
- _myAccountsAdmin()_ - List of accounts where caller has an admin role.


# Application Lifesycle
- User creates Smart Account (_initAccount())
- User adds signers to Smart Account(_resetSigners()_). The RGSA tokens are taken from admin address and distributed among signers.
- Some amount of ERC20 is sent to Smart Account.
- The amount is distributed among signers (_distribute()_) according to their part of RGSA supply (_balanceOf()_)
- User resets account to change configuration and signers(_resetSigners()_). The RGSA tokens are taken from all the holders of the Smart Account and redistributed due to the new configuration.



