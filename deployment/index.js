"use strict";

const config = require('./config');

global.window = {
  opts: {
    gethUrl: config.rpcUrl,
    pk: '',
  }
};

const ArgumentParser = require('argparse').ArgumentParser;
const VERSION = require('../package.json').version;
const Promise = require('bluebird');
const assertAsync = Promise.method(require('assert'));
const EToken = require('etoken-lib');
const util = require('ethereumjs-util');
const Utils = require('./utils')(EToken, config.gasPrice);
const RGManagerPrototype = require('../build/contracts/RGManagerPrototype_v10.json');
const RGRouter = require('../build/contracts/Router.json');
const RGResolver = require('../build/contracts/Resolver.json');
const RGClone = require('../build/contracts/Clone.json');
const RGAssetOwnershipCardPrototype = require('../build/contracts/RGAssetOwnershipCardPrototype_v10.json');
const RGAssetOwnershipCardCloneFactory = require('../build/contracts/RGAssetOwnershipCardCloneFactory.json');
const RGRulesPrototype = require('../build/contracts/RGTransactionRulesPrototype_v10.json');
const RGOrganizationFactory = require('../build/contracts/RGOrganizationFactory.json');
const RGOrganizationPrototype = require('../build/contracts/RGOrganizationPrototype_v10.json');
const FakeOrganizationPrototype = require('../build/contracts/FakeOrganizationPrototype_v10.json');
const RGAccountPrototype = require('../build/contracts/RGAccountPrototype_v10.json');
const RGRuleAuthorizerPrototype = require('../build/contracts/RGRuleAuthorizerPrototype_v10.json');
const RGValidatorPrototype = require('../build/contracts/RGValidatorPrototype_v10.json');
const RGRegistryPrototype = require('../build/contracts/RGRegistryPrototype_v10.json');
const RGUserPrototype = require('../build/contracts/RGUserPrototype.json');
const RGPermissionsManager = require('../build/contracts/RGPermissionsManager.json');
const RGProxyPrototype = require('../build/contracts/RGProxyPrototype.json');
const UserClonePool = require('../build/contracts/RGUserClonePool.json');
const DoubleSignerContract = require('../build/contracts/DoubleSigner.json');

const nowSeconds = Utils.nowSeconds;
const smartDeployContract = Utils.smartDeployContract;
const setPrivateKey = Utils.setPrivateKey;
const getBalance = Utils.getBalance;
const checkBalance = Utils.checkBalance;
const privateKeyToAddress = Utils.privateKeyToAddress;
const web3 = Utils.web3;
const safeTransactions = Utils.safeTransactions;
const safeTransaction = Utils.safeTransaction;
const safeTransactionFunction = Utils.safeTransactionFunction;
const safeSend = Utils.safeSend;
const syncFunction = Utils.syncFunction;
const eth = Promise.promisifyAll(web3.eth);
const log = console.log;
const FAST_RUN = true;
const placeholder = 'cafecafecafecafecafecafecafecafecafecafe';
const placeholder2 = 'fefefefefefefefefefefefefefefefefefefefe';
const placeholder3 = 'cacacacacacacacacacacacacacacacacacacaca';
const routerDeployPrefix = 224;
const suffixToRemove = -86;
const prefixResolverToRemoveStart = 22;
const prefixResolverToRemoveEnd = 62;

const parser = new ArgumentParser({
    version: VERSION,
    addHelp: true,
    description: 'Deployment scripts help',
    epilog: 'RG'
  });

  parser.addArgument(
    ['--private-key'], {
      help: 'Private key to send transactions.',
      dest: 'privateKey',
      required: true,
      metavar: 'hex',
    }
  );

  parser.addArgument(
    ['--action'], {
      help: 'Type of action that will be called',
      choices: ['deployRGManager', 'deployWithoutGcoins', 'mintGcoins', 'createHotWallet', 'transferGCoins', 'deployMigrationContracts', 'deployRulesContracts', 'fullUpdateRGContracts', 'updateRGContracts', 'updateRulesContracts', 'migrateChip', 'setSignerByOracle', 'addToWhitelist', 'removeFromWhitelist', 'addToNonFeeList', 'removeFromNonFeeList', 'deployOrganizationFactory', 'deployAccountContracts', 'deployOrganizationContracts', 'updateOrganizations', 'deployRuleAuthorizerContracts', 'updateRuleAuthorizer', 'updateValidator', 'deployRuleAuthorizer', 'setRuleAuthorizerOnRules', 'deployRegistryContracts', 'deployRegistry', 'updateRegistry', 'setRegistry', 'deployRGContracts', 'updateRGManager', 'setupFees', 'setDefaultFeeTime', 'updateDefaultFeeTime', 'deployUserContracts', 'deployUpdateAssetCardFactory', 'registerAsset'],
      dest: 'actionType',
      required: true,
    }
  );

  parser.addArgument(
    ['--chip'], {
      help: 'Chip for RGAC',
      dest: 'chip',
      metavar: 'string'
    }
  );

  parser.addArgument(
    ['--totalCoins'], {
      help: 'Total coins that will be generated during RGAC deployment',
      dest: 'totalCoins',
      metavar: 'uint'
    }
  );

  parser.addArgument(
    ['--rgManagerAddress'], {
      help: 'Address of deployed main rg manager contract',
      dest: 'rgManagerAddress',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--coinsOwner'], {
      help: 'Owners address of AC coins to be minted',
      dest: 'coinsOwner',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--coinsReceiver'], {
      help: 'Receiver address who receive transferred coins',
      dest: 'coinsReceiver',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--coinsToTransfer'], {
      help: 'Amount of coins to be transferred',
      dest: 'coinsToTransfer',
      metavar: 'uint'
    }
  );

  parser.addArgument(
    ['--rgManagerResolver'], {
      help: 'RG manager resolver that will be set for RG manager clone',
      dest: 'rgManagerResolver',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--cloneFactory'], {
      help: 'RG asset cards clone factory',
      dest: 'cloneFactory',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--rgManagerRouter'], {
      help: 'RG manager router that will be used for upgrading RG manager prototype',
      dest: 'rgManagerRouter',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--rgAssetOwnershipCardRouter'], {
      help: 'RG asset ownership card router that will be used for upgrading RG asset ownership prototype',
      dest: 'rgAssetOwnershipCardRouter',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--rgAssetOwnershipCardResolver'], {
      help: 'RG asset ownership card resolver that will be used for upgrading RG asset ownership clone factory',
      dest: 'rgAssetOwnershipCardResolver',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--oldChip'], {
      help: 'Chip that will be replaced',
      dest: 'oldChip',
      metavar: 'string'
    }
  );

  parser.addArgument(
    ['--newChip'], {
      help: 'Chip for migration',
      dest: 'newChip',
      metavar: 'string'
    }
  );

  parser.addArgument(
    ['--walletAddress'], {
      help: 'Wallet address that will be benchmark for RG signer contract',
      dest: 'walletAddress',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--webWalletAddress'], {
      help: 'webWalletAddress that will be signer of web wallet',
      dest: 'webWalletAddress',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--rgRulesRouter'], {
      help: 'RG rules router that will be used for upgrading RG rules prototype',
      dest: 'rgRulesRouter',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--signerAddress'], {
      help: 'Signer address (Assigner service or Second factor service) that will be used in Double signer contract',
      dest: 'signerAddress',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--doubleSigner'], {
      help: 'Double signer contract address',
      dest: 'doubleSigner',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--rgRules'], {
      help: 'rgRules contract address',
      dest: 'rgRules',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--targetAddress'], {
      help: 'The target address that will be add or remove',
      dest: 'targetAddress',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--accountResolver'], {
      help: 'accountResolver address that will be using in Organization Factory contract',
      dest: 'accountResolver',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--rgOrganizationResolver'], {
      help: 'rgOrganizationResolver address that will be using in Organization Factory contract',
      dest: 'rgOrganizationResolver',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--rgOrganizationRouter'], {
      help: 'RG organization router that will be used for upgrading RG organization prototype',
      dest: 'rgOrganizationRouter',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--rgRuleAuthorizerRouter'], {
      help: 'RG RuleAuthorizer router that will be used for upgrading RG rule authorizer prototype',
      dest: 'rgRuleAuthorizerRouter',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--rgRuleAuthorizerResolver'], {
      help: 'rgRuleAuthorizerResolver address that will be set for rg rule authorizer clone',
      dest: 'rgRuleAuthorizerResolver',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--rgRuleAuthorizer'], {
      help: 'rgRuleAuthorizer address that will be using in Organization Factory contract for deploying organizations or for setting rgRuleAuthorizer to the rgTransactionRules contract',
      dest: 'rgRuleAuthorizer',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--rgValidatorRouter'], {
      help: 'RG Validator router that will be used for upgrading RG validator prototype',
      dest: 'rgValidatorRouter',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--rgAccountRouter'], {
      help: 'RG Account router that will be used for upgrading RG account prototype',
      dest: 'rgAccountRouter',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--noCosigning'], {
      help: 'Is cosigning switched on on organization',
      choices: ['true', 'false'],
      dest: 'noCosigning',
    }
  );

  parser.addArgument(
    ['--feeCollector'], {
      help: 'fee collector address that will collect rg fees',
      dest: 'feeCollector',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--defaultFeeTimeInSec'], {
      help: 'default fee time for collecting fee from accounts',
      dest: 'defaultFeeTimeInSec',
      metavar: 'uint'
    }
  );

  parser.addArgument(
    ['--yearlyFeePercent'], {
      help: 'yearly fee in percent',
      dest: 'yearlyFeePercent',
      metavar: 'float'
    }
  );

  parser.addArgument(
    ['--rgRegistryRouter'], {
      help: 'RG Registry router that will be used for upgrading RG registry prototype',
      dest: 'rgRegistryRouter',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--rgRegistryResolver'], {
      help: 'rgRegistryResolver address that will be set for rg registry clone',
      dest: 'rgRegistryResolver',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--rgPermissionsManager'], {
      help: 'rgPermissionsManager address that will be set for rg permission manager',
      dest: 'rgPermissionsManager',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--rgRegistry'], {
      help: 'rgRegistry contract address',
      dest: 'rgRegistry',
      metavar: 'address'
    }
  );

  parser.addArgument(
    ['--asset'], {
      help: 'asset that will be using for registering asset in rgRegistry contract',
      dest: 'asset',
      metavar: 'string'
    }
  );

  parser.addArgument(
    ['--symbol'], {
      help: 'asset symbol that will be using for registering asset in rgRegistry contract',
      dest: 'symbol',
      metavar: 'bytes32'
    }
  );

  parser.addArgument(
    ['--devCosignerDeployer'], {
      help: 'For local backend development',
      dest: 'devCosignerDeployer',
      nargs: '0',
      constant: true,
      defaultValue: false,
    }
  );

  const parsedArgs = parser.parseArgs();
  const rgManager = web3.isAddress(parsedArgs.rgManagerAddress) ? eth.contract(RGManagerPrototype.abi).at(parsedArgs.rgManagerAddress) : undefined;
  var address = setPrivateKey(parsedArgs.privateKey.slice(-64));

  function sanityCheck(args) {
    return Promise.all([
      args.rgManagerAddress ? Promise.promisify(rgManager.rgOwner)().then(result => assertAsync(result != '0x', 'RG manager is not deployed')) : syncFunction(() => true),
      assertAsync(!args.rgManagerAddress || web3.isAddress(args.rgManagerAddress), 'Specified RG manager address is incorrect.'),
      assertAsync(!config.baseUnit || (web3.toBigNumber(config.baseUnit).gte(0) && web3.toBigNumber(config.baseUnit).lte(255)), 'BaseUnit is incorrect.'),
      assertAsync(!args.baseUnit || (cents(args.totalCoins, config.baseUnit).decimalPlaces() === 0), 'Value has incorrect number of decimals.'),
      assertAsync(!args.rgACcoinsOwner || web3.isAddress(args.rgACcoinsOwner), 'Specified RG AC coins Owner address is incorrect.'),
      assertAsync(!args.coinsReceiver || web3.isAddress(args.coinsReceiver), 'Specified coins receiver address is incorrect.'),
      assertAsync(!args.rgManagerResolver || web3.isAddress(args.rgManagerResolver), 'Specified rgManagerResolver address is incorrect.'),
      assertAsync(!args.cloneFactory || web3.isAddress(args.cloneFactory), 'Specified cloneFactory address is incorrect.'),
    ]).then(() => args);
  }

  function success(obj) {
    log(JSON.stringify(obj));
    return obj;
  }

  function parseBool(str) {
    return str === true || str === 'true';
  }

  function transformArgs(_args) {
    return Promise.try(() => {
      const args = JSON.parse(JSON.stringify(_args));
      args.totalCoins = args.totalCoins ? cents(args.totalCoins, config.baseUnit).toString() : undefined;
      args.coinsToTransfer = args.coinsToTransfer ? cents(args.coinsToTransfer, config.baseUnit).toString() : undefined;
      args.noCosigning = args.noCosigning ? parseBool(args.noCosigning) : undefined;
      return args;
    });
  }

  function cents(tokens, baseUnit) {
    return web3.toBigNumber(10).pow(baseUnit).mul(tokens);
  }

  function replaceAll(input, find, replace, placeholdersCount = 1) {
    var splittedBytecode = input.split(find);

    if (splittedBytecode.length != placeholdersCount + 1) {
      throw new Error('placeholders count is not valid');
    }
    return splittedBytecode.join(replace);
  }

  function deployAndReplace(contract, placeholderToReplace, addressForReplace) {
    var replacedBytecode = replaceAll(contract.unlinked_binary, placeholderToReplace, addressForReplace.slice(-40))

    return smartDeployContract({
      bytecode: replacedBytecode,
      abi: contract.abi,
      sender: address,
      gas: 3000000,
      waitReceipt: true,
    })
  }

  function deployMigrationContracts() {
    let rgManagerRouterAddress;
    let rgManagerResolverAddress;
    let rgManagerPrototypeAddress;
    let rgAssetOwnershipCardRouterAddress;
    let rgAssetOwnershipCardResolverAddress;
    let rgAssetOwnershipCardCloneFactoryAddress;
    let rgAssetOwnershipCardPrototypeAddress;


    return deployHelperContracts(RGManagerPrototype)
    .then(contracts => {
      rgManagerPrototypeAddress = contracts.prototypeAddress;
      rgManagerRouterAddress = contracts.routerAddress;
      rgManagerResolverAddress = contracts.resolverAddress;
    })
    .then(() => deployHelperContracts(RGAssetOwnershipCardPrototype))
    .then(contracts => {
      rgAssetOwnershipCardPrototypeAddress = contracts.prototypeAddress;
      rgAssetOwnershipCardRouterAddress = contracts.routerAddress;
      rgAssetOwnershipCardResolverAddress = contracts.resolverAddress;
    })
    .then(() => deployAndReplace(RGAssetOwnershipCardCloneFactory, placeholder, rgAssetOwnershipCardResolverAddress))
    .then(rgAssetOwnershipCardCloneFactory => {
      rgAssetOwnershipCardCloneFactoryAddress = rgAssetOwnershipCardCloneFactory.address;
    })
    .then(() => {
      return success({
        'rgManagerPrototype': rgManagerPrototypeAddress,
        'rgManagerRouter': rgManagerRouterAddress,
        'rgManagerResolver': rgManagerResolverAddress,
        'rgAssetOwnershipCardPrototype': rgAssetOwnershipCardPrototypeAddress,
        'rgAssetOwnershipCardRouter': rgAssetOwnershipCardRouterAddress,
        'rgAssetOwnershipCardResolver': rgAssetOwnershipCardResolverAddress,
        'rgAssetOwnershipCardCloneFactory': rgAssetOwnershipCardCloneFactoryAddress
      });
    });
  }

  function deployRulesContracts(args) {
    let rgRulesRouterAddress;
    let rgRulesResolverAddress;
    let rgRulesPrototypeAddress;
    let rgRulesCloneAddress;

    let rgRulesCloneContract;

    if (web3.isAddress(args.walletAddress)) { var walletAddress = args.walletAddress; } else throw new Error('walletAddress is not specified or not an address');
    if (!rgManager) throw new Error('rgManager contract is not specified');

    const setRGTransactionRulesSignature = web3.sha3('setRGTransactionRules(address)').substr(0,8);

    return Promise.promisify(eth.getCode)(rgManager.address)
    //todo use rg manager prototype bytecode from deployed contract.
    .then(() => assertAsync(RGManagerPrototype.unlinked_binary.includes(setRGTransactionRulesSignature), 'RG transaction rules functionality is not supported by rgManager current prototype version. v4 or higher is needed'))
    //DEPLOY RG rules contracts
    .then(() => deployHelperContracts(RGRulesPrototype))
    .then(contracts => {
      rgRulesPrototypeAddress = contracts.prototypeAddress;
      rgRulesRouterAddress = contracts.routerAddress;
      rgRulesResolverAddress = contracts.resolverAddress;
    })
    .then(() => deployAndReplace(RGClone, placeholder, rgRulesResolverAddress))
    .then(rgRulesClone => rgRulesCloneAddress = rgRulesClone.address)
    .then(() => eth.contract(RGRulesPrototype.abi).at(rgRulesCloneAddress))
    .then(result => rgRulesCloneContract = result)
    .then(() => safeTransaction(rgRulesCloneContract.constructTransactionRules, [address], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgRulesCloneContract.contractOwner)())
    .then(result => assertAsync(result == address, 'rgRulesCloneContract has not valid owner'))
    //add wallet to whitelist
    .then(() => safeTransaction(rgRulesCloneContract.addToWhitelist, [walletAddress], address, {waitReceipt: true}))
    .then(() => {
      return success({
        'rgRulesRouter': rgRulesRouterAddress,
        'rgRulesResolver': rgRulesResolverAddress,
        'rgRulesPrototype': rgRulesPrototypeAddress,
        'rgRulesClone-MAIN': rgRulesCloneAddress
      });
    })
    //setup rgRules on rgManager contract
    //NOTE: rgManager prototype should be version 4 or higher for rgRules contract setup
    .then(() => safeTransaction(rgManager.setRGTransactionRules, [rgRulesCloneAddress], address, {waitReceipt: true}))
    .then(() => log(`rgRules contract ${rgRulesCloneAddress} has been set for RG manager ${rgManager.address}.`));
  }

  function setupRGManager(args) {
    let rgManagerCloneAddress;
    let rgManagerContract;

    if (args.rgManagerResolver) { var rgManagerResolver = args.rgManagerResolver; } else throw new Error('rgManagerResolver is not specified');
    if (args.cloneFactory) { var cloneFactory = args.cloneFactory; } else throw new Error('cloneFactory is not specified');

    //Set not valid rgRulesClone on rgManager if its not deployed yet, valid rgRulesClone will be deployed on deployRulesContracts step
    var rgRules = args.rgRules ? args.rgRules : '0x0000000000000000000000000000000000000000';
    if (!web3.isAddress(rgRules)) { throw new Error('rgRulesClone is not an address') };

    //Set not valid rgRegistryClone on rgManager if its not deployed yet, valid rgRegistryClone will be deployed on deployRegistryContracts step
    var rgRegistry = args.rgRegistry ? args.rgRegistry : '0x0000000000000000000000000000000000000000';
    if (!web3.isAddress(rgRegistry)) { throw new Error('rgRegistryClone is not an address') };

    var resolverByteCode = replaceAll(replaceAll(RGResolver.unlinked_binary, placeholder, ''), RGResolver.unlinked_binary.slice(2, 62), '').slice(0, suffixToRemove);
    var cloneFactoryByteCode = replaceAll(replaceAll(RGAssetOwnershipCardCloneFactory.unlinked_binary, placeholder, ''), RGAssetOwnershipCardCloneFactory.unlinked_binary.slice(2, 64), '').slice(0, suffixToRemove);

    return Promise.promisify(eth.getCode)(rgManagerResolver)
    .then(resolver => assertAsync(replaceAll(resolver, resolver.slice(prefixResolverToRemoveStart, prefixResolverToRemoveEnd), '').slice(0, suffixToRemove) == resolverByteCode, 'Provided resolver contract is not valid'))
    .then(() => Promise.promisify(eth.getCode)(cloneFactory))
    .then(factory => assertAsync(replaceAll(factory, factory.slice(594, 634), '').slice(0, suffixToRemove) == cloneFactoryByteCode, 'Provided cloneFactory contract is not valid'))
    .then(() => deployAndReplace(RGClone, placeholder, rgManagerResolver))
    .then(rgManagerClone => rgManagerCloneAddress = rgManagerClone.address)
    .then(() => eth.contract(RGManagerPrototype.abi).at(rgManagerCloneAddress))
    .then(result => rgManagerContract = result)
    .then(() => safeTransaction(rgManagerContract.constructRGManager, [address, config.baseUnit, cloneFactory, rgRules, rgRegistry], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgManagerContract.contractOwner)())
    .then(result => assertAsync(result == address, 'rgManagerContract has not valid owner'))
    .then(() => {
      return success({'rgManagerClone': rgManagerCloneAddress});
    })
  }

  function updateRGContracts(args) {
    let rgManagerPrototypeAddress;

    return updatePrototype(args.rgManagerRouter, RGManagerPrototype)
    .then(updatedPrototype => rgManagerPrototypeAddress = updatedPrototype)
    .then(() => updatePrototype(args.rgAssetOwnershipCardRouter, RGAssetOwnershipCardPrototype))
    .then(updatedPrototype => {
      return success({
        'upgradedRGManagerPrototype': rgManagerPrototypeAddress,
        'upgradedRGAssetOwnershipCardPrototype': updatedPrototype
      });
    });
  }

  function updateRGManager(args) {
    return updatePrototype(args.rgManagerRouter, RGManagerPrototype)
    .then(updatedPrototype => {
      return success({
        'upgradedRGManagerPrototype': updatedPrototype
      });
    });
  }

  function updateRulesContracts(args) {
    return updatePrototype(args.rgRulesRouter, RGRulesPrototype)
    .then(updatedPrototype => {
      return success({
        'upgradedRGRulesPrototype': updatedPrototype
      });
    });
  }

  function fullUpdateRGContracts(args) {
    return updateRGContracts(args)
    .then(() => updateRulesContracts(args))
    .then(() => updateOrganizations(args))
    .then(() => updateRuleAuthorizer(args))
    .then(() => updateValidator(args))
    .then(() => updateAccount(args))
    .then(() => updateRegistry(args));
  }

  function addToWhitelist(args) {
    if (args.targetAddress) { var targetAddress = args.targetAddress; } else throw new Error('targetAddress address is not specified');
    if (args.rgRules) { var rgRules = args.rgRules; } else throw new Error('rgRules contract address is not specified');

    const rgRulesContract = eth.contract(RGRulesPrototype.abi).at(rgRules);

    return safeTransaction(rgRulesContract.addToWhitelist, [targetAddress], address, {waitReceipt: true})
    .then(() => Promise.promisify(rgRulesContract.whitelist)(targetAddress))
    .then(result => assertAsync(result, 'Address was not added to the whitelist'))
    .then(() => log(`Address '${targetAddress}' has been added to the whitelist`));
  }

  function removeFromWhitelist(args) {
    if (args.targetAddress) { var targetAddress = args.targetAddress; } else throw new Error('targetAddress address is not specified');
    if (args.rgRules) { var rgRules = args.rgRules; } else throw new Error('rgRules contract address is not specified');

    const rgRulesContract = eth.contract(RGRulesPrototype.abi).at(rgRules);

    return safeTransaction(rgRulesContract.removeFromWhitelist, [targetAddress], address, {waitReceipt: true})
    .then(() => Promise.promisify(rgRulesContract.whitelist)(targetAddress))
    .then(result => assertAsync(!result, 'Address was not removed from the whitelist'))
    .then(() => log(`Address '${targetAddress}' has been removed from the whitelist`));
  }

  function addToNonFeeList(args) {
    if (!rgManager) throw new Error('rgManager contract is not specified');
    if (web3.isAddress(args.targetAddress)) { var targetAddress = args.targetAddress; } else throw new Error('targetAddress address is not specified');

    return safeTransaction(rgManager.addNonFeeAddress, [targetAddress], address, {waitReceipt: true})
    .then(() => Promise.promisify(rgManager.nonFeeAddresses)(targetAddress))
    .then(result => assertAsync(result, 'Address was not added to the non-fee list'))
    .then(() => log(`Address '${targetAddress}' has been added to the non-fee list`));
  }

  function removeFromNonFeeList(args) {
    if (!rgManager) throw new Error('rgManager contract is not specified');
    if (web3.isAddress(args.targetAddress)) { var targetAddress = args.targetAddress; } else throw new Error('targetAddress address is not specified');

    return safeTransaction(rgManager.removeNonFeeAddress, [targetAddress], address, {waitReceipt: true})
    .then(() => Promise.promisify(rgManager.nonFeeAddresses)(targetAddress))
    .then(result => assertAsync(!result, 'Address was not removed from the non-fee list'))
    .then(() => log(`Address '${targetAddress}' has been removed from the non-fee list`));
  }

  function registerAsset(args) {
    if (args.asset) { var asset = args.asset; } else throw new Error('asset is not specified');
    if (args.symbol) { var symbol = args.symbol; } else throw new Error('symbol is not specified');
    if (args.rgRegistry) { var rgRegistry = args.rgRegistry; } else throw new Error('rgRegistry contract address is not specified');

    const rgRegistryContract = eth.contract(RGRegistryPrototype.abi).at(rgRegistry);

    return safeTransaction(rgRegistryContract.registerAsset, [asset, symbol], address, {waitReceipt: true})
    .then(() => Promise.promisify(rgRegistryContract.registered)(asset))
    .then(result => assertAsync(!result, 'Asset was not registered'))
    .then(() => log(`Asset '${asset}' registered.`));
  }

  function deployWithoutGcoins(args) {
    if (args.chip) { var chip = args.chip; } else throw new Error('chip is not specified');
    if (args.totalCoins) { var totalCoins = args.totalCoins; } else throw new Error('totalCoins not specified');
    if (args.coinsOwner) { var coinsOwner = args.coinsOwner; } else throw new Error('coinsOwner address is not specified');
    if (!rgManager) throw new Error('rgManager contract is not specified');

    return Promise.promisify(rgManager.getAddressByChip)(chip)
    .then(result => assertAsync(result == '0x0000000000000000000000000000000000000000', 'RGAC with provided chip already created'))
    .then(() => safeTransaction(rgManager.deployWithoutGcoins, [chip, totalCoins, coinsOwner], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgManager.getAddressByChip)(chip))
    .then(result => log(`RGAC has been deployed, address: '${result}'.`));
  }

  function mintGcoins(args) {
    if (!rgManager) throw new Error('rgManager contract is not specified');
    if (args.chip) { var chip = args.chip; } else throw new Error('chip is not specified');
    if (args.coinsOwner) { var coinsOwner = args.coinsOwner; } else throw new Error('coinsOwner address is not specified');

    let mintedACaddress;
    let mintedRGAC;

    return Promise.promisify(rgManager.mintGcoins.call)(chip, coinsOwner, {from: address})
    .then(result => assertAsync(result, 'Gcoins already minted for provided RG ownership asset card or provided account has not AC coins'))
    .then(() => safeTransaction(rgManager.mintGcoins, [chip, coinsOwner], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgManager.getAddressByChip)(chip))
    .then(result => mintedACaddress = result)
    .then(() => mintedRGAC = eth.contract(RGAssetOwnershipCardPrototype.abi).at(mintedACaddress))
    .then(() => Promise.promisify(mintedRGAC.totalSupply)())
    .then(cents => cents.div(web3.toBigNumber(10).pow(config.baseUnit)))
    .then(coinsMinted => log(`${coinsMinted} Gcoins has been minted, RGAC address: ${mintedACaddress}.`));
  }

  function createAccount() {
    let accountAddress;
    let pk;

    return checkBalance(address)
    .then(() => {
      pk = EToken.Ambisafe.generateAccount('ETH', 'hotWallet').get('private_key');
      accountAddress = privateKeyToAddress(pk);
    })
    .then(() => {
      return [pk, accountAddress];
    });
  }

  function generateRGHotWallet() {
    return createAccount()
    .then(account => log(`Hot wallet created. PK: ${account[0]}, address: ${account[1]}`))
  }

  function transferGCoins(args) {
    if (args.coinsReceiver) { var coinsReceiver = args.coinsReceiver; } else throw new Error('coinsReceiver is not specified');
    if (args.coinsToTransfer) { var coinsToTransfer = args.coinsToTransfer; } else throw new Error('coinsToTransfer is not specified');
    if (!rgManager) throw new Error('rgManager contract is not specified');

    return Promise.promisify(rgManager.balanceOf)(address, {from: address})
    .then(result => assertAsync(result.gte(coinsToTransfer), 'User has not enough balance for transfer'))

    //transfer GCoins
    .then(() => safeTransaction(rgManager.transfer, [coinsReceiver, coinsToTransfer], address, {waitReceipt: true}))
    .then(() => log(`Account ${coinsReceiver} received ${coinsToTransfer} GCoins`));
  }

  function migrateChip(args) {
    if (args.oldChip) { var oldChip = args.oldChip; } else throw new Error('oldChip is not specified');
    if (args.newChip) { var newChip = args.newChip; } else throw new Error('newChip is not specified');
    if (!rgManager) throw new Error('rgManager contract is not specified');

    return safeTransaction(rgManager.migrationSetMigrationLock, [true], address, {waitReceipt: true})
    .then(() => safeTransaction(rgManager.migrationMigrateChips, [oldChip, newChip], address, {waitReceipt: true}))
    .then(() => safeTransaction(rgManager.migrationSetMigrationLock, [false], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgManager.underMigration)({from: address}))
    .then(result => assertAsync(!result, 'Migration is not finished'))
    .then(() => Promise.promisify(rgManager.getAddressByChip)(newChip, {from: address}))
    .then(rgacAddress => log(`Asset card with address ${rgacAddress} has updated chip to ${newChip}`));
  }

  function setSignerByOracle(args) {
    if (web3.isAddress(args.signerAddress)) { var signerAddress = args.signerAddress; } else throw new Error('signerAddress is not specified or not an address');
    if (web3.isAddress(args.doubleSigner)) { var doubleSigner = args.doubleSigner; } else throw new Error('doubleSigner is not specified or not an address');

    const doubleSignerContract = eth.contract(DoubleSignerContract.abi).at(doubleSigner);

    return Promise.promisify(doubleSignerContract.isOracle)(address, {from: address})
    .then(result => assertAsync(result, 'Provided account is not an oracle in double signer contract'))
    .then(() => Promise.promisify(doubleSignerContract.isSigner)(signerAddress, {from: address}))
    .then(result => assertAsync(!result, 'Signer address already set on Double signer contract'))
    .then(() => safeTransaction(doubleSignerContract.addSigner, [signerAddress], address, {waitReceipt: true}))
    .then(() => Promise.promisify(doubleSignerContract.isSigner)(signerAddress, {from: address}))
    .then(result => assertAsync(result, 'Signer address was not set on Double signer contract'))
    .then(() => log(`Signer ${signerAddress} has been set by ${address} oracle on double signer`));
  }

  function deployAccountContracts() {
    return deployHelperContracts(RGAccountPrototype)
    .then(contracts => {
      return success({
        'rgAccountRouter': contracts.routerAddress,
        'rgAccountResolver': contracts.resolverAddress,
        'rgAccountPrototype': contracts.prototypeAddress
      });
    });
  }

  function deployOrganizationFactory(args) {
    if (web3.isAddress(args.accountResolver)) { var accountResolver = args.accountResolver; } else throw new Error('accountResolver is not specified or not an address');
    if (web3.isAddress(args.rgOrganizationResolver)) { var rgOrganizationResolver = args.rgOrganizationResolver; } else throw new Error('rgOrganizationResolver is not specified or not an address');
    if (web3.isAddress(args.rgRuleAuthorizer)) { var rgRuleAuthorizer = args.rgRuleAuthorizer; } else throw new Error('rgRuleAuthorizer is not specified or not an address');

    RGOrganizationFactory.unlinked_binary = replaceAll(RGOrganizationFactory.unlinked_binary, placeholder, accountResolver.slice(-40))
    RGOrganizationFactory.unlinked_binary = replaceAll(RGOrganizationFactory.unlinked_binary, placeholder2, rgOrganizationResolver.slice(-40))
    RGOrganizationFactory.unlinked_binary = replaceAll(RGOrganizationFactory.unlinked_binary, placeholder3, rgRuleAuthorizer.slice(-40))

    return smartDeployContract({
      bytecode: RGOrganizationFactory.unlinked_binary,
      abi: RGOrganizationFactory.abi,
      sender: address,
      gas: 3000000,
      waitReceipt: true,
    })
    .then(rgOrganizationFactory => {
      return success({
        'ORG_FACTORY_ADDRESS' : rgOrganizationFactory.address,
      });
    })
  }

  function deployOrganizationContracts(args) {
    var noCosigning = args.noCosigning ? args.noCosigning : false;
    var orgPrototype = noCosigning ? FakeOrganizationPrototype : RGOrganizationPrototype;

    return deployHelperContracts(orgPrototype)
    .then(contracts => {
      return success({
        'rgOrganizationRouter': contracts.routerAddress,
        'rgOrganizationResolver': contracts.resolverAddress,
        'rgOrganizationPrototype': contracts.prototypeAddress
      });
    });
  }

  function updateOrganizations(args) {
    var noCosigning = args.noCosigning ? args.noCosigning : false;
    var orgPrototype = noCosigning ? FakeOrganizationPrototype : RGOrganizationPrototype;

    return updatePrototype(args.rgOrganizationRouter, orgPrototype)
    .then(updatedPrototype => {
      return success({
        'upgradedRGOrganizationPrototype': updatedPrototype,
      });
    });
  }

  function deployRuleAuthorizerContracts() {
    return deployHelperContracts(RGRuleAuthorizerPrototype)
    .then(contracts => {
      return success({
        'rgRuleAuthorizerRouter': contracts.routerAddress,
        'rgRuleAuthorizerResolver': contracts.resolverAddress,
        'rgRuleAuthorizerPrototype': contracts.prototypeAddress
      });
    });
  }

  function deployRuleAuthorizer(args) {
    let rgRuleAuthorizerCloneAddress;
    let rgRuleAuthorizerContract;

    if (args.rgRuleAuthorizerResolver) { var rgRuleAuthorizerResolver = args.rgRuleAuthorizerResolver; } else throw new Error('rgRuleAuthorizerResolver is not specified');

    var resolverByteCode = replaceAll(replaceAll(RGResolver.unlinked_binary, placeholder, ''), RGResolver.unlinked_binary.slice(2, 62), '').slice(0, suffixToRemove);

    return Promise.promisify(eth.getCode)(rgRuleAuthorizerResolver)
    .then(resolver => assertAsync(replaceAll(resolver, resolver.slice(prefixResolverToRemoveStart, prefixResolverToRemoveEnd), '').slice(0, suffixToRemove) == resolverByteCode, 'Provided resolver contract is not valid'))
    .then(() => deployAndReplace(RGClone, placeholder, rgRuleAuthorizerResolver))

    .then(rgRuleAuthorizerClone => rgRuleAuthorizerCloneAddress = rgRuleAuthorizerClone.address)
    .then(() => eth.contract(RGRuleAuthorizerPrototype.abi).at(rgRuleAuthorizerCloneAddress))
    .then(result => rgRuleAuthorizerContract = result)
    .then(() => safeTransaction(rgRuleAuthorizerContract.constructRuleAuthorizer, [address], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgRuleAuthorizerContract.contractOwner)())
    .then(result => assertAsync(result == address, 'rgRuleAuthorizerContract has not valid owner'))
    .then(() => {
      return success({'rgRuleAuthorizerClone': rgRuleAuthorizerCloneAddress});
    })
  }

  function updateRuleAuthorizer(args) {
    return updatePrototype(args.rgRuleAuthorizerRouter, RGRuleAuthorizerPrototype)
    .then(updatedPrototype => {
      return success({
        'upgradedRGRuleAuthorizerPrototype': updatedPrototype,
      });
    });
  }

  function updateValidator(args) {
    return updatePrototype(args.rgValidatorRouter, RGValidatorPrototype)
    .then(updatedPrototype => {
      return success({
        'upgradedRGValidatorPrototype': updatedPrototype,
      });
    });
  }

  function updateAccount(args) {
    return updatePrototype(args.rgAccountRouter, RGAccountPrototype)
    .then(updatedPrototype => {
      return success({
        'upgradedRGAccountPrototype': updatedPrototype,
      });
    });
  }

  function deployRegistryContracts() {
    return deployHelperContracts(RGRegistryPrototype)
    .then(contracts => {
      return success({
        'rgRegistryRouter': contracts.routerAddress,
        'rgRegistryResolver': contracts.resolverAddress,
        'rgRegistryPrototype': contracts.prototypeAddress
      });
    });
  }

  function deployRegistry(args) {
    let rgRegistryCloneAddress;
    let rgRegistryCloneContract;
    let rgPermissionsManagerContract;
    let rgRegistryRegisterPk;
    let rgRegistryRegisterAddress;

    if (args.rgRegistryResolver) { var rgRegistryResolver = args.rgRegistryResolver; } else throw new Error('rgRegistryResolver is not specified');
    if (args.rgPermissionsManager) { var rgPermissionsManager = args.rgPermissionsManager; } else throw new Error('rgPermissionsManager is not specified');

    var resolverByteCode = replaceAll(replaceAll(RGResolver.unlinked_binary, placeholder, ''), RGResolver.unlinked_binary.slice(2, 62), '').slice(0, suffixToRemove);

    return Promise.promisify(eth.getCode)(rgRegistryResolver)
    .then(resolver => assertAsync(replaceAll(resolver, resolver.slice(prefixResolverToRemoveStart, prefixResolverToRemoveEnd), '').slice(0, suffixToRemove) == resolverByteCode, 'Provided resolver contract is not valid'))
    .then(() => deployAndReplace(RGClone, placeholder, rgRegistryResolver))

    .then(rgRegistryClone => rgRegistryCloneAddress = rgRegistryClone.address)
    .then(() => eth.contract(RGRegistryPrototype.abi).at(rgRegistryCloneAddress))
    .then(result => rgRegistryCloneContract = result)
    .then(() => safeTransaction(rgRegistryCloneContract.constructRegistry, [address], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgRegistryCloneContract.contractOwner)())
    .then(result => assertAsync(result == address, 'rgRegistryContract has not valid owner'))
    //generate register address
    .then(() => createAccount())
    .then(register => {
      rgRegistryRegisterPk = register[0];
      rgRegistryRegisterAddress = register[1];
    })
    .then(() => eth.contract(RGPermissionsManager.abi).at(rgPermissionsManager))
    .then(result => rgPermissionsManagerContract = result)
    .then(() => safeTransaction(rgRegistryCloneContract.setupRGPermissionsManager, [rgPermissionsManagerContract.address], address, {waitReceipt: true}))
    .then(() => safeTransaction(rgPermissionsManagerContract.assignRole, [rgRegistryCloneAddress, 'register', rgRegistryRegisterAddress], address, {waitReceipt: true}))
    .then(() => {
      return success({
          'rgRegistryClone-MAIN': rgRegistryCloneAddress,
          'registerPK': rgRegistryRegisterPk,
          'registerAddress': rgRegistryRegisterAddress
      });
    })
    .then(() => {
      log(`--------ENV MERCHANT SERVICE START--------`);
      log(`REGISTRY_CONTRACT_ADDRESS=${rgRegistryCloneAddress}`);
      log(`REGISTER_ADDRESS=${rgRegistryRegisterAddress}`);
      log(`REGISTER_PK=${rgRegistryRegisterPk}`);
      log(`--------ENV MERCHANT SERVICE END--------`);
    });
  }

  function updateRegistry(args) {
    return updatePrototype(args.rgRegistryRouter, RGRegistryPrototype)
    .then(updatedPrototype => {
      return success({
        'upgradedRGRegistryPrototype': updatedPrototype,
      });
    });
  }

  function updatePrototype(rgRouterAddress, RGPrototype) {
    let rgPrototypeAddress;
    let rgRouter;

    if (rgRouterAddress) { var routerAddress = rgRouterAddress; } else throw new Error('rgRouterAddress is not specified');

    var rgRouterByteCode = replaceAll(RGRouter.unlinked_binary, RGRouter.unlinked_binary.slice(2, routerDeployPrefix), '').slice(0, suffixToRemove);

    return smartDeployContract({
      bytecode: RGPrototype.unlinked_binary,
      abi: RGPrototype.abi,
      sender: address,
      gas: 7000000,
      waitReceipt: true,
    })
    .then(prototypeInstance => {
      rgPrototypeAddress = prototypeInstance.address;
    })
    .then(() => eth.contract(RGRouter.abi).at(rgRouterAddress))
    .then(instance => rgRouter = instance)
    .then(() => Promise.promisify(rgRouter.contractOwner)())
    .then(result => assertAsync(result == address, 'Your account is not a router owner'))
    .then(() => {
      return safeTransaction(rgRouter.updateVersion, [rgPrototypeAddress], address, {waitReceipt: true});
    })
    .then(() => Promise.promisify(rgRouter.getPrototype)())
    .then(result => assertAsync(result == rgPrototypeAddress, 'Prototype version was not updated in router'))
    .then(() => rgPrototypeAddress);
  }

  function setRuleAuthorizerOnRules(args) {
    if (web3.isAddress(args.rgRuleAuthorizer)) { var rgRuleAuthorizer = args.rgRuleAuthorizer; } else throw new Error('rgRuleAuthorizer is not specified or not an address');
    if (web3.isAddress(args.rgRules)) { var rgRules = args.rgRules; } else throw new Error('rgRules is not specified or not an address');

    const rgRulesCloneContract = eth.contract(RGRulesPrototype.abi).at(rgRules);

    return safeTransaction(rgRulesCloneContract.setRuleAuthorizer, [rgRuleAuthorizer], address, {waitReceipt: true})
    .then(() => Promise.promisify(rgRulesCloneContract.ruleAuthorizer)())
    .then(result => assertAsync(result == ruleAuthorizer, 'ruleAuthorizer was not set'))
    .then(() => log(`ruleAuthorizer has been set to the rgRules contract`));
  }

  function setRegistry(args) {
    if (web3.isAddress(args.rgRegistry)) { var rgRegistry = args.rgRegistry; } else throw new Error('rgRegistry address is not specified');
    if (!rgManager) throw new Error('rgManager contract is not specified');

    return safeTransaction(rgManager.setRGRegistry, [rgRegistry], address, {waitReceipt: true})
    .then(() => Promise.promisify(rgManager.registry)())
    .then(result => assertAsync(result == rgRegistry, 'Registry was not set'))
    .then(() => log(`Registry '${rgRegistry}' has been set to the rgManager contract`));
  }

  function deployHelperContracts(rgPrototype) {
    let contracts = {};

    return smartDeployContract({
      bytecode: rgPrototype.unlinked_binary,
      abi: rgPrototype.abi,
      sender: address,
      gas: 7000000,
      waitReceipt: true,
    })
    .then(res => contracts.prototypeAddress = res.address)
    .then(() => smartDeployContract({
      bytecode: RGRouter.unlinked_binary,
      abi: RGRouter.abi,
      sender: address,
      gas: 3000000,
      waitReceipt: true,
    }))
    .then(res => {
      contracts.routerAddress = res.address;
      return safeTransaction(res.updateVersion, [contracts.prototypeAddress], address, {waitReceipt: true});
    })
    .then(() => deployAndReplace(RGResolver, placeholder, contracts.routerAddress))
    .then(res => contracts.resolverAddress = res.address)
    .then(() => contracts);
  }

  function deployRGUserContracts() {
    return deployUserContracts()
    .then(deployResult => {
      log(`--------ACCOUNTS--------`);
      log(`webWalletPrivateKey: ${deployResult.webWalletPrivateKey}, webWalletAddress: ${deployResult.webWalletAddress}`);
      log(`cosignerDeployerPK: ${deployResult.cosignerDeployerPK}, cosignerDeployerAddress: ${deployResult.cosignerDeployerAddress}`);
      log(`--------ACCOUNTS--------`);
      log(`--------ENV WALLET START--------`);
      log(`COSIGNER_CONTRACT_ADDRESS=${deployResult.doubleSigner.address}`);
      log(`--------ENV WALLET END--------`);
      logAssignerDeployResult(deployResult);
    })
  }

  function logAssignerDeployResult(deployResult) {
    log(`-------------------`);
    log(`RG user contracts setup complete!`);
    log(`Oracle 1 PK: ${deployResult.oracle1PK}, Oracle 1 Address: ${deployResult.oracle1Address}, Oracle 2 PK: ${deployResult.oracle2PK}, Oracle 2 Address: ${deployResult.oracle2Address}`);
    log(`RGUserAssigner PK: ${deployResult.rgUserAssignerPK}, RGUserAssigner Address: ${deployResult.rgUserAssigner}, RGUserDeployer PK: ${deployResult.rgUserDeployerPK}, RGUserDeployer Address: ${deployResult.rgUserDeployer}`);
    log(`RGPermissionsManager: ${deployResult.rgPermissionsManager.address}, DoubleSigner: ${deployResult.doubleSigner.address}.`);
    log(`RGUserClonePool: ${deployResult.rgUserClonePool.address}, RGUserPrototype: ${deployResult.rgUserPrototype.address}, RGProxyPrototype: ${deployResult.rgProxyPrototype.address}.`);
    log(`-------------------`);

    log(`--------ENV ASSIGNER START--------`);
    log(`ASSIGNER_ADDRESS=${deployResult.rgUserAssigner}`);
    log(`ASSIGNER_PRIVATE_KEY=${deployResult.rgUserAssignerPK}`);
    log(`COSIGNER_CONTRACT_ADDRESS=${deployResult.doubleSigner.address}`);
    log(`DEPLOYER_ADDRESS=${deployResult.rgUserDeployer}`);
    log(`DEPLOYER_PRIVATE_KEY=${deployResult.rgUserDeployerPK}`);
    log(`DEPLOY_CONTRACTS_ADDRESS=${deployResult.rgUserClonePool.address}`);
    log(`SIGNER_PRIVATE_KEY=${deployResult.webWalletPrivateKey}`);
    log(`SIGNER_ADDRESS=${deployResult.webWalletAddress}`);
    log(`--------ENV ASSIGNER END--------`);
  }

  function deployUserContracts() {
    const secondFactorAddress = '0xA7d31Ed07e95779CD264fFCd72a4a93064aba3Cc';
    let deployResult = {};

    //deploy rgPermissionsManager and names contracts
    return smartDeployContract({
      bytecode: RGPermissionsManager.unlinked_binary,
      abi: RGPermissionsManager.abi,
      sender: address,
      waitReceipt: true,
    }).then(instance => {
      deployResult.rgPermissionsManager = instance;
    //generate 2 signer accounts and 2 oracles accounts
    }).then(() => createAccount())
    .then(result => {
      deployResult.oracle1PK = result[0];
      deployResult.oracle1Address = result[1];
    }).then(() => createAccount())
    .then(result => {
      deployResult.oracle2PK = result[0];
      deployResult.oracle2Address = result[1];
    }).then(() => createAccount())
    .then(result => {
      deployResult.rgUserDeployerPK = result[0];
      deployResult.rgUserDeployer = result[1];
    }).then(() => createAccount())
    .then(result => {
      deployResult.rgUserAssignerPK = result[0];
      deployResult.rgUserAssigner = result[1];
    })
    //deploy double signer
    .then(() => {
      if (parsedArgs.devCosignerDeployer) {
        //for local development only
        deployResult.cosignerDeployerPK = '0x302385e9b1dccff470812e84873db6009f5a854c62fd9feddf936d429338b6c9';
        address = setPrivateKey(deployResult.cosignerDeployerPK.slice(-64));
      } else {
        deployResult.cosignerDeployerPK = parsedArgs.privateKey;
      }
      deployResult.cosignerDeployerAddress = address;
    })
    .then(() => smartDeployContract({
      constructorArgs: [deployResult.oracle1Address, deployResult.oracle2Address],
      bytecode: DoubleSignerContract.unlinked_binary,
      abi: DoubleSignerContract.abi,
      sender: address,
      waitReceipt: true,
    })).then(instance => {
      deployResult.doubleSigner = instance;
    })
    .then(() => address = setPrivateKey(parsedArgs.privateKey.slice(-64)))
    .then(() => smartDeployContract({
      bytecode: RGProxyPrototype.unlinked_binary,
      abi: RGProxyPrototype.abi,
      sender: address,
      waitReceipt: true,
    }))
    .then(instance => {
      deployResult.rgProxyPrototype = instance;
    })
    .then(() => {
      return smartDeployContract({
        bytecode: RGUserPrototype.unlinked_binary,
        abi: RGUserPrototype.abi,
        sender: address,
        waitReceipt: true,
      });
    })
    .then(instance => {
      deployResult.rgUserPrototype = instance;
    })
    .then(() => {
      var bytecode = replaceAll(UserClonePool.unlinked_binary, '1231231231231231231231231231231231231231', deployResult.rgUserPrototype.address.slice(-40), 2);
      bytecode = replaceAll(bytecode, '2231231231231231231231231231231231231232', deployResult.rgProxyPrototype.address.slice(-40), 2);
      bytecode = replaceAll(bytecode, '3231231231231231231231231231231231231233', deployResult.doubleSigner.address.slice(-40), 4);
      return smartDeployContract({
        bytecode: bytecode,
        abi: UserClonePool.abi,
        sender: address,
        waitReceipt: true,
      });
    })
    .then(instance => {
      deployResult.rgUserClonePool = instance;
    })
    .then(() => {
      var signers = [deployResult.rgUserAssigner, deployResult.rgUserDeployer];
      return safeTransactions([
        safeTransactionFunction(deployResult.rgUserClonePool.setupRGPermissionsManager, [deployResult.rgPermissionsManager.address], address)
      ]
      .concat(signers.map(signer => safeTransactionFunction(deployResult.rgPermissionsManager.assignRole, [deployResult.rgUserClonePool.address, 'deploy', signer], address)))
      .concat(signers.map(signer => safeTransactionFunction(deployResult.rgPermissionsManager.assignRole, [deployResult.rgUserClonePool.address, 'assign', signer], address)))
      , false, FAST_RUN);
    })
    //generate web-wallet address
    .then(() => createAccount())
    .then(webWallet => {
      deployResult.webWalletPrivateKey = webWallet[0];
      deployResult.webWalletAddress = webWallet[1];
    })
    //set webWalletAddress as 1st signer for password recovery
    .then(() => address = setPrivateKey(deployResult.oracle1PK.slice(-64)))
    .then(() => safeTransaction(deployResult.doubleSigner.addSigner, [deployResult.webWalletAddress], address, {waitReceipt: true}))
    .then(() => Promise.promisify(deployResult.doubleSigner.isSigner)(deployResult.webWalletAddress))
    .then(result => assertAsync(result, 'webWalletAddress Signer address was not set on Double signer contract'))
    .then(() => log(`webWalletAddress Signer ${deployResult.webWalletAddress} has been set by ${address} oracle on double signer`))
    //set 2ndFactor as 2nd signer for password recovery
    .then(() => address = setPrivateKey(deployResult.oracle2PK.slice(-64)))
    .then(() => safeTransaction(deployResult.doubleSigner.addSigner, [secondFactorAddress], address, {waitReceipt: true}))
    .then(() => Promise.promisify(deployResult.doubleSigner.isSigner)(secondFactorAddress))
    .then(result => assertAsync(result, 'secondFactorAddress Signer address was not set on Double signer contract'))
    .then(() => log(`secondFactorAddress Signer ${secondFactorAddress} has been set by ${address} oracle on double signer`))
    .then(() => deployResult);
  }

  function deployRGContracts(args) {
    const rgRulesDefault = '0x0000000000000000000000000000000000000000';

    let rgOwnerPk;
    let rgOwnerAddress;
    let rgRegistryRegisterPk;
    let rgRegistryRegisterAddress;

    let deployResult;
    let rgManagerRouterAddress;
    let rgManagerResolverAddress;
    let rgManagerPrototypeAddress;
    let rgAssetOwnershipCardRouterAddress;
    let rgAssetOwnershipCardResolverAddress;
    let rgAssetOwnershipCardCloneFactoryAddress;
    let rgAssetOwnershipCardPrototypeAddress;

    let rgRegistryRouterAddress;
    let rgRegistryResolverAddress;
    let rgRegistryPrototypeAddress;
    let rgRegistryCloneAddress;
    let rgRegistryCloneContract;

    let rgManagerCloneAddress;
    let rgManagerBlockNumber;
    let rgManagerCloneContract;

    let hotWalletPrivateKey;
    let hotWalletAddress;
    let transactionSenderPrivateKey;
    let transactionSenderAddress;
    let rulesServiceAccountPrivateKey;
    let rulesServiceAccountAddress;

    let rgRulesRouterAddress;
    let rgRulesResolverAddress;
    let rgRulesPrototypeAddress;
    let rgRulesCloneAddress;

    let rgRulesCloneContract;

    let rgOrganizationRouterAddress;
    let rgOrganizationResolverAddress;
    let rgOrganizationPrototypeAddress;
    let rgAccountRouterAddress;
    let rgAccountResolverAddress;
    let rgAccountPrototypeAddress;
    let rgRuleAuthorizerRouterAddress;
    let rgRuleAuthorizerResolverAddress;
    let rgRuleAuthorizerPrototypeAddress;
    let rgRuleAuthorizerCloneAddress;
    let rgRuleAuthorizerContract;
    let rgValidatorRouterAddress;
    let rgValidatorResolverAddress;
    let rgValidatorPrototypeAddress;
    let rgValidatorCloneAddress;
    let rgOrganizationFactoryAddress;
    let orgSenderAccountPrivateKey;
    let orgSenderAccountAddress;
    let userPool;
    let masterWalletUserProxy;
    let masterWalletUserContract;
    let masterWalletAccountPrivateKey;
    let masterWalletAccountAddress;

    var noCosigning = args.noCosigning ? args.noCosigning : false;
    var orgPrototype = noCosigning ? FakeOrganizationPrototype : RGOrganizationPrototype;

    return deployUserContracts()
    .then(result => deployResult = result)
    //generate master wallet account
    .then(() => createAccount())
    .then(masterWalletAccount => {
      masterWalletAccountPrivateKey = masterWalletAccount[0];
      masterWalletAccountAddress = masterWalletAccount[1];
    })
    //deploy and assign MASTER_WALLET_USER_PROXY_ADDRESS and MASTER_WALLET_USER_CONTRACT_ADDRESS
    .then(() => address = setPrivateKey(deployResult.rgUserAssignerPK.slice(-64))) // rgUserAssignerPK will deploy and assign orgSender user contract
    .then(() => eth.contract(UserClonePool.abi).at(deployResult.rgUserClonePool.address))
    .then(pool => userPool = pool)
    .then(() => safeTransaction(userPool.deployWithDefaultCosigner, [], address, {waitReceipt: true}))
    .then(txResult => Promise.promisify(eth.getTransactionReceipt)(txResult[2]))
    .then(txReceipt => {
      masterWalletUserContract = util.addHexPrefix(txReceipt.logs[0].data.slice(26, 66));
      masterWalletUserProxy = util.addHexPrefix(txReceipt.logs[0].data.slice(-40));
    })
    .then(() => safeTransaction(userPool.assignTo, [masterWalletUserContract, masterWalletAccountAddress, false], address, {waitReceipt: true}))
    //generate rgOwnerAccount
    .then(() => createAccount())
    .then(rgOwnerAccount => {
      rgOwnerPk = rgOwnerAccount[0];
      rgOwnerAddress = rgOwnerAccount[1];
    })
    .then(() => address = setPrivateKey(rgOwnerPk.slice(-64)))
    //generate register address
    .then(() => createAccount())
    .then(register => {
      rgRegistryRegisterPk = register[0];
      rgRegistryRegisterAddress = register[1];
    })
    //deploy registry contracts
    .then(() => deployHelperContracts(RGRegistryPrototype))
    .then(contracts => {
      rgRegistryPrototypeAddress = contracts.prototypeAddress;
      rgRegistryRouterAddress = contracts.routerAddress;
      rgRegistryResolverAddress = contracts.resolverAddress;
    })
    //deploy RG contracts
    .then(() => deployHelperContracts(RGManagerPrototype))
    .then(contracts => {
      rgManagerPrototypeAddress = contracts.prototypeAddress;
      rgManagerRouterAddress = contracts.routerAddress;
      rgManagerResolverAddress = contracts.resolverAddress;
    })
    .then(() => deployHelperContracts(RGAssetOwnershipCardPrototype))
    .then(contracts => {
      rgAssetOwnershipCardPrototypeAddress = contracts.prototypeAddress;
      rgAssetOwnershipCardRouterAddress = contracts.routerAddress;
      rgAssetOwnershipCardResolverAddress = contracts.resolverAddress;
    })
    .then(() => deployAndReplace(RGClone, placeholder, rgRegistryResolverAddress))
    .then(rgRegistryClone => rgRegistryCloneAddress = rgRegistryClone.address)
    .then(() => eth.contract(RGRegistryPrototype.abi).at(rgRegistryCloneAddress))
    .then(result => rgRegistryCloneContract = result)
    //setup rgRegistry contract
    .then(() => safeTransaction(rgRegistryCloneContract.constructRegistry, [address], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgRegistryCloneContract.contractOwner)())
    .then(result => assertAsync(result == address, 'rgRegistryCloneContract has not valid owner'))
    .then(() => safeTransaction(rgRegistryCloneContract.setupRGPermissionsManager, [deployResult.rgPermissionsManager.address], address, {waitReceipt: true}))
    .then(() => safeTransaction(deployResult.rgPermissionsManager.assignRole, [rgRegistryCloneAddress, 'register', rgRegistryRegisterAddress], address, {waitReceipt: true}))
    .then(() => deployAndReplace(RGAssetOwnershipCardCloneFactory, placeholder, rgAssetOwnershipCardResolverAddress))
    .then(rgAssetOwnershipCardCloneFactory => rgAssetOwnershipCardCloneFactoryAddress = rgAssetOwnershipCardCloneFactory.address)
    //deploy RGmanager prototype with not set rgRules contract
    .then(() => deployAndReplace(RGClone, placeholder, rgManagerResolverAddress))
    .then(rgManagerClone => {
      rgManagerCloneAddress = rgManagerClone.address;
      return Promise.promisify(eth.getTransactionReceipt)(rgManagerClone.transactionHash)
    })
    .then(result => rgManagerBlockNumber = result.blockNumber)
    .then(() => eth.contract(RGManagerPrototype.abi).at(rgManagerCloneAddress))
    .then(rgManagerClone => rgManagerCloneContract = rgManagerClone)
    .then(() => safeTransaction(rgManagerCloneContract.constructRGManager, [address, config.baseUnit, rgAssetOwnershipCardCloneFactoryAddress, rgRulesDefault, rgRegistryCloneAddress], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgManagerCloneContract.contractOwner)())
    .then(result => assertAsync(result == address, 'rgManagerCloneContract has not valid owner'))
    //generate hot-wallet address
    .then(() => createAccount())
    .then(hotWallet => {
      hotWalletPrivateKey = hotWallet[0];
      hotWalletAddress = hotWallet[1];
    })
    //generate transaction sender address for wallet
    .then(() => createAccount())
    .then(transactionSender => {
      transactionSenderPrivateKey = transactionSender[0];
      transactionSenderAddress = transactionSender[1];
    })
    //DEPLOY RG rules contracts
    .then(() => deployHelperContracts(RGRulesPrototype))
    .then(contracts => {
      rgRulesPrototypeAddress = contracts.prototypeAddress;
      rgRulesRouterAddress = contracts.routerAddress;
      rgRulesResolverAddress = contracts.resolverAddress;
    })
    .then(() => deployAndReplace(RGClone, placeholder, rgRulesResolverAddress))
    .then(rgRulesClone => rgRulesCloneAddress = rgRulesClone.address)
    .then(() => eth.contract(RGRulesPrototype.abi).at(rgRulesCloneAddress))
    .then(result => rgRulesCloneContract = result)
    //setup rgRules contract
    .then(() => safeTransaction(rgRulesCloneContract.constructTransactionRules, [address], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgRulesCloneContract.contractOwner)())
    .then(result => assertAsync(result == address, 'rgRulesCloneContract has not valid owner'))
    //add web-wallet to whitelist
    .then(() => safeTransaction(rgRulesCloneContract.addToWhitelist, [transactionSenderAddress], address, {waitReceipt: true}))
    //add hot-wallet to whitelist
    .then(() => safeTransaction(rgRulesCloneContract.addToWhitelist, [hotWalletAddress], address, {waitReceipt: true}))
    //setup rgRules on rgManager contract
    .then(() => safeTransaction(rgManagerCloneContract.setRGTransactionRules, [rgRulesCloneAddress], address, {waitReceipt: true}))
    .then(() => log(`rgRules contract ${rgRulesCloneAddress} has been set for RG manager ${rgManagerCloneContract.address}.`))
    //deploy organization contracts
    .then(() => deployHelperContracts(orgPrototype))
    .then(contracts => {
      rgOrganizationPrototypeAddress = contracts.prototypeAddress;
      rgOrganizationRouterAddress = contracts.routerAddress;
      rgOrganizationResolverAddress = contracts.resolverAddress;
    })
    //deploy account contracts
    .then(() => deployHelperContracts(RGAccountPrototype))
    .then(contracts => {
      rgAccountPrototypeAddress = contracts.prototypeAddress;
      rgAccountRouterAddress = contracts.routerAddress;
      rgAccountResolverAddress = contracts.resolverAddress;
    })
    //deploy rgRuleAuthorizer contracts
    .then(() => deployHelperContracts(RGRuleAuthorizerPrototype))
    .then(contracts => {
      rgRuleAuthorizerPrototypeAddress = contracts.prototypeAddress;
      rgRuleAuthorizerRouterAddress = contracts.routerAddress;
      rgRuleAuthorizerResolverAddress = contracts.resolverAddress;
    })
    //generate rulesService account
    .then(() => createAccount())
    .then(rulesServiceAccount => {
      rulesServiceAccountPrivateKey = rulesServiceAccount[0];
      rulesServiceAccountAddress = rulesServiceAccount[1];
    })
    //deploy rgRuleAuthorizer Clone
    .then(() => deployAndReplace(RGClone, placeholder, rgRuleAuthorizerResolverAddress))
    .then(rgRuleAuthorizerClone => rgRuleAuthorizerCloneAddress = rgRuleAuthorizerClone.address)
    .then(() => eth.contract(RGRuleAuthorizerPrototype.abi).at(rgRuleAuthorizerCloneAddress))
    .then(result => rgRuleAuthorizerContract = result)
    //Set rulesService as signer on rgRuleAuthorizer
    .then(() => safeTransaction(rgRuleAuthorizerContract.constructRuleAuthorizer, [address], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgRuleAuthorizerContract.contractOwner)())
    .then(result => assertAsync(result == address, 'rgRuleAuthorizerContract has not valid owner'))
    .then(() => safeTransaction(rgRuleAuthorizerContract.setRuleAuthorizer, [rulesServiceAccountAddress], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgRuleAuthorizerContract.authorizer)())
    .then(result => assertAsync(result == rulesServiceAccountAddress, 'authorizer was not set properly on rgRuleAuthorizerContract'))
    //deploy rgOrganizationFactory
    .then(() => RGOrganizationFactory.unlinked_binary = replaceAll(RGOrganizationFactory.unlinked_binary, placeholder, rgAccountResolverAddress.slice(-40)))
    .then(() => RGOrganizationFactory.unlinked_binary = replaceAll(RGOrganizationFactory.unlinked_binary, placeholder2, rgOrganizationResolverAddress.slice(-40)))
    .then(() => RGOrganizationFactory.unlinked_binary = replaceAll(RGOrganizationFactory.unlinked_binary, placeholder3, rgRuleAuthorizerCloneAddress.slice(-40)))
    .then(() => smartDeployContract({
      bytecode: RGOrganizationFactory.unlinked_binary,
      abi: RGOrganizationFactory.abi,
      sender: address,
      gas: 3000000,
      waitReceipt: true,
    }))
    .then(rgOrganizationFactory => {
      rgOrganizationFactoryAddress = rgOrganizationFactory.address;
    })
    //set rules authorizer contract on rgRules contract
    .then(() => {
      return safeTransaction(rgRulesCloneContract.setRuleAuthorizer, [rgRuleAuthorizerCloneAddress], address, {waitReceipt: true});
    })
    .then(() => Promise.promisify(rgRulesCloneContract.ruleAuthorizer)())
    .then(result => assertAsync(result == rgRuleAuthorizerCloneAddress, 'ruleAuthorizer was not set'))
    .then(() => log(`ruleAuthorizer has been set to the rgRules contract`))
    //generate orgSender account
    .then(() => createAccount())
    .then(orgSenderAccount => {
      orgSenderAccountPrivateKey = orgSenderAccount[0];
      orgSenderAccountAddress = orgSenderAccount[1];
    })
    //add orgSenderAccountAddress to whitelist
    .then(() => safeTransaction(rgRulesCloneContract.addToWhitelist, [orgSenderAccountAddress], address, {waitReceipt: true}))
    //deploy rgRuleAuthorizer contracts
    .then(() => deployHelperContracts(RGValidatorPrototype))
    .then(contracts => {
      rgValidatorPrototypeAddress = contracts.prototypeAddress;
      rgValidatorRouterAddress = contracts.routerAddress;
      rgValidatorResolverAddress = contracts.resolverAddress;
    })
    .then(() => deployAndReplace(RGClone, placeholder, rgValidatorResolverAddress))
    .then(rgValidatorClone => rgValidatorCloneAddress = rgValidatorClone.address)
    .then(() => {
      return success({
        'rgManagerPrototype': rgManagerPrototypeAddress,
        'rgManagerRouter': rgManagerRouterAddress,
        'rgManagerResolver': rgManagerResolverAddress,
        'rgAssetOwnershipCardPrototype': rgAssetOwnershipCardPrototypeAddress,
        'rgAssetOwnershipCardRouter': rgAssetOwnershipCardRouterAddress,
        'rgAssetOwnershipCardResolver': rgAssetOwnershipCardResolverAddress,
        'rgAssetOwnershipCardCloneFactory': rgAssetOwnershipCardCloneFactoryAddress,
        'rgRegistryRouter': rgRegistryRouterAddress,
        'rgRegistryResolver': rgRegistryResolverAddress,
        'rgRegistryPrototype': rgRegistryPrototypeAddress,
        'rgRegistryClone-MAIN': rgRegistryCloneAddress,
        'rgManagerClone-MAIN': rgManagerCloneAddress
      });
    })
    .then(() => {
      return success({
        'rgRulesRouter': rgRulesRouterAddress,
        'rgRulesResolver': rgRulesResolverAddress,
        'rgRulesPrototype': rgRulesPrototypeAddress,
        'rgRulesClone-MAIN': rgRulesCloneAddress
      });
    })
    .then(() => {
      return success({
        'rgOrganizationRouter': rgOrganizationRouterAddress,
        'rgOrganizationResolver': rgOrganizationResolverAddress,
        'rgOrganizationPrototype': rgOrganizationPrototypeAddress,
        'rgAccountRouter': rgAccountRouterAddress,
        'rgAccountResolver': rgAccountResolverAddress,
        'rgAccountPrototype': rgAccountPrototypeAddress,
        'rgRuleAuthorizerRouter': rgRuleAuthorizerRouterAddress,
        'rgRuleAuthorizerResolver': rgRuleAuthorizerResolverAddress,
        'rgRuleAuthorizerPrototype': rgRuleAuthorizerPrototypeAddress,
        'rgRuleAuthorizerClone-MAIN': rgRuleAuthorizerCloneAddress,
        'rgOrganizationFactoryAddress': rgOrganizationFactoryAddress,
        'rgValidatorRouter': rgValidatorRouterAddress,
        'rgValidatorResolver': rgValidatorResolverAddress,
        'rgValidatorPrototype': rgValidatorPrototypeAddress,
        'rgValidatorClone-MAIN': rgValidatorCloneAddress,
      });
    })
    .then(() => {
      log(`--------ACCOUNTS--------`);
      log(`webWalletPrivateKey: ${deployResult.webWalletPrivateKey}, webWalletAddress: ${deployResult.webWalletAddress}`);
      log(`hotWalletPrivateKey: ${hotWalletPrivateKey}, hotWalletAddress: ${hotWalletAddress} (EXCHANGE_TOKENS_ACCOUNT_ADDRESS, EXCHANGE_TOKENS_ACCOUNT_PK)`);
      log(`transactionSenderPrivateKey: ${transactionSenderPrivateKey}, transactionSenderAddress: ${transactionSenderAddress} (TRANSACTION_SENDER_ADDRESS, TRANSACTION_SENDER_PK)`);
      log(`rulesServiceAccountPrivateKey: ${rulesServiceAccountPrivateKey}, rulesServiceAccountAddress(is rgRuleAuthorizer signer): ${rulesServiceAccountAddress}`);
      log(`cosignerDeployerPK: ${deployResult.cosignerDeployerPK}, cosignerDeployerAddress: ${deployResult.cosignerDeployerAddress}`);
      log(`registerPK: ${rgRegistryRegisterPk}, registerAddress: ${rgRegistryRegisterAddress}`);
      log(`--------ACCOUNTS--------`);
    })
    .then(() => {
      logAssignerDeployResult(deployResult);
      log(`--------ENV WALLET START--------`);
      log(`COSIGNER_CONTRACT_ADDRESS=${deployResult.doubleSigner.address}`);
      log(`TRANSACTION_SENDER_ADDRESS=${transactionSenderAddress}`);
      log(`TRANSACTIONS_SENDER_PK=${transactionSenderPrivateKey}`);
      log(`EXCHANGE_TOKENS_ACCOUNT_ADDRESS=${hotWalletAddress}`);
      log(`EXCHANGE_TOKENS_ACCOUNT_PK=${hotWalletPrivateKey}`);
      log(`PROXY_CONTRACT_ADDRESS=${rgManagerCloneAddress}`);
      log(`RG_OWNER_ADDRESS=${rgOwnerAddress}`);
      log(`RG_OWNER_PK=${rgOwnerPk}`);
      log(`ORG_FACTORY_ADDRESS=${rgOrganizationFactoryAddress}`);
      log(`ORG_SENDER_ADDRESS=${orgSenderAccountAddress}`);
      log(`ORG_SENDER_PK=${orgSenderAccountPrivateKey}`);
      log(`MASTER_WALLET_USER_CONTRACT_ADDRESS=${masterWalletUserContract}`);
      log(`MASTER_WALLET_USER_PROXY_ADDRESS=${masterWalletUserProxy}`);
      log(`ORG_PROTOTYPE_ADDRESS=${rgOrganizationPrototypeAddress}`);
      log(`RG_MANAGER_BLOCKNUMBER=${rgManagerBlockNumber}`);
      log(`FORWARDER_CONTRACT_ADDRESS=${rgValidatorCloneAddress}`);
      log(`DECISION_SERVICE_AUTHORIZER_CONTRACT=${rgRuleAuthorizerCloneAddress}`);
      log(`TRANSACTION_RULES_CONTRACT_ADDRESS=${rgRulesCloneAddress}`);
      log(`--------ENV WALLET END--------`);

      log(`--------ENV ASSET MANAGER START--------`);
      log(`ETOKEN2_CONTRACT_ADDRESS=${rgManagerCloneAddress}`);
      log(`RG_OWNER_ADDRESS=${rgOwnerAddress}`);
      log(`RG_OWNER_PK=${rgOwnerPk}`);
      log(`ASSET_HOLDER_ADDRESS=${hotWalletAddress}`);
      log(`--------ENV ASSET MANAGER END--------`);

      log(`--------ENV DECISION SERVICE START--------`);
      log(`FORWARDER_CONTRACT_ADDRESS=${rgValidatorCloneAddress}`);
      log(`DECISION_SERVICE_ADDRESS=${rulesServiceAccountAddress}`);
      log(`DECISION_SERVICE_PK=${rulesServiceAccountPrivateKey}`);
      log(`DECISION_SERVICE_AUTHORIZER_CONTRACT=${rgRuleAuthorizerCloneAddress}`);
      log(`PROXY_CONTRACT_ADDRESS=${rgManagerCloneAddress}`);
      log(`MASTER_WALLET_USER_PROXY_ADDRESS=${masterWalletUserProxy}`);
      log(`MASTER_WALLET_USER_ADDRESS=${masterWalletAccountAddress}`);
      log(`MASTER_WALLET_USER_PK=${masterWalletAccountPrivateKey}`);
      log(`TRANSACTION_RULES_CONTRACT_ADDRESS=${rgRulesCloneAddress}`);
      log(`--------ENV DECISION SERVICE END--------`);

      log(`--------ENV MERCHANT SERVICE START--------`);
      log(`REGISTRY_CONTRACT_ADDRESS=${rgRegistryCloneAddress}`);
      log(`PROXY_CONTRACT_ADDRESS=${rgManagerCloneAddress}`);
      log(`REGISTER_ADDRESS=${rgRegistryRegisterAddress}`);
      log(`REGISTER_PK=${rgRegistryRegisterPk}`);
      log(`--------ENV MERCHANT SERVICE END--------`);
    });
  }

  function setupFees(args) {
    if (args.defaultFeeTimeInSec) { var defaultFeeTimeInSec = args.defaultFeeTimeInSec; } else throw new Error('DefaultFeeTimeInSec is not specified');
    if (args.yearlyFeePercent) { var yearlyFeePercent = web3.toBigNumber(args.yearlyFeePercent); } else throw new Error('YearlyFeePercent not specified');
    if (web3.isAddress(args.feeCollector)) { var feeCollector = args.feeCollector; } else throw new Error('FeeCollector address is not specified');
    if (!rgManager) throw new Error('rgManager contract is not specified');
    //fee time from 1/1/2018 till 1/1/2218
    if (defaultFeeTimeInSec < 1514764800 || defaultFeeTimeInSec > 7826112000) throw new Error('Please set fee time in timestamp sec in range from 1/1/2018 till 1/1/2218');
    if (yearlyFeePercent.decimalPlaces() > 2) throw new Error('Please set yearlyFeePercent with decimal places up to 2');
    // yearlyFeePercent from 0% to 10%
    if (yearlyFeePercent.lte(0) || yearlyFeePercent.gte(10)) throw new Error('Please set yearlyFeePercent in range from 0% to 10%');
    const yearlyFeeMultiplied = yearlyFeePercent.mul(100);

    return Promise.promisify(rgManager.defaultFeeTime)()
    .then(result => assertAsync(result.eq(0), 'Default fee time already set on rg manager'))
    .then(() => Promise.promisify(rgManager.yearlyFee)())
    .then(result => assertAsync(result.eq(0), 'Yearly fee already set on rg manager'))
    .then(() => Promise.promisify(rgManager.feeCollector)())
    .then(result => assertAsync(result == '0x0000000000000000000000000000000000000000', 'Fee collector already set on rg manager'))
    .then(() => Promise.promisify(rgManager.rgOwner)())
    .then(result => assertAsync(result == address, 'Your account is not a rgOwner account'))

    .then(() => safeTransaction(rgManager.setDefaultFeeTime, [defaultFeeTimeInSec], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgManager.defaultFeeTime)())
    .then(result => assertAsync(result.eq(defaultFeeTimeInSec), 'Default fee time was not set'))
    .then(() => safeTransaction(rgManager.setFeeCollectorAddress, [feeCollector], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgManager.feeCollector)())
    .then(result => assertAsync(result == feeCollector, 'Fee collector was not set'))
    .then(() => safeTransaction(rgManager.setYearlyFee, [yearlyFeeMultiplied], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgManager.yearlyFee)())
    .then(result => assertAsync(result.eq(yearlyFeeMultiplied), 'Yearly fee was not set'))
    .then(() => {
      log(`defaultFeeTime: ${defaultFeeTimeInSec}, yearlyFeePercent: ${yearlyFeePercent} (yearlyFeeMultiplied: ${yearlyFeeMultiplied}), feeCollector: ${feeCollector}`);
    })
  }

  function setDefaultFeeTime(args) {
    if (args.defaultFeeTimeInSec) { var defaultFeeTimeInSec = args.defaultFeeTimeInSec; } else throw new Error('DefaultFeeTimeInSec is not specified');
    if (!rgManager) throw new Error('rgManager contract is not specified');
    //fee time from 1/1/2018 till 1/1/2218
    if (defaultFeeTimeInSec < 1514764800 || defaultFeeTimeInSec > 7826112000) throw new Error('Please set fee time in timestamp sec in range from 1/1/2018 till 1/1/2218');

    return Promise.promisify(rgManager.rgOwner)()
    .then(result => assertAsync(result == address, 'Your account is not a rgOwner account'))

    .then(() => safeTransaction(rgManager.setDefaultFeeTime, [defaultFeeTimeInSec], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgManager.defaultFeeTime)())
    .then(result => assertAsync(result.eq(defaultFeeTimeInSec), 'Default fee time was not set'))
    .then(() => {
      log(`defaultFeeTime is set to ${defaultFeeTimeInSec}`);
    })
  }

  function updateDefaultFeeTime(args) {
    if (args.defaultFeeTimeInSec) { var defaultFeeTimeInSec = args.defaultFeeTimeInSec; } else throw new Error('DefaultFeeTimeInSec is not specified');
    if (!rgManager) throw new Error('rgManager contract is not specified');
    //fee time from 1/1/2018 till 1/1/2218
    if (defaultFeeTimeInSec < 1514764800 || defaultFeeTimeInSec > 7826112000) throw new Error('Please set fee time in timestamp sec in range from 1/1/2018 till 1/1/2218');

    return Promise.promisify(rgManager.rgOwner)()
    .then(result => assertAsync(result == address, 'Your account is not a rgOwner account'))

    .then(() => safeTransaction(rgManager.updateDefaultFeeTimeSameDay, [defaultFeeTimeInSec], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgManager.defaultFeeTime)())
    .then(result => assertAsync(result.eq(defaultFeeTimeInSec), 'Default fee time was not set'))
    .then(() => {
      log(`defaultFeeTime is set to ${defaultFeeTimeInSec}`);
    })
  }

  function deployUpdateAssetCardFactory(args) {
    if (web3.isAddress(args.rgAssetOwnershipCardResolver)) { var rgAssetOwnershipCardResolver = args.rgAssetOwnershipCardResolver; } else throw new Error('rgAssetOwnershipCardResolver address is not specified');
    if (!rgManager) throw new Error('rgManager contract is not specified');

    let rgAssetOwnershipCardCloneFactoryAddress;

    return deployAndReplace(RGAssetOwnershipCardCloneFactory, placeholder, rgAssetOwnershipCardResolver)
    .then(rgAssetOwnershipCardCloneFactory => {
      rgAssetOwnershipCardCloneFactoryAddress = rgAssetOwnershipCardCloneFactory.address;
    })
    .then(() => Promise.promisify(rgManager.rgOwner)())
    .then(result => assertAsync(result == address, 'Your account is not a rgOwner account'))
    .then(() => safeTransaction(rgManager.setRGAssetOwnershipCardCloneFactory, [rgAssetOwnershipCardCloneFactoryAddress], address, {waitReceipt: true}))
    .then(() => Promise.promisify(rgManager.cloneFactory)())
    .then(result => assertAsync(result == rgAssetOwnershipCardCloneFactoryAddress, 'rgAssetOwnershipCardCloneFactory address was not updated on rg manager'))
    .then(() => log(`New rgAssetOwnershipCardCloneFactory ${rgAssetOwnershipCardCloneFactoryAddress} has been set on rgManager`));
  }

  sanityCheck(parsedArgs)
  .then(transformArgs)
  .then(args => {
    switch (args.actionType) {
      case 'deployMigrationContracts':
        return deployMigrationContracts();
      case 'deployRulesContracts':
        return deployRulesContracts(args);
      case 'deployRGManager':
        return setupRGManager(args);
      case 'updateRGContracts':
        return updateRGContracts(args);
      case 'updateRulesContracts':
        return updateRulesContracts(args);
      case 'addToWhitelist':
        return addToWhitelist(args);
      case 'removeFromWhitelist':
        return removeFromWhitelist(args);
      case 'addToNonFeeList':
        return addToNonFeeList(args);
      case 'removeFromNonFeeList':
        return removeFromNonFeeList(args);
      case 'fullUpdateRGContracts':
        return fullUpdateRGContracts(args);
      case 'deployWithoutGcoins':
        return deployWithoutGcoins(args);
      case 'mintGcoins':
        return mintGcoins(args);
      case 'createHotWallet':
        return generateRGHotWallet();
      case 'transferGCoins':
        return transferGCoins(args);
      case 'migrateChip':
        return migrateChip(args);
      case 'setSignerByOracle':
        return setSignerByOracle(args);
      case 'deployOrganizationContracts':
        return deployOrganizationContracts(args);
      case 'deployAccountContracts':
        return deployAccountContracts(args);
      case 'updateOrganizations':
        return updateOrganizations(args);
      case 'deployRuleAuthorizerContracts':
        return deployRuleAuthorizerContracts(args);
      case 'deployRuleAuthorizer':
        return deployRuleAuthorizer(args);
      case 'updateRuleAuthorizer':
        return updateRuleAuthorizer(args);
      case 'updateValidator':
        return updateValidator(args);
      case 'deployOrganizationFactory':
        return deployOrganizationFactory(args);
      case 'setRuleAuthorizerOnRules':
        return setRuleAuthorizerOnRules(args);
      case 'deployRGContracts':
        return deployRGContracts(args);
      case 'updateRGManager':
        return updateRGManager(args);
      case 'setupFees':
        return setupFees(args);
      case 'setDefaultFeeTime':
        return setDefaultFeeTime(args);
      case 'updateDefaultFeeTime':
        return updateDefaultFeeTime(args);
      case 'deployUserContracts':
        return deployRGUserContracts();
      case 'deployUpdateAssetCardFactory':
        return deployUpdateAssetCardFactory(args);
      case 'deployRegistryContracts':
        return deployRegistryContracts(args);
      case 'deployRegistry':
        return deployRegistry(args);
      case 'updateRegistry':
        return updateRegistry(args);
      case 'setRegistry':
        return setRegistry(args);
      case 'registerAsset':
        return registerAsset(args);
      default:
        throw new Error(`Unknown action type '${args.actionType}'.`);
    }
  }).catch(err => {
    console.error(JSON.stringify({ error: err.message || err }));
  });
