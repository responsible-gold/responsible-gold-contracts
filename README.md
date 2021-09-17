RG ecosystem contracts.
=========

# Installation

**NodeJS 6.x+ must be installed as a prerequisite.**
```
$ npm install
```

# Running tests

```
$ npm run testrpc
$ npm run test
```

# Running locally via Docker
**Docker must be installed as a prerequisite.**

```
$ npm run docker
$ cd deployment
$ sed -i '' 's/127.0.0.1/<Replace with docker-machine ip>/g' config.js
$ ./deploy --private-key {private_key} --action deployRGContracts

```

**Deployment**
# Compiling contracts

```
$ npm run compile
```

```
./deploy --h
usage: deploy [-h] [-v] --private-key hex --action
              {deployRGManager,deployWithoutGcoins,mintGcoins,createHotWallet,transferGCoins,deployMigrationContracts,deployRulesContracts,fullUpdateRGContracts,updateRGContracts,updateRulesContracts,migrateChip,setSignerByOracle,addToWhitelist,removeFromWhitelist,addToNonFeeList,removeFromNonFeeList,deployOrganizationFactory,deployAccountContracts,deployOrganizationContracts,updateOrganizations,deployRuleAuthorizerContracts,updateRuleAuthorizer,updateValidator,deployRuleAuthorizer,setRuleAuthorizerOnRules,deployRegistryContracts,deployRegistry,updateRegistry,setRegistry,deployRGContracts,updateRGManager,setupFees,setDefaultFeeTime,updateDefaultFeeTime,deployUserContracts,deployUpdateAssetCardFactory,registerAsset}
              [--chip string] [--totalCoins uint] [--rgManagerAddress address]
              [--coinsOwner address] [--coinsReceiver address]
              [--coinsToTransfer uint] [--rgManagerResolver address]
              [--cloneFactory address] [--rgManagerRouter address]
              [--rgAssetOwnershipCardRouter address]
              [--rgAssetOwnershipCardResolver address] [--oldChip string]
              [--newChip string] [--walletAddress address]
              [--webWalletAddress address] [--rgRulesRouter address]
              [--signerAddress address] [--doubleSigner address]
              [--rgRules address] [--targetAddress address]
              [--rgManagerAddress address] [--targetAddress address]
              [--accountResolver address] [--rgOrganizationResolver address]
              [--rgOrganizationRouter address]
              [--rgRuleAuthorizerRouter address]
              [--rgRuleAuthorizerResolver address]
              [--rgRuleAuthorizer address] [--rgValidatorRouter address]
              [--noCosigning {true,false}] [--feeCollector address]
              [--defaultFeeTimeInSec uint] [--yearlyFeePercent float]
              [--rgManagerAddress address] [--defaultFeeTimeInSec uint]
              [--rgRegistryResolver address] [--rgPermissionsManager address]
              [--rgRegistryRouter address]
              [--rgRegistry address] [--rgManagerAddress address]
              [--rgRegistry address] [--asset string] [--symbol bytes32]
              [--devCosignerDeployer]


Deployment scripts help

Optional arguments:
  -h, --help            Show this help message and exit.
  -v, --version         Show program's version number and exit.
  --private-key hex     Private key to send transactions.
  --action {deployRGManager,deployWithoutGcoins,mintGcoins,createHotWallet,transferGCoins,deployMigrationContracts,deployRulesContracts,fullUpdateRGContracts,updateRGContracts,updateRulesContracts,migrateChip,setSignerByOracle,addToWhitelist,removeFromWhitelist,deployOrganizationFactory,deployAccountContracts,deployOrganizationContracts,updateOrganizations,deployRuleAuthorizerContracts,updateRuleAuthorizer,updateValidator,deployRuleAuthorizer,setRuleAuthorizerOnRules,deployRegistryContracts,deployRegistry,updateRegistry,setRegistry,deployRGContracts,updateRGManager,setupFees,setDefaultFeeTime,updateDefaultFeeTime,deployUserContracts,deployUpdateAssetCardFactory}
                        Type of action that will be called
  --chip string         Chip for RGAC
  --totalCoins uint     Total coins that will be generated during RGAC
                        deployment
  --rgManagerAddress address
                        Address of deployed main rg manager contract
  --coinsOwner address  Owners address of AC coins to be minted
  --coinsReceiver address
                        Receiver address who receive transferred coins
  --coinsToTransfer uint
                        Amount of coins to be transferred
  --rgManagerResolver address
                        RG manager resolver that will be set for RG manager
                        clone
  --cloneFactory address
                        RG asset cards clone factory
  --rgManagerRouter address
                        RG manager router that will be used for upgrading RG
                        manager prototype
  --rgAssetOwnershipCardRouter address
                        RG asset ownership card router that will be used for
                        upgrading RG asset ownership prototype
  --rgAssetOwnershipCardResolver address
                        RG asset ownership card resolver that will be used
                        for upgrading RG asset ownership clone factory
  --oldChip string      Chip that will be replaced
  --newChip string      Chip for migration
  --walletAddress address
                        Wallet address that will be benchmark for RG signer
                        contract
  --webWalletAddress address
                        webWalletAddress that will be signer of web wallet
  --rgRulesRouter address
                        RG rules router that will be used for upgrading RG
                        rules prototype
  --signerAddress address
                        Signer address (Assigner service or Second factor
                        service) that will be used in Double signer contract
  --doubleSigner address
                        Double signer contract address
  --rgRules address     rgRules contract address
  --targetAddress address
                        The target address that will be add or remove
  --accountResolver address
                        accountResolver address that will be using in
                        Organization Factory contract
  --rgOrganizationResolver address
                        rgOrganizationResolver address that will be using in
                        Organization Factory contract
  --rgOrganizationRouter address
                        RG organization router that will be used for
                        upgrading RG organization prototype
  --rgRuleAuthorizerRouter address
                        RG RuleAuthorizer router that will be used for
                        upgrading RG rule authorizer prototype
  --rgRuleAuthorizerResolver address
                        rgRuleAuthorizerResolver address that will be set for
                        rg rule authorizer clone
  --rgRuleAuthorizer address
                        rgRuleAuthorizer address that will be using in
                        Organization Factory contract for deploying
                        organizations or for setting rgRuleAuthorizer to the
                        rgTransactionRules contract
  --rgValidatorRouter address
                        RG Validator router that will be used for upgrading
                        RG validator prototype
  --noCosigning {true,false}
                        Is cosigning switched on on organization
  --feeCollector address
                        fee collector address that will collect rg fees
  --defaultFeeTimeInSec uint
                        default fee time for collecting fee from accounts
  --yearlyFeePercent float
                        yearly fee in percent
  --rgRegistryRouter address
                        RG Registry router that will be used for upgrading RG
                        registry prototype
  --rgRegistryResolver address
                        rgRegistryResolver address that will be set for rg
                        registry clone
  --rgPermissionsManager address
                        rgPermissionsManager address that will be set for rg
                        permission manager
  --rgRegistry address
                        rgRegistry contract address
  --asset string
                        asset that will be using for registering asset in
                        rgRegistry contract
  --symbol bytes32
                        asset symbol that will be using for registering asset
                        in rgRegistry contract
  --devCosignerDeployer
                        For local backend development
```
**Deployment steps**

```
  1. Execute ./deploy --private-key PRIVATE_KEY_1 --action deployRGContracts (add optional parameter --noCosigning true if you want to disable cosigning on organization contract)
  2. Get all needed contracts and accounts from output
```
