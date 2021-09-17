"use strict";
const Reverter = require('../helpers/reverter');
const replaceAll = require('../helpers/replaceAll');
const RGManager = artifacts.require('./RGManagerPrototype_v10.sol');
const RGAssetOwnershipCardCloneFactory = artifacts.require('./RGAssetOwnershipCardCloneFactory.sol');
const RGAssetOwnershipCard = artifacts.require('./RGAssetOwnershipCardPrototype_v10.sol');
const RGTransactionRules = artifacts.require('./RGTransactionRulesPrototype_v10.sol');
const RGRuleAuthorizer = artifacts.require('./RGRuleAuthorizerPrototype_v10.sol');
const RGRegistry = artifacts.require('./RGRegistryPrototype_v10.sol');
const RGPermissionsManager = artifacts.require('./RGPermissionsManager.sol');
const ownedBase = require('../ownedBase');
const util = require('ethereumjs-util');
const increaseTime = require('../helpers/increaseTime');
const deployHelperContracts = require('../helpers/deployHelperContracts');

function icap(asset, institution, client) {
  return web3.eth.iban.fromBban(asset + institution + client).toString();
}

function addLeftToAddressWithPrefix(addressValue) {
  return util.addHexPrefix(util.setLengthLeft(util.toBuffer(addressValue), 32).toString('hex'));
}

function addLeftToInt(intValue) {
  return util.setLengthLeft(util.toBuffer(web3.toHex(intValue)), 32).toString('hex');
}

function calculateFee(daysValue, userBalance, yearlyFeeValue) {
  let tempFeeToCollect = 0;
  let tempDailyFee;
  const divisibilityFactor = 10000;

  for (var i = daysValue; i > 0; i--) {
      tempDailyFee = yearlyFeeValue * (userBalance - tempFeeToCollect);
      tempFeeToCollect += roundUp(tempDailyFee, divisibilityFactor * 365);
  }
  return tempFeeToCollect;
}

function roundUp(numerator, denominator) {
  return Math.floor(numerator / denominator) + (numerator % denominator == 0 ? 0 : 1);
}

contract('RGManager v10', function(accounts) {
  const reverter = new Reverter(web3);
  const rgOwner = accounts[0];
  const rgWallet = accounts[6];
  const ruleAuthorizer = accounts[3];
  const chip1 = '20_symbols_ac_chip1';
  const chip2 = 'chip2';
  const chip3 = 'chip3';
  const rgOwnerBytes32 = addLeftToAddressWithPrefix(rgOwner);
  const timeNowInSecondsStart = Math.round(new Date() / 1000);
  const oneDayInSec = 86400;
  const oneGCoin = 100000000;
  const placeholder = 'cafecafecafecafecafecafecafecafecafecafe';
  const asset = 'XGC';
  const assetSymbol = 'GCoin';
  const institution = '0001';

  afterEach('revert', reverter.revert);

  let owned;
  let rGManagerRouter;
  let rGManagerClone;
  let rGAssetOwnershipCardCloneFactory;
  let rGAssetOwnershipCardClone;
  let rGAssetOwnershipCardResolver;
  let rgTransactionRulesClone;
  let rgRuleAuthorizerClone;
  let rgPermissionManagerClone;
  let rgRegistryClone;

  function assertBalance(erc20Contract, balanceOwner, value) {
    return erc20Contract.balanceOf(balanceOwner)
    .then(result => assert.equal(result.valueOf(), value));
  }

  function bytesToString(bytes) {
    return web3.toAscii(bytes.split('00')[0]);
  }

  function bytesToAddress(bytes) {
    return '0x' + bytes.slice(26);
  }

  function bytesToBool(bytes) {
    return bytes.slice(65) == '1' ? true : false;
  }

  before('Setup', function() {
    //prepare RGAssetOwnershipCard
    return deployHelperContracts(RGAssetOwnershipCard)
    .then(contracts => {
      rGAssetOwnershipCardResolver = contracts.resolver;
    })
    .then(() => {
      RGAssetOwnershipCardCloneFactory._json.unlinked_binary = replaceAll(RGAssetOwnershipCardCloneFactory._json.unlinked_binary, placeholder, rGAssetOwnershipCardResolver.address.slice(-40));
      return RGAssetOwnershipCardCloneFactory.new()
    })
    .then(instance => rGAssetOwnershipCardCloneFactory = instance)
    //rule authorizer contracts
    .then(() => deployHelperContracts(RGRuleAuthorizer, true))
    .then(contracts => {
      rgRuleAuthorizerClone = RGRuleAuthorizer.at(contracts.clone.address);
    })
    .then(() => rgRuleAuthorizerClone.constructRuleAuthorizer(rgOwner))
    .then(() => rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer))
    //prepare transaction rules contracts
    .then(() => deployHelperContracts(RGTransactionRules, true))
    .then(contracts => {
      rgTransactionRulesClone = RGTransactionRules.at(contracts.clone.address);
    })
    //construct transaction rules
    .then(() => rgTransactionRulesClone.constructTransactionRules(rgOwner))
    //add to the whitelist
    .then(() => rgTransactionRulesClone.addToWhitelist(rgOwner))
    .then(() => rgTransactionRulesClone.setRuleAuthorizer(rgRuleAuthorizerClone.address))
    //registry contracts
    .then(() => deployHelperContracts(RGPermissionsManager, true))
    .then(contracts => {
      rgPermissionManagerClone = RGPermissionsManager.at(contracts.clone.address);
    })
    .then(() => deployHelperContracts(RGRegistry, true))
    .then(contracts => {
      rgRegistryClone = RGRegistry.at(contracts.clone.address);
    })
    .then(() => rgRegistryClone.constructRegistry(rgOwner))
    .then(() => rgRegistryClone.setupRGPermissionsManager(rgPermissionManagerClone.address))
    .then(() => rgPermissionManagerClone.assignRole(rgRegistryClone.address, 'register', rgOwner))
    //prepare RGManager
    .then(() => deployHelperContracts(RGManager, true))
    .then(contracts => {
      rGManagerRouter = contracts.router;
      rGManagerClone = RGManager.at(contracts.clone.address);
    })
    .then(() => rGManagerClone.constructRGManager(rgOwner, 8, rGAssetOwnershipCardCloneFactory.address, rgTransactionRulesClone.address, rgRegistryClone.address))
    //setup for owned
    .then(() => RGManager.at(rGManagerClone.address))
    .then(instance => this.owned = instance)
    //register asset
    .then(() => rgRegistryClone.registerAsset(asset, assetSymbol))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'AssetRegistered');
      assert.equal(logs[0].args.asset, asset);
      assert.equal(bytesToString(logs[0].args.symbol), assetSymbol);
    })
    .then(reverter.snapshot);
  });

  it('should be possible to update implementation version of contract for contract owner', function() {
    return rGManagerRouter.updateVersion.call(accounts[3])
    .then(assert.isTrue);
  });

  it('should Emit VersionUpdated event when contract owner updates version of implementation', function() {
    return rGManagerRouter.updateVersion(accounts[3])
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'VersionUpdated');
      assert.equal(result.logs[0].args.newPrototype, accounts[3]);
    });
  });

  it('should NOT be possible to update implementation version of contract for NOT contract owner', function() {
    return rGManagerRouter.updateVersion.call(accounts[3], {from: accounts[1]})
    .then(assert.isFalse);
  });

  it('should be possible to set Transaction Rules address', function() {
    const txRulesAddress = accounts[4];
    return rGManagerClone.setRGTransactionRules.call(txRulesAddress)
    .then(assert.isTrue)
    .then(() => rGManagerClone.setRGTransactionRules(txRulesAddress))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'TransactionRulesSet');
      assert.equal(logs[0].args.rulesAddress, txRulesAddress);
    })
    .then(() => rGManagerClone.transactionRules())
    .then(result => assert.equal(result, txRulesAddress));
  });

  it('should not be possible to set not valid Transaction Rules address', function() {
    const txRulesAddress = '0x0000000000000000000000000000000000000000';
    return rGManagerClone.setRGTransactionRules.call(txRulesAddress)
    .then(assert.isFalse)
    .then(() => rGManagerClone.setRGTransactionRules(txRulesAddress))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Tx Rules address is not valid');
    })
    .then(() => rGManagerClone.transactionRules())
    .then(result => assert.equal(result, rgTransactionRulesClone.address));
  });

  it('should not be possible to set Transaction Rules address for not rg owner account', function() {
    const txRulesAddress = accounts[4];
    const notRgOwner = accounts[3];
    return rGManagerClone.setRGTransactionRules.call(txRulesAddress, {from: notRgOwner})
    .then(assert.isFalse)
    .then(() => rGManagerClone.setRGTransactionRules(txRulesAddress, {from: notRgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Call allowed only for owner');
    })
    .then(() => rGManagerClone.transactionRules())
    .then(result => assert.equal(result, rgTransactionRulesClone.address));
  });

  it('should be possible to set AssetOwnershipCardClone Factory address', function() {
    const cloneFactoryAddress = accounts[4];
    return rGManagerClone.setRGAssetOwnershipCardCloneFactory.call(cloneFactoryAddress)
    .then(assert.isTrue)
    .then(() => rGManagerClone.setRGAssetOwnershipCardCloneFactory(cloneFactoryAddress))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'CloneFactorySet');
      assert.equal(logs[0].args.cloneFactoryAddress, cloneFactoryAddress);
    })
    .then(() => rGManagerClone.cloneFactory())
    .then(result => assert.equal(result, cloneFactoryAddress));
  });

  it('should not be possible to set not valid AssetOwnershipCardClone Factory address', function() {
    const cloneFactoryAddress = '0x0000000000000000000000000000000000000000';
    return rGManagerClone.setRGAssetOwnershipCardCloneFactory.call(cloneFactoryAddress)
    .then(assert.isFalse)
    .then(() => rGManagerClone.setRGAssetOwnershipCardCloneFactory(cloneFactoryAddress))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Clone factory is not valid');
    })
    .then(() => rGManagerClone.cloneFactory())
    .then(result => assert.equal(result, rGAssetOwnershipCardCloneFactory.address));
  });

  it('should not be possible to set AssetOwnershipCardClone Factory address for not rg owner account', function() {
    const cloneFactoryAddress = accounts[4];
    const notRgOwner = accounts[3];
    return rGManagerClone.setRGAssetOwnershipCardCloneFactory.call(cloneFactoryAddress, {from: notRgOwner})
    .then(assert.isFalse)
    .then(() => rGManagerClone.setRGAssetOwnershipCardCloneFactory(cloneFactoryAddress, {from: notRgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Call allowed only for owner');
    })
    .then(() => rGManagerClone.cloneFactory())
    .then(result => assert.equal(result, rGAssetOwnershipCardCloneFactory.address));
  });

  it('should be possible to set Registry address', function() {
    const registryAddress = accounts[4];
    return rGManagerClone.setRGRegistry.call(registryAddress)
    .then(assert.isTrue)
    .then(() => rGManagerClone.setRGRegistry(registryAddress))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'RegistrySet');
      assert.equal(logs[0].args.registryAddress, registryAddress);
    })
    .then(() => rGManagerClone.registry())
    .then(result => assert.equal(result, registryAddress));
  });

  it('should not be possible to set not valid Registry address', function() {
    const registryAddress = '0x0000000000000000000000000000000000000000';
    return rGManagerClone.setRGRegistry.call(registryAddress)
    .then(assert.isFalse)
    .then(() => rGManagerClone.setRGRegistry(registryAddress))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Registry address is not valid');
    })
    .then(() => rGManagerClone.registry())
    .then(result => assert.equal(result, rgRegistryClone.address));
  });

  it('should not be possible to set Registry address for not rg owner account', function() {
    const registryAddress = accounts[4];
    const notRgOwner = accounts[3];
    return rGManagerClone.setRGRegistry.call(registryAddress, {from: notRgOwner})
    .then(assert.isFalse)
    .then(() => rGManagerClone.setRGRegistry(registryAddress, {from: notRgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Call allowed only for owner');
    })
    .then(() => rGManagerClone.registry())
    .then(result => assert.equal(result, rgRegistryClone.address));
  });

  it('should be possible to deploy Ownership Card for RG owner user', function() {
    return rGManagerClone.deploy.call(chip1, 1000, rgOwner)
    .then(assert.isTrue);
  });

  it('should emit Error when admin is trying to create AC with not unique chip', function() {
    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.deploy(chip1, 1000, rgOwner))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'AC with chip already exist');
    });
  })

  it('should return false when admin is trying to create AC with not unique chip', function() {
    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.deploy.call(chip1, 1000, rgOwner))
    .then(assert.isFalse);
  })

  it('should not be possible to deploy Ownership Card with used chip and totalSupply is not increased', function() {
    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.deploy(chip1, 1000, rgOwner))
    .then(() => rGManagerClone.getOwnershipCardAddress(2))
    .then(result => assert.equal(result, '0x0000000000000000000000000000000000000000'))
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 1000));
  })

  it('should not be allowed to deploy Ownership Card for not RG owner user', function() {
    return rGManagerClone.deploy.call(chip1, 1000, rgOwner, {from: accounts[1]})
    .then(assert.isFalse);
  });

  it('should Emit Deployed, Minted, Transfer events when RG owner deploying Ownership Card', function() {
    const coins = 1000;

    return rGManagerClone.deploy(chip1, coins, rgOwner)
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 3);
      assert.equal(logs[0].event, 'Deployed');
      assert.equal(logs[0].args.coins, coins);
      assert.equal(web3.isAddress(logs[0].args.rgAssetOwnershipCardAddress), true);

      assert.equal(logs[1].event, 'Minted');
      assert.equal(logs[1].args.coins, coins);
      assert.equal(logs[1].args.owner, rgOwner);
      assert.equal(web3.isAddress(logs[1].args.rgAssetOwnershipCardAddress), true);

      assert.equal(logs[2].event, 'Transfer');
      assert.equal(logs[2].args.from, 0);
      assert.equal(logs[2].args.to, rgOwner);
      assert.equal(logs[2].args.value, coins);
    });
  });

  it('should be possible to get Ownership card address by id', function() {
    let rgAssetOwnershipCardAddress;

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => rgAssetOwnershipCardAddress = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => rGManagerClone.cardId())
    .then(() => rGManagerClone.getOwnershipCardAddress(1))
    .then(result => assert.equal(rgAssetOwnershipCardAddress, result));
  });

  it('should be possible to deploy few Ownership cards', function() {
    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => assert.equal(result.logs[1].args.chip, chip1))
    .then(() => rGManagerClone.deploy(chip2, 1500, rgOwner))
    .then(result => assert.equal(result.logs[1].args.chip, chip2))
    .then(() => rGManagerClone.deploy(chip3, 2000, rgOwner))
    .then(result => assert.equal(result.logs[1].args.chip, chip3))
  });

  it('should increase rg owners balance after each deploy', function() {
    const rgAssetOwnershipCardCoinsCount1 = 1000;
    const rgAssetOwnershipCardCoinsCount2 = 1500;

    return rGManagerClone.deploy(chip1, rgAssetOwnershipCardCoinsCount1, rgOwner)
    .then(() => assertBalance(rGManagerClone, rgOwner, rgAssetOwnershipCardCoinsCount1))
    .then(() => rGManagerClone.deploy(chip2, rgAssetOwnershipCardCoinsCount2, rgOwner))
    .then(() => assertBalance(rGManagerClone, rgOwner, rgAssetOwnershipCardCoinsCount1 + rgAssetOwnershipCardCoinsCount2));
  });

  it('should allow to get totalSupply', function() {
    const rgAssetOwnershipCardCoinsCount1 = 1000;
    const rgAssetOwnershipCardCoinsCount2 = 1500;

    return rGManagerClone.deploy(chip1, rgAssetOwnershipCardCoinsCount1, rgOwner)
    .then(() => rGManagerClone.deploy(chip2, rgAssetOwnershipCardCoinsCount2, rgOwner))
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, rgAssetOwnershipCardCoinsCount1 + rgAssetOwnershipCardCoinsCount2));
  });

  it('should allow to get userBalance by his address', function() {
    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => assertBalance(rGManagerClone, rgOwner, 1000));
  });

  it('should allow to transfer to other account, recipient should receive ACcoins and Gcoins', function() {
    let rgAssetOwnershipCardAddress;
    const recipient = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => rgAssetOwnershipCardAddress = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => assertBalance(rGManagerClone, recipient, 0))
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(recipient, rgAssetOwnershipCardAddress))
    .then(assert.isFalse)
    .then(() => rGManagerClone.transfer(recipient, 400, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, recipient, 400))
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(recipient, rgAssetOwnershipCardAddress))
    .then(assert.isTrue);
  });

  it('should Emit Transfer event and Spent event when user transfer to the another user', function() {
    const recipient = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(recipient, 400, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 2);
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(logs[0].args.from, rgOwner);
      assert.equal(logs[0].args.to, recipient);
      assert.equal(logs[0].args.value, 400);
      assert.equal(logs[1].event, 'Spent');
      assert.equal(logs[1].args.from, rgOwner);
      assert.equal(logs[1].args.to, recipient);
      assert.equal(logs[1].args.value, 400);
      assert.equal(logs[1].args.channel, 0);
      assert.equal(logs[1].args.comment, '');
    });
  });

  it('should not allow to transfer gcoins if users balance is low', function() {
    const recipient = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer.call(recipient, 1100, {from: rgOwner}))
    .then(assert.isFalse);
  });

  it('should not overflow during transfer', function() {
    const uint256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const recipient = accounts[1];

    return rGManagerClone.deploy(chip1, uint256, rgOwner)
    .then(() => rGManagerClone.transfer(recipient, uint256, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, 1000, rgOwner))
    .then(() => rGManagerClone.transfer.call(recipient, 1, {from: rgOwner}))
    .then(assert.isFalse);
  });

  it('should allow to transfer to merchant account, recipient should receive ACcoins and Gcoins', function() {
    let rgAssetOwnershipCardAddress;
    const recipient = accounts[1];
    const icapRecipient = icap(asset, institution, '123456789').padEnd(32, '0');

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => rgAssetOwnershipCardAddress = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => assertBalance(rGManagerClone, recipient, 0))
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(recipient, rgAssetOwnershipCardAddress))
    .then(assert.isFalse)
    .then(() => rgRegistryClone.registerInstitution(asset, institution, recipient, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'InstitutionRegistered');
      assert.equal(logs[0].args.asset, asset);
      assert.equal(logs[0].args.institution, institution);
      assert.equal(logs[0].args.ethAddress, recipient);
    })
    .then(() => rGManagerClone.transferToMerchant(icapRecipient, 400, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, recipient, 400))
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(recipient, rgAssetOwnershipCardAddress))
    .then(assert.isTrue);
  });

  it('should Emit Transfer event, Spent event and MerchantTransfer event when user transfer to merchant', function() {
    const recipient = accounts[1];
    const icapRecipient = icap(asset, institution, '123456789').padEnd(32, '0');

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rgRegistryClone.registerInstitution(asset, institution, recipient, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'InstitutionRegistered');
      assert.equal(logs[0].args.asset, asset);
      assert.equal(logs[0].args.institution, institution);
      assert.equal(logs[0].args.ethAddress, recipient);
    })
    .then(() => rGManagerClone.transferToMerchant(icapRecipient, 400, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 3);
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(logs[0].args.from, rgOwner);
      assert.equal(logs[0].args.to, recipient);
      assert.equal(logs[0].args.value, 400);
      assert.equal(logs[1].event, 'Spent');
      assert.equal(logs[1].args.from, rgOwner);
      assert.equal(logs[1].args.to, recipient);
      assert.equal(logs[1].args.value, 400);
      assert.equal(logs[1].args.channel, 0);
      assert.equal(logs[1].args.comment, '');
      assert.equal(logs[2].event, 'MerchantTransfer');
      assert.equal(bytesToString(logs[2].args.icap), icapRecipient);
      assert.equal(logs[2].args.from, rgOwner);
      assert.equal(logs[2].args.to, recipient);
      assert.equal(logs[2].args.value, 400);
    });
  });

  it('should not allow to merchant transfer gcoins if users balance is low', function() {
    const recipient = accounts[1];
    const icapRecipient = icap(asset, institution, '123456789').padEnd(32, '0');

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rgRegistryClone.registerInstitution(asset, institution, recipient, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'InstitutionRegistered');
      assert.equal(logs[0].args.asset, asset);
      assert.equal(logs[0].args.institution, institution);
      assert.equal(logs[0].args.ethAddress, recipient);
    })
    .then(() => rGManagerClone.transferToMerchant.call(icapRecipient, 1100, {from: rgOwner}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.transferToMerchant(icapRecipient, 1100, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 2);
      assert.equal(bytesToString(result.logs[0].args.error), 'Not enough balance for transfer');
      assert.equal(bytesToString(result.logs[1].args.error), 'Failed to transfer to merchant');
    });
  });

  it('should not overflow during merchant transfer', function() {
    const uint256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const recipient = accounts[1];
    const icapRecipient = icap(asset, institution, '123456789').padEnd(32, '0');

    return rGManagerClone.deploy(chip1, uint256, rgOwner)
    .then(() => rgRegistryClone.registerInstitution(asset, institution, recipient, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'InstitutionRegistered');
      assert.equal(logs[0].args.asset, asset);
      assert.equal(logs[0].args.institution, institution);
      assert.equal(logs[0].args.ethAddress, recipient);
    })
    .then(() => rGManagerClone.transferToMerchant(icapRecipient, uint256, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, 1000, rgOwner))
    .then(() => rGManagerClone.transferToMerchant.call(icapRecipient, 1, {from: rgOwner}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.transferToMerchant(icapRecipient, 1, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 2);
      assert.equal(bytesToString(result.logs[0].args.error), 'Overflow');
      assert.equal(bytesToString(result.logs[1].args.error), 'Failed to transfer to merchant');
    });
  });

  it('should not be possible to transfer coins if user is not able to cover fee after merchant transfer', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    const icapRecipient = icap(asset, institution, '123456789').padEnd(32, '0');
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    .then(() => rgRegistryClone.registerInstitution(asset, institution, user2, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'InstitutionRegistered');
      assert.equal(logs[0].args.asset, asset);
      assert.equal(logs[0].args.institution, institution);
      assert.equal(logs[0].args.ethAddress, user2);
    })
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    .then(() => rGManagerClone.setYearlyFee(20, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, oneGCoin, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin))
    .then(() => increaseTime(oneDayInSec + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.transferToMerchant(icapRecipient, oneGCoin, {from: user1}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 6);
      assert.equal(bytesToString(result.logs[3].args.error), 'Not possible to cover fee');
      assert.equal(result.logs[4].args.availableBalance.valueOf(), 99999452);
      assert.equal(bytesToString(result.logs[5].args.error), 'Failed to transfer to merchant');
    })
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin))
    .then(() => rGManagerClone.feeToCollect(user1))
    //1096 is 1st day fee from 2 gcoins in cents
    .then(result => assert.equal(result.valueOf(), 548))
  })

  it('should not allow to merchant transfer gcoins if asset is not registered', function() {
    const notRegisterAsset = 'XXX';
    const icapRecipient = icap(notRegisterAsset, institution, '123456789').padEnd(32, '0');

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transferToMerchant.call(icapRecipient, 400, {from: rgOwner}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.transferToMerchant(icapRecipient, 400, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Asset isn\'t registered');
      assert.equal(bytesToString(result.logs[1].args.error), 'Failed to parse address');
    });
  });

  it('should not allow to merchant transfer gcoins if institution is not registered', function() {
    const notRegisterInstitution = '0002';
    const icapRecipient = icap(asset, notRegisterInstitution, '123456789').padEnd(32, '0');

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transferToMerchant.call(icapRecipient, 400, {from: rgOwner}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.transferToMerchant(icapRecipient, 400, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Institution isn\'t registered');
      assert.equal(bytesToString(result.logs[1].args.error), 'Failed to parse address');
    });
  });

  it('should not allow to merchant transfer gcoins if invalid country code', function() {
    const icapRecipient = ('XX' + icap(asset, institution, '123456789').slice(2)).padEnd(32, '0');

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transferToMerchant.call(icapRecipient, 400, {from: rgOwner}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.transferToMerchant(icapRecipient, 400, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Invalid country code');
    });
  });

  it('should not allow to merchant transfer gcoins if incorrect icap length', function() {
    const icapRecipient = icap(asset, institution, '123456789');

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transferToMerchant.call(icapRecipient, 400, {from: rgOwner}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.transferToMerchant(icapRecipient, 400, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Invalid address length');
    });
  });

  it('should allow to approve allowance for spender', function() {
    const approver = accounts[1];

    return rGManagerClone.approve.call(rgOwner, 500, {from: approver})
    .then(assert.isTrue);
  });

  it('should Emit Approval event when user is approves allowance for spender', function() {
    const approver = accounts[1];

    return rGManagerClone.approve(rgOwner, 500, {from: approver})
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'Approval');
      assert.equal(logs[0].args.from, approver);
      assert.equal(logs[0].args.spender, rgOwner);
      assert.equal(logs[0].args.value, 500);
    });
  });

  it('should allow to get allowance for user', function() {
    const approver = accounts[1];

    return rGManagerClone.approve(rgOwner, 500, {from: approver})
    .then(() => rGManagerClone.allowance(approver, rgOwner))
    .then(result => assert.equal(result, 500));
  });

  it('should not allow to transferFrom gcoins if users balance is low', function() {
    const approver = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(approver, 1000, {from: rgOwner}))
    .then(() => rGManagerClone.approve(rgOwner, 2000, {from: approver}))
    .then(() => rGManagerClone.transferFrom.call(approver, accounts[3], 1100, {from: rgOwner}))
    .then(assert.isFalse);
  });

  it('should not overflow during transferFrom', function() {
    const uint256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const approver = accounts[1];
    let transferFromData;

    return rGManagerClone.deploy(chip1, uint256, rgOwner)
    .then(() => rGManagerClone.transfer(approver, uint256, {from: rgOwner}))
    .then(() => rGManagerClone.approve(rgOwner, uint256, {from: approver}))
    .then(() => rGManagerClone.transferFrom(approver, accounts[3], uint256, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, 1000, rgOwner))
    .then(() => rGManagerClone.approve(rgOwner, 1000, {from: approver}))
    .then(() => transferFromData = rGManagerClone.contract.transferFrom.getData(approver, accounts[3], 1))

    .then(() => rGManagerClone.transferFrom.call(approver, accounts[3], 1, {from: rgOwner}))
    .then(assert.isFalse);
  });

  it('should not allow to transferFrom gcoins if allowance is not enough', function() {
    const approver = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(approver, 1000, {from: rgOwner}))
    .then(() => rGManagerClone.approve(rgOwner, 500, {from: approver}))
    .then(() => rGManagerClone.transferFrom.call(approver, accounts[3], 600, {from: rgOwner}))
    .then(assert.isFalse);
  });

  it('should not allow to transferFrom gcoins if allowance is not set', function() {
    const approver = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(approver, 1000, {from: rgOwner}))
    .then(() => rGManagerClone.transferFrom.call(approver, accounts[3], 1, {from: rgOwner}))
    .then(assert.isFalse);
  });

  it('should allow to transferFrom to other account', function() {
    const approver = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(approver, 1000, {from: rgOwner}))
    .then(() => rGManagerClone.approve(rgOwner, 1000, {from: approver}))
    .then(() => rGManagerClone.transferFrom.call(approver, accounts[3], 1000, {from: rgOwner}))
    .then(assert.isTrue);
  });

  it('should Emit Transfer event and Spent event when approved user transferFrom to the another user', function() {
    const approver = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(approver, 1000, {from: rgOwner}))
    .then(() => rGManagerClone.approve(rgOwner, 1000, {from: approver}))
    .then(() => rGManagerClone.transferFrom(approver, accounts[3], 1000, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 2);
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(logs[0].args.from, approver);
      assert.equal(logs[0].args.to, accounts[3]);
      assert.equal(logs[0].args.value, 1000);
      assert.equal(logs[1].event, 'Spent');
      assert.equal(logs[1].args.from, approver);
      assert.equal(logs[1].args.to, accounts[3]);
      assert.equal(logs[1].args.value, 1000);
      assert.equal(logs[1].args.channel, 0);
      assert.equal(logs[1].args.comment, '');
    });
  });

  it('should be possible to deploy Ownership Card without Gcoin generation for RG owner user', function() {
    return rGManagerClone.deployWithoutGcoins.call(chip1, 1000, rgOwner)
    .then(assert.isTrue);
  });

  it('should not be allowed to deploy Ownership Card without Gcoin generation for not RG owner user', function() {
    return rGManagerClone.deployWithoutGcoins.call(chip1, 1000, rgOwner, {from: accounts[1]})
    .then(assert.isFalse);
  });

  it('should Emit Deployed event when RG owner deploying Ownership Card without Gcoin generation', function() {
    return rGManagerClone.deployWithoutGcoins(chip1, 1000, rgOwner)
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'Deployed');
      assert.equal(logs[0].args.coins, 1000);
      assert.equal(web3.isAddress(logs[0].args.rgAssetOwnershipCardAddress), true);
    });
  });

  it('should be possible to get Ownership card address without Gcoins by id', function() {
    let rgAssetOwnershipCardAddress;

    return rGManagerClone.deployWithoutGcoins(chip1, 1000, rgOwner)
    .then(result => rgAssetOwnershipCardAddress = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => rGManagerClone.getOwnershipCardAddress(1))
    .then(result => assert.equal(rgAssetOwnershipCardAddress, result));
  });

  it('should be possible to deploy Ownership cards with and without Gcoin generation', function() {
    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => assert.equal(result.logs[1].args.chip, chip1))
    .then(() => rGManagerClone.deployWithoutGcoins(chip2, 1500, rgOwner))
    .then(result => assert.equal(result.logs[1].args.chip, chip2));
  });

  it('should set all RGAC coins to the rgOwner when RGAC is deployed', function() {
    let rgAssetOwnershipCardAddress;
    let RGAC1;
    const RGAC1TotalCoins = 1000;

    return rGManagerClone.deploy(chip1, RGAC1TotalCoins, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => assertBalance(RGAC1, rgOwner, RGAC1TotalCoins));
  });

  it('should transfer AC coins from the first users RGAC by default where he has positive balance to the receiver', function() {
    const recipient = accounts[1];
    const transferredValue = 999;
    const RGAC1TotalCoins = 1000;
    const RGAC2TotalCoins = 1000;
    let RGAC1;
    let RGAC2;

    return rGManagerClone.deploy(chip1, RGAC1TotalCoins, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.deploy(chip2, RGAC2TotalCoins, rgOwner))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC2 = instance)
    .then(() => rGManagerClone.transfer(recipient, transferredValue, {from: rgOwner}))
    //total gcoins after transfer
    .then(() => assertBalance(rGManagerClone, rgOwner, RGAC1TotalCoins + RGAC2TotalCoins - transferredValue))
    //total gcoins after transfer
    .then(() => assertBalance(rGManagerClone, recipient, transferredValue))
    .then(() => assertBalance(RGAC1, rgOwner, RGAC1TotalCoins - transferredValue))
    .then(() => assertBalance(RGAC2, rgOwner, RGAC2TotalCoins))
    .then(() => assertBalance(RGAC1, recipient, transferredValue))
    .then(() => assertBalance(RGAC2, recipient, 0));
  });

  it('should transfer coins several RGACs if user wants to send value bigger than he has in 1 RGAC to the receiver', function() {
    const recipient = accounts[1];
    const RGAC1TotalCoins = 1000;
    const RGAC2TotalCoins = 1000;
    const RGAC3TotalCoins = 1500;
    const transferredValue = 2500;
    let RGAC1;
    let RGAC2;
    let RGAC3;

    return rGManagerClone.deploy(chip1, RGAC1TotalCoins, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.deploy(chip2, RGAC2TotalCoins, rgOwner))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC2 = instance)
    .then(() => rGManagerClone.deploy(chip3, RGAC3TotalCoins, rgOwner))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC3 = instance)
    .then(() => rGManagerClone.transfer(recipient, transferredValue, {from: rgOwner}))
    //total gcoins after transfer
    .then(() => assertBalance(rGManagerClone, rgOwner, RGAC1TotalCoins + RGAC2TotalCoins + RGAC3TotalCoins - transferredValue))
    //total gcoins after transfer
    .then(() => assertBalance(rGManagerClone, recipient, transferredValue))
    //rgowner balances on different RGAC
    .then(() => assertBalance(RGAC1, rgOwner, 0))
    .then(() => assertBalance(RGAC2, rgOwner, 0))
    .then(() => assertBalance(RGAC3, rgOwner, RGAC3TotalCoins - 500))
    //recipient balances on different RGAC
    .then(() => assertBalance(RGAC1, recipient, RGAC1TotalCoins))
    .then(() => assertBalance(RGAC2, recipient, RGAC2TotalCoins))
    .then(() => assertBalance(RGAC3, recipient, RGAC3TotalCoins - 1000))
  });

  it('should be possible to send all coins to the recipient', function() {
    const recipient = accounts[1];
    let rgAssetOwnershipCardAddress1;
    let rgAssetOwnershipCardAddress2;
    let rgAssetOwnershipCardAddress3;
    let RGAC1;
    let RGAC2;
    let RGAC3;
    const RGAC1TotalCoins = 1000;
    const RGAC2TotalCoins = 1000;
    const RGAC3TotalCoins = 1500;
    const transferredValue1 = 3499;
    const transferredValue2 = 1;

    return rGManagerClone.deploy(chip1, RGAC1TotalCoins, rgOwner)
    .then(result => rgAssetOwnershipCardAddress1 = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress1))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.deploy(chip2, RGAC2TotalCoins, rgOwner))
    .then(result => rgAssetOwnershipCardAddress2 = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress2))
    .then(instance => RGAC2 = instance)
    .then(() => rGManagerClone.deploy(chip3, RGAC3TotalCoins, rgOwner))
    .then(result => rgAssetOwnershipCardAddress3 = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress3))
    .then(instance => RGAC3 = instance)
    .then(() => rGManagerClone.transfer(recipient, transferredValue1, {from: rgOwner}))
    //rgowner balances on different RGAC
    .then(() => assertBalance(RGAC1, rgOwner, 0))
    .then(() => assertBalance(RGAC2, rgOwner, 0))
    .then(() => assertBalance(RGAC3, rgOwner, RGAC3TotalCoins - 1499))
    //recipient balances on different RGAC
    .then(() => assertBalance(RGAC1, recipient, RGAC1TotalCoins))
    .then(() => assertBalance(RGAC2, recipient, RGAC2TotalCoins))
    .then(() => assertBalance(RGAC3, recipient, RGAC3TotalCoins - 1))
    //has rgOwner AC coins in specific RGAC
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(rgOwner, rgAssetOwnershipCardAddress1))
    .then(assert.isFalse)
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(rgOwner, rgAssetOwnershipCardAddress2))
    .then(assert.isFalse)
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(rgOwner, rgAssetOwnershipCardAddress3))
    .then(assert.isTrue)
    //transfer last rgOwners gcoin and verify that he has not AC coins any more
    .then(() => rGManagerClone.transfer(recipient, transferredValue2, {from: rgOwner}))
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(rgOwner, rgAssetOwnershipCardAddress3))
    .then(assert.isFalse)
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(recipient, rgAssetOwnershipCardAddress1))
    .then(assert.isTrue)
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(recipient, rgAssetOwnershipCardAddress2))
    .then(assert.isTrue)
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(recipient, rgAssetOwnershipCardAddress3))
    .then(assert.isTrue)
  });

  it('should be possible to send coins to the different receivers', function() {
    let RGAC1;
    let RGAC2;

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.deploy(chip2, 1000, rgOwner))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC2 = instance)
    .then(() => rGManagerClone.transfer(accounts[1], 700, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 700, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[3], 500, {from: rgOwner}))
    //total gcoins after transfer
    .then(() => assertBalance(rGManagerClone, rgOwner, 100))
    //total gcoins after transfer
    .then(() => assertBalance(rGManagerClone, accounts[1], 700))
    .then(() => assertBalance(rGManagerClone, accounts[2], 700))
    .then(() => assertBalance(rGManagerClone, accounts[3], 500))
    //rgowner AC balances on different RGAC
    .then(() => assertBalance(RGAC1, rgOwner, 0))
    .then(() => assertBalance(RGAC2, rgOwner, 100))
    //AC balances of 1st recipient
    .then(() => assertBalance(RGAC1, accounts[1], 700))
    .then(() => assertBalance(RGAC2, accounts[1], 0))
    //2nd receiver has AC coins from different RGAC
    .then(() => assertBalance(RGAC1, accounts[2], 300))
    .then(() => assertBalance(RGAC2, accounts[2], 400))
    //AC balances of 3rd recipient
    .then(() => assertBalance(RGAC1, accounts[3], 0))
    .then(() => assertBalance(RGAC2, accounts[3], 500))

  });

  it('should be possible to send coins to the receiver , back to the sender and again in a circle', function() {
    let RGAC1;
    let RGAC2;

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.deploy(chip2, 1000, rgOwner))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC2 = instance)
    .then(() => rGManagerClone.transfer(accounts[1], 700, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 700, {from: rgOwner}))
    //total gcoins after transfer
    .then(() => assertBalance(rGManagerClone, rgOwner, 600))
    .then(() => assertBalance(rGManagerClone, accounts[1], 700))
    //rgowner AC balances on different RGAC
    .then(() => assertBalance(RGAC1, rgOwner, 0))
    .then(() => assertBalance(RGAC2, rgOwner, 600))
    //1st receiver AC balances on different RGAC
    .then(() => assertBalance(RGAC1, accounts[1], 700))
    .then(() => assertBalance(RGAC2, accounts[1], 0))
    //transfer back to rgOwner AC1 coins
    .then(() => rgTransactionRulesClone.addToWhitelist(accounts[1]))
    .then(() => rGManagerClone.transfer(rgOwner, 200, {from: accounts[1]}))
    //transfer 100 coins from rgOwner to 1st receiver, AC2 coins should be send from queue
    .then(() => rGManagerClone.transfer(accounts[1], 100, {from: rgOwner}))
    //rgowner AC balances on different RGAC
    .then(() => assertBalance(RGAC1, rgOwner, 200))
    .then(() => assertBalance(RGAC2, rgOwner, 500))
    //1st receiver AC balances on different RGAC
    .then(() => assertBalance(RGAC1, accounts[1], 500))
    .then(() => assertBalance(RGAC2, accounts[1], 100))
    //total gcoins after transfer
    .then(() => assertBalance(rGManagerClone, rgOwner, 700))
    .then(() => assertBalance(rGManagerClone, accounts[1], 600))
  });

  it('should be possible to get RgManager decimals', function() {
    return rGManagerClone.decimals()
    .then(result => assert.equal(result, 8));
  });


  it('should be possible to mint GCoins ON not minted RGAC for user with positive balance of AC coins', function() {
    let RGAC1;

    return rGManagerClone.deployWithoutGcoins(chip1, 1000, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.mintGcoins.call(chip1, rgOwner))
    .then(assert.isTrue);

  });

  it('should be NOT possible to mint GCoins ON not minted RGAC for not RG owner account', function() {
    let RGAC1;

    return rGManagerClone.deployWithoutGcoins(chip1, 1000, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.mintGcoins.call(chip1, rgOwner, {from: accounts[1]}))
    .then(assert.isFalse);

  });

  it('should return false and throw an error on mint GCoins step if RGAC with provided chip is not exist in system', function() {
    let RGAC1;

    return rGManagerClone.deployWithoutGcoins(chip1, 1000, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.mintGcoins(chip2, rgOwner))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(bytesToString(result.logs[0].args.error), 'RGAC does not exist');
    });
  });

  it('should return false and throw an error on mint GCoins step if user doesnt have positive balance in RGAC', function() {
    let RGAC1;

    return rGManagerClone.deployWithoutGcoins(chip1, 1000, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.mintGcoins(chip1, accounts[1]))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(bytesToString(result.logs[0].args.error), 'User doesnt have AC coins');
    })
  });

  it('should return false and throw an error on mint GCoins step if user has all minted GCoins from provided RGAC', function() {
    let RGAC1;

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.mintGcoins(chip1, rgOwner))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(bytesToString(result.logs[0].args.error), 'Nothing to mint, GCoins minted');
    })
  });

  it('should emit Minted event, increase user balance, increase total supply if RGAC GCoin minting process was sucessful', function () {
    let RGAC1;
    let rgAssetOwnershipCardAddress;
    const coins = 1000

    return rGManagerClone.deployWithoutGcoins(chip1, coins, rgOwner)
    .then(result => rgAssetOwnershipCardAddress = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(result => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.balanceOf(rgOwner))
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.mintGcoins(chip1, rgOwner))
    .then(result => {
      assert.equal(result.logs.length, 2);
      assert.equal(result.logs[0].event, 'Minted');
      assert.equal(result.logs[0].args.rgAssetOwnershipCardAddress, rgAssetOwnershipCardAddress);
      assert.equal(result.logs[0].args.owner, rgOwner);
      assert.equal(result.logs[0].args.coins, coins);

      assert.equal(result.logs[1].event, 'Transfer');
      assert.equal(result.logs[1].args.from, 0);
      assert.equal(result.logs[1].args.to, rgOwner);
      assert.equal(result.logs[1].args.value, coins);
    })
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, coins))
    .then(() => rGManagerClone.balanceOf(rgOwner))
    .then(result => assert.equal(result, coins));

  });

  it('should NOT emit Minted event, increase user balance, increase total supply if RGAC GCoin minting process was failed', function() {
    let RGAC1;
    let rgAssetOwnershipCardAddress;
    const coins = 1000

    return rGManagerClone.deployWithoutGcoins(chip1, coins, rgOwner)
    .then(result => rgAssetOwnershipCardAddress = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.balanceOf(rgOwner))
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.mintGcoins(chip1, accounts[1]))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(bytesToString(result.logs[0].args.error), 'User doesnt have AC coins');
    })
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.balanceOf(rgOwner))
    .then(result => assert.equal(result, 0));
  });

  it('should return false and throw an error on mint GCoins when admin is trying to mint Gcoins for minted RGAC', function() {
    let RGAC1;
    let rgAssetOwnershipCardAddress;
    const coins = 1000

    return rGManagerClone.deployWithoutGcoins(chip1, coins, rgOwner)
    .then(result => rgAssetOwnershipCardAddress = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(result => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.balanceOf(rgOwner))
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.mintGcoins(chip1, rgOwner))
    .then(result => {
      assert.equal(result.logs.length, 2);
      assert.equal(result.logs[0].event, 'Minted');
      assert.equal(result.logs[0].args.rgAssetOwnershipCardAddress, rgAssetOwnershipCardAddress);
      assert.equal(result.logs[0].args.owner, rgOwner);
      assert.equal(result.logs[0].args.coins, coins);

      assert.equal(result.logs[1].event, 'Transfer');
      assert.equal(result.logs[1].args.from, 0);
      assert.equal(result.logs[1].args.to, rgOwner);
      assert.equal(result.logs[1].args.value, coins);
    })
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, coins))
    .then(() => rGManagerClone.balanceOf(rgOwner))
    .then(result => assert.equal(result, coins))
    .then(() => rGManagerClone.mintGcoins(chip1, rgOwner))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(bytesToString(result.logs[0].args.error), 'Nothing to mint, GCoins minted');
    })
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, coins))
    .then(() => rGManagerClone.balanceOf(rgOwner))
    .then(result => assert.equal(result, coins));

  });

  it('should be possible to transfer AC coins using callBack to RG Manager contract', function() {
    let RGACcontract;
    const recipient = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGACcontract = instance)
    .then(() => RGACcontract.transfer.call(recipient, 500))
    .then(assert.isTrue);
  });

  it('should emit Transfer event and Spent event, update balances when user transfers AC coins using callBack to RG Manager contract', function() {
    let RGACcontract;
    const recipient = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGACcontract = instance)
    .then(() => RGACcontract.transfer(recipient, 500))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 2);
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(logs[0].args.from, rgOwner);
      assert.equal(logs[0].args.to, recipient);
      assert.equal(logs[0].args.value, 500);
      assert.equal(logs[1].event, 'Spent');
      assert.equal(logs[1].args.from, rgOwner);
      assert.equal(logs[1].args.to, recipient);
      assert.equal(logs[1].args.value, 500);
      assert.equal(logs[1].args.channel, 0);
      assert.equal(logs[1].args.comment, '');
    })
    .then(() => assertBalance(rGManagerClone, rgOwner, 500))
    .then(() => assertBalance(rGManagerClone, recipient, 500))
    .then(() => assertBalance(RGACcontract, rgOwner, 500))
    .then(() => assertBalance(RGACcontract, recipient, 500));
  });

  it('should be possible to transferFrom AC coins using callBack to RG Manager contract', function() {
    let RGACcontract;
    const user = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGACcontract = instance)
    .then(() => RGACcontract.approve(user, 500, {from: rgOwner}))
    .then(() => rgTransactionRulesClone.addToWhitelist(user))
    .then(() => RGACcontract.transferFrom.call(rgOwner, user, 500, {from: user}))
    .then(assert.isTrue);
  });

  it('should emit Transfer event and update balances when user transferFrom AC coins using callBack to RG Manager contract', function() {
    let RGACcontract;
    const user = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGACcontract = instance)
    .then(() => RGACcontract.approve(user, 500, {from: rgOwner}))
    .then(() => rgTransactionRulesClone.addToWhitelist(user))
    .then(() => RGACcontract.transferFrom(rgOwner, user, 500, {from: user}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 2);
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(logs[0].args.from, rgOwner);
      assert.equal(logs[0].args.to, user);
      assert.equal(logs[0].args.value, 500);
      assert.equal(logs[1].event, 'Spent');
      assert.equal(logs[1].args.from, rgOwner);
      assert.equal(logs[1].args.to, user);
      assert.equal(logs[1].args.value, 500);
      assert.equal(logs[1].args.channel, 0);
      assert.equal(logs[1].args.comment, '');
    })
    .then(() => assertBalance(rGManagerClone, rgOwner, 500))
    .then(() => assertBalance(rGManagerClone, user, 500))
    .then(() => assertBalance(RGACcontract, rgOwner, 500))
    .then(() => assertBalance(RGACcontract, user, 500));
  });

  it('should throw an error when user is trying to transferFrom more than allowed', function() {
    let RGACcontract;
    const user = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGACcontract = instance)
    .then(() => RGACcontract.approve(user, 500, {from: rgOwner}))
    .then(() => RGACcontract.transferFrom.call(rgOwner, user, 600, {from: user}))
    .then(assert.isFalse)
    .then(() => RGACcontract.transferFrom(rgOwner, user, 600, {from: user}))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'Error');
      assert.equal(bytesToString(result.logs[0].args.error), 'Allowance is not enough');
    });
  });

  it('should delete from users RGAC array, move last users RGAC to the deleted one if user transfer all AC', function() {
    let RGACcontract1;
    let RGACcontract2;
    let RGACcontract3;
    let rgAssetOwnershipCardAddress1;
    let rgAssetOwnershipCardAddress2;
    let rgAssetOwnershipCardAddress3;
    const recipient = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => rgAssetOwnershipCardAddress1 = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress1))
    .then(instance => RGACcontract1 = instance)

    .then(() => rGManagerClone.deploy('chip2', 1000, rgOwner))
    .then(result => rgAssetOwnershipCardAddress2 = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress2))
    .then(instance => RGACcontract2 = instance)

    .then(() => rGManagerClone.deploy('chip3', 1000, rgOwner))
    .then(result => rgAssetOwnershipCardAddress3 = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress3))
    .then(instance => RGACcontract3 = instance)

    //last user's RGAC should has position3 and total user's RGAC equal to 3
    .then(() => rGManagerClone.getCountOfUsersRGAC(rgOwner))
    .then(result => assert.equal(3, result))
    .then(() => rGManagerClone.userRGAssetOwnershipCardPosition(rgOwner, rgAssetOwnershipCardAddress3))
    .then(result => assert.equal(3, result))
    .then(() => rGManagerClone.userRGAssetOwnershipCardPosition(rgOwner, rgAssetOwnershipCardAddress2))
    .then(result => assert.equal(2, result))

    .then(() => rGManagerClone.getCountOfUsersRGAC(recipient))
    .then(result => assert.equal(0, result))

    .then(() => RGACcontract2.transfer(recipient, 1000))
    .then(() => assertBalance(rGManagerClone, recipient, 1000))
    .then(() => assertBalance(rGManagerClone, rgOwner, 2000))
    .then(() => assertBalance(RGACcontract2, recipient, 1000))
    .then(() => assertBalance(RGACcontract2, rgOwner, 0))
    .then(() => assertBalance(RGACcontract1, rgOwner, 1000))
    .then(() => assertBalance(RGACcontract3, rgOwner, 1000))

    .then(() => rGManagerClone.getCountOfUsersRGAC(rgOwner))
    .then(result => assert.equal(2, result))
    .then(() => rGManagerClone.getCountOfUsersRGAC(recipient))
    .then(result => assert.equal(1, result))

    //last user's RGAC3 should be moved on a deleted RGAC2
    .then(() => rGManagerClone.userRGAssetOwnershipCardPosition(rgOwner, rgAssetOwnershipCardAddress2))
    .then(result => assert.equal(0, result))
    .then(() => rGManagerClone.userRGAssetOwnershipCardPosition(rgOwner, rgAssetOwnershipCardAddress3))
    .then(result => assert.equal(2, result));
  });

  it('should delete last Ownership card from senders RGAC array when sender transers all coins from his last RGAC', function() {
    let RGACcontract1;
    let RGACcontract2;
    let RGACcontract3;
    let rgAssetOwnershipCardAddress1;
    let rgAssetOwnershipCardAddress2;
    let rgAssetOwnershipCardAddress3;
    const recipient = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => rgAssetOwnershipCardAddress1 = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress1))
    .then(instance => RGACcontract1 = instance)

    .then(() => rGManagerClone.deploy('chip2', 1000, rgOwner))
    .then(result => rgAssetOwnershipCardAddress2 = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress2))
    .then(instance => RGACcontract2 = instance)

    .then(() => rGManagerClone.deploy('chip3', 1000, rgOwner))
    .then(result => rgAssetOwnershipCardAddress3 = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress3))
    .then(instance => RGACcontract3= instance)

    //last user's RGAC should has position3 and total user's RGAC equal to 3
    .then(() => rGManagerClone.userRGAssetOwnershipCardPosition(rgOwner, rgAssetOwnershipCardAddress3))
    .then(result => assert.equal(3, result))
    .then(() => rGManagerClone.getCountOfUsersRGAC(rgOwner))
    .then(result => assert.equal(3, result))

    .then(() => rGManagerClone.getCountOfUsersRGAC(recipient))
    .then(result => assert.equal(0, result))

    .then(() => RGACcontract3.transfer(recipient, 1000))
    .then(() => assertBalance(rGManagerClone, recipient, 1000))
    .then(() => assertBalance(rGManagerClone, rgOwner, 2000))
    //last sender's RGAC3 should be removed from array of sender's RGAC and total user's RGAC equal to 2
    .then(() => rGManagerClone.userRGAssetOwnershipCardPosition(rgOwner, rgAssetOwnershipCardAddress3))
    .then(result => assert.equal(0, result))
    .then(() => rGManagerClone.userRGAssetOwnershipCardPosition(rgOwner, rgAssetOwnershipCardAddress2))
    .then(result => assert.equal(2, result))
    .then(() => rGManagerClone.getCountOfUsersRGAC(rgOwner))
    .then(result => assert.equal(2, result))

    .then(() => rGManagerClone.getCountOfUsersRGAC(recipient))
    .then(result => assert.equal(1, result));
  });

  it('should be possible to get list of user asset cards', function() {
    const user = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(user, 1000, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, 2000, rgOwner, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user, 1000, {from: rgOwner}))
    .then(() => rGManagerClone.getUserBalancesInAssetCards(user))
    .then(result => {
      assert.equal(web3.isAddress(bytesToAddress(result[0][0])), true);
      assert.equal(web3.toDecimal(result[0][1]), 1000);
      assert.equal(web3.toDecimal(result[0][2]), 1000);
      assert.isTrue(bytesToBool(result[0][3]));
      assert.equal(web3.isAddress(bytesToAddress(result[1][0])), true);
      assert.equal(web3.toDecimal(result[1][1]), 2000);
      assert.equal(web3.toDecimal(result[1][2]), 1000);
      assert.isFalse(bytesToBool(result[1][3]));
    });
  });

  it('should delete record from users asset cards when user sends all funds from asset card', function() {
    const user = accounts[1];

    return rGManagerClone.deploy(chip1, 2000, rgOwner)
    .then(() => rGManagerClone.transfer(user, 2000, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, 2000, rgOwner, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user, 2000, {from: rgOwner}))
    .then(() => rgTransactionRulesClone.addToWhitelist(user))
    .then(() => rGManagerClone.transfer(accounts[2], 2000, {from: user}))
    .then(() => rGManagerClone.getUserBalancesInAssetCards(user))
    .then(result => {
      assert.equal(result.length, 1);
   });
  });

  it('should be possible to start redemption and send coins to invoice', function() {
    const user = accounts[1];
    const invoice = 'invoice1';

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, 1000, rgOwner, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.redemptionTransferToInvoice.call(invoice, 1000, {from: user}))
    .then(assert.isTrue)
    .then(() => rGManagerClone.redemptionTransferToInvoice(invoice, 1000, {from: user}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(logs[0].args.from, user);
      assert.equal(web3.isAddress(logs[0].args.to), true);
      assert.equal(logs[0].args.value, 1000);

      assert.equal(logs[1].event, 'InvoiceCreated');
      assert.equal(logs[1].args.invoiceOwner, user);
      assert.equal(logs[1].args.invoice, invoice);
      assert.equal(web3.isAddress(logs[1].args.invoiceAddress), true);
      assert.equal(logs[1].args.amount, 1000);
    })
    .then(() => assertBalance(rGManagerClone, user, 0));
  });

  it('should NOT be possible to start redemption and send coins to invoice if balance is not enough', function() {
    const user = accounts[1];
    const invoice = 'invoice1';

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, 1000, rgOwner, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.redemptionTransferToInvoice.call(invoice, 1001, {from: user}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.redemptionTransferToInvoice(invoice, 1001, {from: user}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Not enough balance for transfer');
    })
    .then(() => assertBalance(rGManagerClone, user, 1000));
  });

  it('should NOT be possible to start redemption and send coins to invoice if invoice is already created', function() {
    const user = accounts[1];
    const invoice = 'invoice1';
    let transferData;

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, 1000, rgOwner, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.redemptionTransferToInvoice(invoice, 500, {from: user}))
    .then(() => rGManagerClone.redemptionTransferToInvoice.call(invoice, 500, {from: user}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.redemptionTransferToInvoice(invoice, 500, {from: user}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Invoice already exist');
    })
    .then(() => assertBalance(rGManagerClone, user, 500));
  });

  it('should be possible to cancel redemption for admin', function() {
    const user = accounts[1];
    const invoice = 'invoice1';

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, 1000, rgOwner, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.redemptionTransferToInvoice(invoice, 1000, {from: user}))
    .then(() => assertBalance(rGManagerClone, user, 0))
    .then(() => rGManagerClone.redemptionCancel.call(invoice, {from: rgOwner}))
    .then(assert.isTrue)
    .then(() => rGManagerClone.redemptionCancel(invoice, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(web3.isAddress(logs[0].args.from), true);
      assert.equal(logs[0].args.to, user);
      assert.equal(logs[0].args.value, 1000);

      assert.equal(logs[1].event, 'InvoiceCancelled');
      assert.equal(logs[1].args.invoice, invoice);
      assert.equal(web3.isAddress(logs[1].args.invoiceAddress), true);
      assert.equal(logs[1].args.amount, 1000);
    })
    .then(() => assertBalance(rGManagerClone, user, 1000));
  });

  it('should NOT be possible to cancel redemption for user', function() {
    const user = accounts[1];
    const invoice = 'invoice1';

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, 1000, rgOwner, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.redemptionTransferToInvoice(invoice, 1000, {from: user}))
    .then(() => assertBalance(rGManagerClone, user, 0))
    .then(() => rGManagerClone.redemptionCancel.call(invoice, {from: user}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.redemptionCancel(invoice, {from: user}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Call allowed only for owner');
    })
    .then(() => assertBalance(rGManagerClone, user, 0));
  });

  it('should NOT be possible to cancel redemption if admin sets not valid invoice', function() {
    const user = accounts[1];
    const invoice = 'invoice1';

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, 1000, rgOwner, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.redemptionTransferToInvoice(invoice, 1000, {from: user}))
    .then(() => assertBalance(rGManagerClone, user, 0))
    .then(() => rGManagerClone.redemptionCancel.call('Not valid Invoice', {from: rgOwner}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.redemptionCancel('Not valid Invoice', {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Provided address is not invoice');
    })
    .then(() => assertBalance(rGManagerClone, user, 0));
  });

  it('should be possible to make redemption Swap for admin', function() {
    const user = accounts[1];
    const invoice = 'invoice1';
    const coins = 1000;
    let RGAC1;
    let RGAC2;
    let RGAC3;
    let invoiceAddress;

    return rGManagerClone.deploy(chip1, coins, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, coins, rgOwner, {from: rgOwner}))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC2 = instance)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.redemptionTransferToInvoice(invoice, coins, {from: user}))
    .then(() => assertBalance(rGManagerClone, user, 0))

    .then(() => rGManagerClone.deploy(chip3, coins, rgOwner, {from: rgOwner}))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC3 = instance)

    .then(() => rGManagerClone.redemptionSwap.call(RGAC3.address, invoice, rgOwner, {from: rgOwner}))
    .then(assert.isTrue)
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 3000))
    .then(() => assertBalance(RGAC1, rgOwner, 0))
    .then(() => assertBalance(RGAC2, rgOwner, 500))
    .then(() => assertBalance(rGManagerClone, rgOwner, 1500))
    .then(() => rGManagerClone.redemptionSwap(RGAC3.address, invoice, rgOwner, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 3);
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(web3.isAddress(logs[0].args.from), true);
      assert.equal(logs[0].args.to, rgOwner);
      assert.equal(logs[0].args.value, coins);
      assert.equal(logs[1].event, 'Transfer');
      assert.equal(web3.isAddress(logs[1].args.to), true);
      assert.equal(logs[1].args.from, rgOwner);
      assert.equal(logs[1].args.value, coins);

      assert.equal(logs[2].event, 'InvoiceSwapped');
      assert.equal(logs[2].args.rgAssetCard, RGAC3.address);
      assert.equal(web3.isAddress(logs[2].args.invoiceAddress), true);
      invoiceAddress = logs[2].args.invoiceAddress;
      assert.equal(logs[2].args.barOwner, user);
      assert.equal(logs[2].args.amount, coins);
    })
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 3000))
    .then(() => assertBalance(rGManagerClone, rgOwner, 1500))
    .then(() => assertBalance(rGManagerClone, invoiceAddress, 1000))
    .then(() => assertBalance(RGAC1, rgOwner, 500))
    .then(() => assertBalance(RGAC2, rgOwner, 1000))
    .then(() => assertBalance(RGAC1, invoiceAddress, 0))
    .then(() => assertBalance(RGAC2, invoiceAddress, 0))
    .then(() => assertBalance(RGAC3, invoiceAddress, 1000));
  });

  it('should be possible to make redemption Swap for admin if there is 1st part of AC on invoice address, 2nd one owns by RG owner', function() {
    const user = accounts[1];
    const invoice = 'invoice1';
    const coins = 1000;
    let RGAC1;
    let RGAC2;
    let invoiceAddress;

    return rGManagerClone.deploy(chip1, coins, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.transfer(user, 700, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 300, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, coins, rgOwner, {from: rgOwner}))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC2 = instance)
    .then(() => rGManagerClone.transfer(user, 300, {from: rgOwner}))
    .then(() => rGManagerClone.redemptionTransferToInvoice(invoice, coins, {from: user}))
    .then(() => assertBalance(rGManagerClone, user, 0))

    .then(() => rGManagerClone.redemptionSwap.call(RGAC2.address, invoice, rgOwner, {from: rgOwner}))
    .then(assert.isTrue)
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 2000))
    .then(() => assertBalance(RGAC1, rgOwner, 0))
    .then(() => assertBalance(RGAC2, rgOwner, 700))
    .then(() => rGManagerClone.redemptionSwap(RGAC2.address, invoice, rgOwner, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 3);
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(web3.isAddress(logs[0].args.from), true);
      assert.equal(logs[0].args.to, rgOwner);
      assert.equal(logs[0].args.value, coins);
      assert.equal(logs[1].event, 'Transfer');
      assert.equal(web3.isAddress(logs[1].args.to), true);
      assert.equal(logs[1].args.from, rgOwner);
      assert.equal(logs[1].args.value, coins);

      assert.equal(logs[2].event, 'InvoiceSwapped');
      assert.equal(logs[2].args.rgAssetCard, RGAC2.address);
      assert.equal(web3.isAddress(logs[2].args.invoiceAddress), true);
      invoiceAddress = logs[2].args.invoiceAddress;
      assert.equal(logs[2].args.barOwner, user);
      assert.equal(logs[2].args.amount, coins);
    })
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 2000))
    .then(() => assertBalance(rGManagerClone, rgOwner, 700))
    .then(() => assertBalance(rGManagerClone, invoiceAddress, 1000))
    .then(() => assertBalance(RGAC1, rgOwner, 700))
    .then(() => assertBalance(RGAC2, rgOwner, 0))
    .then(() => assertBalance(RGAC1, invoiceAddress, 0))
    .then(() => assertBalance(RGAC2, invoiceAddress, 1000));
  });

  it('should NOT be possible to make redemption Swap for user', function() {
    const user = accounts[1];
    const invoice = 'invoice1';
    const coins = 1000;
    let RGAC3;

    return rGManagerClone.deploy(chip1, coins, rgOwner)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, coins, rgOwner, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.redemptionTransferToInvoice(invoice, coins, {from: user}))
    .then(() => assertBalance(rGManagerClone, user, 0))
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 2000))

    .then(() => rGManagerClone.deploy(chip3, coins, rgOwner, {from: rgOwner}))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC3 = instance)

    .then(() => rGManagerClone.redemptionSwap.call(RGAC3.address, invoice, rgOwner, {from: user}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.redemptionSwap(RGAC3.address, invoice, rgOwner, {from: user}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Call allowed only for owner');
    })
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 3000));

  });

  it('should NOT be possible to make redemption Swap if selected RGAC for swap and invoice balance are not equal', function() {
    const user = accounts[1];
    const invoice = 'invoice1';
    const coins = 1000;
    let RGAC3;

    return rGManagerClone.deploy(chip1, coins, rgOwner)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, coins, rgOwner, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.redemptionTransferToInvoice(invoice, coins, {from: user}))
    .then(() => assertBalance(rGManagerClone, user, 0))
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 2000))

    .then(() => rGManagerClone.deploy(chip3, coins + 1, rgOwner, {from: rgOwner}))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC3 = instance)

    .then(() => rGManagerClone.redemptionSwap.call(RGAC3.address, invoice, rgOwner, {from: rgOwner}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.redemptionSwap(RGAC3.address, invoice, rgOwner, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Locked coins != to asset coins');
    })
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 3000 + 1));
  });

  it('should NOT be possible to make redemption Swap if RG owner doesn\'t own all coins in selected RGAC for swap', function() {
    const user = accounts[1];
    const invoice = 'invoice1';
    const coins = 1000;
    let RGAC3;

    return rGManagerClone.deploy(chip1, 500, rgOwner)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, 500, rgOwner, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.redemptionTransferToInvoice(invoice, coins, {from: user}))
    .then(() => assertBalance(rGManagerClone, user, 0))
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 1000))

    .then(() => rGManagerClone.deploy(chip3, coins, rgOwner, {from: rgOwner}))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC3 = instance)

    //move 1 coin from rg owner to the other user, then RGAC3 will not be fully owned by rg owner
    .then(() => rGManagerClone.transfer(accounts[4], 1, {from: rgOwner}))

    .then(() => rGManagerClone.redemptionSwap.call(RGAC3.address, invoice, rgOwner, {from: rgOwner}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.redemptionSwap(RGAC3.address, invoice, rgOwner, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'RGAC is not full for exchange');
    })
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 2000));
  });

  it('should NOT be possible to make redemption Swap if admin sets not valid invoice', function() {
    const user = accounts[1];
    const invoice = 'invoice1';
    const coins = 1000;
    let RGAC3;

    return rGManagerClone.deploy(chip1, coins, rgOwner)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, coins, rgOwner, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.redemptionTransferToInvoice(invoice, coins, {from: user}))
    .then(() => assertBalance(rGManagerClone, user, 0))
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 2000))

    .then(() => rGManagerClone.deploy(chip3, coins, rgOwner, {from: rgOwner}))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC3 = instance)

    .then(() => rGManagerClone.redemptionSwap.call(RGAC3.address, 'Not valid Invoice', rgOwner, {from: rgOwner}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.redemptionSwap(RGAC3.address, 'Not valid Invoice', rgOwner, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Provided address is not invoice');
    })
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 3000));
  });

  it('should be possible to start redemption and send full bar coins to invoice', function() {
    const user = accounts[1];
    const invoice = 'invoice1';
    const coins = 1000;

    let RGAC2;

    return rGManagerClone.deploy(chip1, coins, rgOwner)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, coins, rgOwner, {from: rgOwner}))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC2 = instance)
    .then(() => rGManagerClone.transfer(user, 1000, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user, 1500))
    .then(() => assertBalance(RGAC2, user, 1000))
    .then(() => RGAC2.transferToInvoice.call(invoice, {from: user}))
    .then(assert.isTrue)
    .then(() => RGAC2.transferToInvoice(invoice, {from: user}))
    .then(result => {
      assert.equal(result.logs.length, 2);
      assert.equal(result.logs[0].event, 'Transfer');
      assert.equal(result.logs[0].args.from, user);
      assert.equal(web3.isAddress(result.logs[0].args.to), true);
      assert.equal(result.logs[0].args.value, coins);

      assert.equal(result.logs[1].event, 'Transfer');
      assert.equal(result.logs[1].args.from, user);
      assert.equal(web3.isAddress(result.logs[1].args.to), true);
      assert.equal(result.logs[1].args.value, coins);
    })
    .then(() => assertBalance(rGManagerClone, user, 500))
    .then(() => assertBalance(RGAC2, user, 0));

  });

  it('should NOT be possible to start redemption and send full bar coins to invoice if user has not all bars coins', function() {
    const user = accounts[1];
    const invoice = 'invoice1';
    const coins = 1000;

    let RGAC1;

    return rGManagerClone.deploy(chip1, coins, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user, 500))
    .then(() => assertBalance(RGAC1, user, 500))
    .then(() => RGAC1.transferToInvoice.call(invoice, {from: user}))
    .then(assert.isFalse)
    .then(() => RGAC1.transferToInvoice(invoice, {from: user}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Sender owns not all coins of AC');
    })
    .then(() => assertBalance(rGManagerClone, user, 500))
    .then(() => assertBalance(RGAC1, user, 500));
  });

  it('should be possible to burn GCoins for admin after redemption', function() {
    const user = accounts[1];
    const invoice = 'invoice1';
    const coins = 1000;

    let RGAC2;

    return rGManagerClone.deploy(chip1, coins, rgOwner)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, coins, rgOwner, {from: rgOwner}))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC2 = instance)
    .then(() => rGManagerClone.transfer(user, 1000, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user, 1500))
    .then(() => assertBalance(RGAC2, user, 1000))
    .then(() => RGAC2.transferToInvoice(invoice, {from: user}))
    .then(() => assertBalance(rGManagerClone, user, 500))
    .then(() => assertBalance(RGAC2, user, 0))
    .then(() => rGManagerClone.redemptionBurnGcoins.call(RGAC2.address, invoice, {from: rgOwner}))
    .then(assert.isTrue)
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result.valueOf(), 2000))
    .then(() => RGAC2.totalSupply())
    .then(result => assert.equal(result, 1000))
    .then(() => rGManagerClone.redemptionBurnGcoins(RGAC2.address, invoice, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 2);
      assert.equal(logs[0].event, 'Burned');
      assert.equal(logs[0].args.assetCard, RGAC2.address);
      assert.equal(logs[0].args.value, coins);

      assert.equal(logs[1].event, 'Transfer');
      assert.equal(web3.isAddress(logs[1].args.from), true);
      assert.equal(logs[1].args.to, 0x0);
      assert.equal(logs[1].args.value, coins);
    })
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 1000))
    .then(() => RGAC2.totalSupply())
    .then(result => assert.equal(result, 0));
  });

  it('should be possible to burn GCoins for admin after redemption swap', function() {
    const user = accounts[1];
    const invoice = 'invoice1';
    const coins = 1000;
    let RGAC1;
    let RGAC2;
    let RGAC3;
    let invoiceAddress;

    return rGManagerClone.deploy(chip1, coins, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC1 = instance)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, coins, rgOwner, {from: rgOwner}))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC2 = instance)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.redemptionTransferToInvoice(invoice, coins, {from: user}))

    .then(() => rGManagerClone.deploy(chip3, coins, rgOwner, {from: rgOwner}))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC3 = instance)

    .then(() => rGManagerClone.redemptionSwap(RGAC3.address, invoice, rgOwner, {from: rgOwner}))
    .then(() => rGManagerClone.redemptionBurnGcoins.call(RGAC3.address, invoice, {from: rgOwner}))
    .then(assert.isTrue)

    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 3000))
    .then(() => rGManagerClone.redemptionBurnGcoins(RGAC3.address, invoice, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 2);
      assert.equal(logs[0].event, 'Burned');
      assert.equal(logs[0].args.assetCard, RGAC3.address);
      assert.equal(logs[0].args.value, coins);

      assert.equal(logs[1].event, 'Transfer');
      assert.equal(web3.isAddress(logs[1].args.from), true);
      assert.equal(logs[1].args.to, 0x0);
      assert.equal(logs[1].args.value, coins);
    })
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 2000))
    .then(() => RGAC3.totalSupply())
    .then(result => assert.equal(result, 0));
  });

  it('should NOT be possible to burn GCoins for user after redemption', function() {
    const user = accounts[1];
    const invoice = 'invoice1';
    const coins = 1000;

    let RGAC2;

    return rGManagerClone.deploy(chip1, coins, rgOwner)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, coins, rgOwner, {from: rgOwner}))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC2 = instance)
    .then(() => rGManagerClone.transfer(user, 1000, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user, 1500))
    .then(() => assertBalance(RGAC2, user, 1000))
    .then(() => RGAC2.transferToInvoice(invoice, {from: user}))
    .then(() => assertBalance(rGManagerClone, user, 500))
    .then(() => assertBalance(RGAC2, user, 0))
    .then(() => rGManagerClone.redemptionBurnGcoins.call(RGAC2.address, invoice, {from: user}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 2000))
    .then(() => RGAC2.totalSupply())
    .then(result => assert.equal(result, 1000))
    .then(() => rGManagerClone.redemptionBurnGcoins(RGAC2.address, invoice, {from: user}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Call allowed only for owner');
    })
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 2000))
    .then(() => RGAC2.totalSupply())
    .then(result => assert.equal(result, 1000));
  });

  it('should NOT be possible to burn GCoins if provided address is not an invoice', function() {
    const user = accounts[1];
    const invoice = 'invoice1';
    const coins = 1000;

    let RGAC2;

    return rGManagerClone.deploy(chip1, coins, rgOwner)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, coins, rgOwner, {from: rgOwner}))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC2 = instance)
    .then(() => rGManagerClone.transfer(user, 1000, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user, 1500))
    .then(() => assertBalance(RGAC2, user, 1000))
    .then(() => RGAC2.transferToInvoice(invoice, {from: user}))
    .then(() => assertBalance(rGManagerClone, user, 500))
    .then(() => assertBalance(RGAC2, user, 0))
    .then(() => rGManagerClone.redemptionBurnGcoins.call(RGAC2.address, 'Not valid Invoice', {from: rgOwner}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 2000))
    .then(() => RGAC2.totalSupply())
    .then(result => assert.equal(result, 1000))
    .then(() => rGManagerClone.redemptionBurnGcoins(RGAC2.address, 'Not valid Invoice', {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Provided address is not invoice');
    })
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 2000))
    .then(() => RGAC2.totalSupply())
    .then(result => assert.equal(result, 1000));
  });

    it('should NOT be possible to burn GCoins after redemption cancelled', function() {
      const user = accounts[1];
      const invoice = 'invoice1';
      const coins = 1000;

      let RGAC2;

      return rGManagerClone.deploy(chip1, coins, rgOwner)
      .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
      .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
      .then(() => rGManagerClone.deploy(chip2, coins, rgOwner, {from: rgOwner}))
      .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
      .then(instance => RGAC2 = instance)
      .then(() => rGManagerClone.transfer(user, 1000, {from: rgOwner}))
      .then(() => assertBalance(rGManagerClone, user, 1500))
      .then(() => assertBalance(RGAC2, user, 1000))
      .then(() => RGAC2.transferToInvoice(invoice, {from: user}))
      .then(() => assertBalance(rGManagerClone, user, 500))
      .then(() => assertBalance(RGAC2, user, 0))
      .then(() => rGManagerClone.redemptionCancel(invoice, {from: rgOwner}))
      .then(() => rGManagerClone.redemptionBurnGcoins.call(RGAC2.address, invoice, {from: rgOwner}))
      .then(assert.isFalse)
      .then(() => rGManagerClone.totalSupply())
      .then(result => assert.equal(result, 2000))
      .then(() => RGAC2.totalSupply())
      .then(result => assert.equal(result, 1000))
      .then(() => rGManagerClone.redemptionBurnGcoins(RGAC2.address, invoice, {from: rgOwner}))
      .then(result => {
        assert.equal(bytesToString(result.logs[0].args.error), 'Provided address is not invoice');
      })
      .then(() => rGManagerClone.totalSupply())
      .then(result => assert.equal(result, 2000))
      .then(() => RGAC2.totalSupply())
      .then(result => assert.equal(result, 1000));
    });

  it('should NOT be possible to cancel redemption when GCoins are burned already', function() {
    const user = accounts[1];
    const invoice = 'invoice1';
    const coins = 1000;
    let RGAC3;

    return rGManagerClone.deploy(chip1, coins, rgOwner)
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(accounts[2], 500, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, coins, rgOwner, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user, 500, {from: rgOwner}))
    .then(() => rGManagerClone.redemptionTransferToInvoice(invoice, coins, {from: user}))

    .then(() => rGManagerClone.deploy(chip3, coins, rgOwner, {from: rgOwner}))
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGAC3 = instance)

    .then(() => rGManagerClone.redemptionSwap(RGAC3.address, invoice, rgOwner, {from: rgOwner}))
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 3000))
    .then(() => rGManagerClone.redemptionBurnGcoins(RGAC3.address, invoice, {from: rgOwner}))
    .then(() => rGManagerClone.totalSupply())
    .then(result => assert.equal(result, 2000))
    .then(() => RGAC3.totalSupply())
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.redemptionCancel.call(invoice, {from: rgOwner}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.redemptionCancel(invoice, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Provided address is not invoice');
    })
  });

  it('should has set up rg transaction rules on rg manager contract', function() {
    return rGManagerClone.transactionRules()
    .then(result => assert.equal(result, rgTransactionRulesClone.address));
  });

  it('should be possible to send coins via spend function', function() {
    const recipient = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => assertBalance(rGManagerClone, recipient, 0))
    .then(() => rGManagerClone.spend(recipient, 400, 5, 'test comment', {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 2);
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(logs[0].args.from, rgOwner);
      assert.equal(logs[0].args.to, recipient);
      assert.equal(logs[0].args.value, 400);
      assert.equal(logs[1].event, 'Spent');
      assert.equal(logs[1].args.from, rgOwner);
      assert.equal(logs[1].args.to, recipient);
      assert.equal(logs[1].args.value, 400);
      assert.equal(logs[1].args.channel, 5);
      assert.equal(logs[1].args.comment, 'test comment');
    })
    .then(() => assertBalance(rGManagerClone, recipient, 400));
  });

  it('should be possible to send coins ia spendFrom function', function() {
    const approver = accounts[1];
    const recipient = accounts[3];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.spend(approver, 500, 5, 'spend', {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, approver, 500))
    .then(() => rGManagerClone.approve(rgOwner, 1000, {from: approver}))
    .then(() => rGManagerClone.spendFrom(approver, recipient, 500, 20, 'spendFrom', {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 2);
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(logs[0].args.from, approver);
      assert.equal(logs[0].args.to, recipient);
      assert.equal(logs[0].args.value, 500);
      assert.equal(logs[1].event, 'Spent');
      assert.equal(logs[1].args.from, approver);
      assert.equal(logs[1].args.to, recipient);
      assert.equal(logs[1].args.value, 500);
      assert.equal(logs[1].args.channel, 20);
      assert.equal(logs[1].args.comment, 'spendFrom');
    })
    .then(() => assertBalance(rGManagerClone, approver, 0))
    .then(() => assertBalance(rGManagerClone, recipient, 500));
  });

  it('should NOT be possible to transfer to user if sender is not in whitelist and transaction is not signed on rgTransactionRules contract side', function() {
    let user1 = accounts[1];
    let user2 = accounts[2];
    const chip1 = 'chip1';

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(user1, 400, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, 400))

    .then(() => rgTransactionRulesClone.removeFromWhitelist(rgOwner))

    .then(() => rGManagerClone.spend(user2, 10, 5, 'test comment', {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[1].args.error), 'Origin isnt allowed for transfer');
    })
    .then(() => assertBalance(rGManagerClone, rgOwner, 600))
    .then(() => assertBalance(rGManagerClone, user2, 0))
  });

  it('should NOT be possible to transfer to user if sender is not in whitelist and passed not all required consumptions on rgTransactionRules contract side', function() {
    let spendData;
    const chip1 = 'chip1';
    const tokensToTransfer = 10;
    const uintBytes = addLeftToInt(tokensToTransfer);
    const user1 = accounts[1];
    const user2 = accounts[2];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(user1, 400, {from: rgOwner}))

    .then(() => spendData = rgOwner + user2.substr(2) + uintBytes)
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(spendData, {encoding: 'hex'}), rgTransactionRulesClone.address, rgOwnerBytes32, 1, 2, {from: ruleAuthorizer}))

    .then(() => rgTransactionRulesClone.removeFromWhitelist(rgOwner))

    .then(() => rGManagerClone.spend.call(user2, tokensToTransfer, 5, 'test comment', {from: rgOwner}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.spend(user2, tokensToTransfer, 5, 'test comment', {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Not all signatures collected');
    })
    .then(() => assertBalance(rGManagerClone, rgOwner, 600))
    .then(() => assertBalance(rGManagerClone, user2, 0))
  });

  it('should be possible to transfer to user if sender is not in whitelist and transaction is signed', function() {
    let spendData;
    const chip1 = 'chip1';
    const tokensToTransfer = 10;
    const uintBytes = addLeftToInt(tokensToTransfer);
    const user1 = accounts[1];
    const user2 = accounts[2];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(user1, 400, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, 400))

    .then(() => rgTransactionRulesClone.removeFromWhitelist(rgOwner))

    .then(() => spendData = rgOwner + user2.substr(2) + uintBytes)
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(spendData, {encoding: 'hex'}), rgTransactionRulesClone.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => rGManagerClone.spend.call(user2, tokensToTransfer, 5, 'test comment', {from: rgOwner}))
    .then(assert.isTrue)
    .then(() => rGManagerClone.spend(user2, tokensToTransfer, 5, 'test comment', {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, rgOwner, 590))
    .then(() => assertBalance(rGManagerClone, user2, tokensToTransfer))
  });

  it('should be possible to set default fee time', function() {
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.setDefaultFeeTime.call(timeNowInSeconds, {from: rgOwner})
    .then(assert.isTrue)
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'DefaultFeeTimeSet');
      assert.equal(result.logs[0].args.time, timeNowInSeconds);
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, timeNowInSeconds));
  });

  it('should be possible to decrease default fee time', function() {
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.setDefaultFeeTime(timeNowInSeconds + 3600, {from: rgOwner})
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, timeNowInSeconds + 3600))
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds + 1800, {from: rgOwner}))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'DefaultFeeTimeSet');
      assert.equal(result.logs[0].args.time, timeNowInSeconds + 1800);
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, timeNowInSeconds + 1800));
  });

  it('should be possible to increase default fee time in future', function() {
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.setDefaultFeeTime(timeNowInSeconds + 1800, {from: rgOwner})
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, timeNowInSeconds + 1800))
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds + 3600, {from: rgOwner}))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'DefaultFeeTimeSet');
      assert.equal(result.logs[0].args.time, timeNowInSeconds + 3600);
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, timeNowInSeconds + 3600));
  });

  it('should NOT be possible to set default fee time in past', function() {
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.setDefaultFeeTime(timeNowInSeconds - 7200, {from: rgOwner})
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Not allowed fee time');
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, 0));
  });

  it('should NOT be possible to set default fee for second time if current fee time less than current time', function() {
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner})
    .then(() => increaseTime(oneDayInSec + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds + oneDayInSec * 2, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Not allowed fee time');
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, timeNowInSeconds));
  });

  it('should NOT be possible to set default fee time in past if current fee time is in future', function() {
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.setDefaultFeeTime(timeNowInSeconds + 7200, {from: rgOwner})
    .then(() => increaseTime(oneDayInSec + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Not allowed fee time');
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, timeNowInSeconds + 7200));
  });

  it('should be possible to update default fee for second time in range of current fee time day', function() {
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner})
    .then(() => increaseTime(oneDayInSec * 10 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rGManagerClone.updateDefaultFeeTimeSameDay(timeNowInSeconds + 3600, {from: rgOwner}))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'DefaultFeeTimeSet');
      assert.equal(result.logs[0].args.time, timeNowInSeconds + 3600);
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, timeNowInSeconds + 3600));
  });

  it('should NOT be possible to update default fee for second time in range of more than current fee time day', function() {
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner})
    .then(() => increaseTime(oneDayInSec * 10 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rGManagerClone.updateDefaultFeeTimeSameDay(timeNowInSeconds + 86400, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Update allowed for same day only');
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, timeNowInSeconds));
  });

  it('should NOT be possible to set default fee for second time in range of current fee time day via setDefaultFeeTime', function() {
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner})
    .then(() => increaseTime(oneDayInSec * 10 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds + 3600, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Not allowed fee time');
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, timeNowInSeconds));
  });

  it('should NOT be possible to set default fee time via updateDefaultFeeTimeSameDay', function() {
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.updateDefaultFeeTimeSameDay.call(timeNowInSeconds, {from: rgOwner})
    .then(assert.isFalse)
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.updateDefaultFeeTimeSameDay(timeNowInSeconds, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Default fee time should be set');
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, 0));
  });

  it('should NOT be possible to set default fee time via updateDefaultFeeTimeSameDay, only update', function() {
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.updateDefaultFeeTimeSameDay(timeNowInSeconds - 7200, {from: rgOwner})
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Default fee time should be set');
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, 0));
  });

  it('should NOT be possible to update defaultFeeTime if feeTime not in range of 1 day with defaultFeeTime via updateDefaultFeeTimeSameDay', function() {
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner})
    .then(() => increaseTime(oneDayInSec + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rGManagerClone.updateDefaultFeeTimeSameDay(timeNowInSeconds + oneDayInSec * 2, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Update allowed for same day only');
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, timeNowInSeconds));
  });

  it('should NOT be possible to set default fee time for not rg owner via updateDefaultFeeTimeSameDay', function() {
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.updateDefaultFeeTimeSameDay.call(timeNowInSeconds, {from: accounts[1]})
    .then(assert.isFalse)
    .then(() => rGManagerClone.updateDefaultFeeTimeSameDay(timeNowInSeconds, {from: accounts[1]}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Call allowed only for owner');
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, 0));
  });

  it('should NOT be possible to set default fee time equal 0 via updateDefaultFeeTimeSameDay', function() {
    return rGManagerClone.updateDefaultFeeTimeSameDay.call(0, {from: rgOwner})
    .then(assert.isFalse)
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.updateDefaultFeeTimeSameDay(0, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Not allowed to set 0 fee time');
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, 0));
  });

  it('should NOT be possible to set default fee time for not rg owner', function() {
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.setDefaultFeeTime.call(timeNowInSeconds, {from: accounts[1]})
    .then(assert.isFalse)
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: accounts[1]}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Call allowed only for owner');
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, 0));
  });

  it('should NOT be possible to set default fee time equal 0', function() {
    return rGManagerClone.setDefaultFeeTime.call(0, {from: rgOwner})
    .then(assert.isFalse)
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.setDefaultFeeTime(0, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Not allowed to set 0 fee time');
    })
    .then(() => rGManagerClone.defaultFeeTime())
    .then(result => assert.equal(result, 0));
  });

  it('should be possible to set fee collector address', function() {
    const feeCollector = accounts[2];
    return rGManagerClone.setFeeCollectorAddress.call(feeCollector, {from: rgOwner})
    .then(assert.isTrue)
    .then(() => rGManagerClone.feeCollector())
    .then(result => assert.equal(result, 0x0))
    .then(() => rGManagerClone.setFeeCollectorAddress(feeCollector, {from: rgOwner}))
    .then(result => {
      assert.equal(result.logs.length, 2);
      assert.equal(result.logs[0].event, 'FeeCollectorSet');
      assert.equal(result.logs[0].args.feeCollectorAddress, feeCollector);
      assert.equal(result.logs[1].event, 'NonFeeAddressAdded');
      assert.equal(result.logs[1].args.nonFeeAddress, feeCollector);
    })
    .then(() => rGManagerClone.feeCollector())
    .then(result => assert.equal(result, feeCollector))
  });

  it('should be possible to change fee collector address', function() {
    const feeCollector = accounts[2];
    const feeCollectorNew = accounts[3];

    return rGManagerClone.setFeeCollectorAddress(feeCollector, {from: rgOwner})
    .then(() => rGManagerClone.feeCollector())
    .then(result => assert.equal(result, feeCollector))
    .then(() => rGManagerClone.setFeeCollectorAddress(feeCollectorNew, {from: rgOwner}))
    .then(() => rGManagerClone.feeCollector())
    .then(result => assert.equal(result, feeCollectorNew))
  });

  it('should NOT be possible to set zero fee collector address', function() {
    return rGManagerClone.setFeeCollectorAddress.call(0x0, {from: rgOwner})
    .then(assert.isFalse)
    .then(() => rGManagerClone.setFeeCollectorAddress(0x0, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Collector address is not valid');
    })
    .then(() => rGManagerClone.feeCollector())
    .then(result => assert.equal(result, 0x0))
  });

  it('should NOT be possible to set collector address for not rg owner', function() {
    const feeCollector = accounts[2];
    return rGManagerClone.setFeeCollectorAddress.call(feeCollector, {from: accounts[1]})
    .then(assert.isFalse)
    .then(() => rGManagerClone.setFeeCollectorAddress(feeCollector, {from: accounts[1]}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Call allowed only for owner');
    })
    .then(() => rGManagerClone.feeCollector())
    .then(result => assert.equal(result, 0x0))
  });

  it('should be possible to set yearly fee', function() {
    return rGManagerClone.setYearlyFee.call(20, {from: rgOwner})
    .then(assert.isTrue)
    .then(() => rGManagerClone.yearlyFee())
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.setYearlyFee(20, {from: rgOwner}))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'FeeSet');
      assert.equal(result.logs[0].args.yearly, 20);
    })
    .then(() => rGManagerClone.yearlyFee())
    .then(result => assert.equal(result, 20))
  });

  it('should NOT be possible to set yearly fee more than 10%', function() {
    return rGManagerClone.setYearlyFee.call(1001)
    .then(assert.isFalse)
    .then(() => rGManagerClone.yearlyFee())
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.setYearlyFee(1001))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Set fee in range 0% - 10%');
    })
  });

  it('should NOT be possible to set yearly fee for not rg owner', function() {
    return rGManagerClone.setYearlyFee.call(20, {from: accounts[1]})
    .then(assert.isFalse)
    .then(() => rGManagerClone.yearlyFee())
    .then(result => assert.equal(result, 0))
    .then(() => rGManagerClone.setYearlyFee(20, {from: accounts[1]}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Call allowed only for owner');
    })
  });

  it('should set fee for one day for user with positive balance when he makes transfer', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    .then(() => rGManagerClone.setYearlyFee(20, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, oneGCoin, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin))
    .then(() => increaseTime(oneDayInSec + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.transfer(user2, oneGCoin / 2, {from: user1}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin / 2))
    .then(() => rGManagerClone.feeToCollect(user1))
    //1096 is 1st day fee from 2 gcoins in cents
    .then(result => assert.equal(result.valueOf(), 548));
  });

  it('should not be possible to transfer coins if user is not able to cover fee after transfer', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    .then(() => rGManagerClone.setYearlyFee(20, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, oneGCoin, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin))
    .then(() => increaseTime(oneDayInSec + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.transfer(user2, oneGCoin, {from: user1}))
    .then(result => {
      assert.equal(bytesToString(result.logs[3].args.error), 'Not possible to cover fee');
      assert.equal(result.logs[4].args.availableBalance.valueOf(), 99999452);
    })
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin))
    .then(() => rGManagerClone.feeToCollect(user1))
    //1096 is 1st day fee from 2 gcoins in cents
    .then(result => assert.equal(result.valueOf(), 548))
  })

  it('should set fee for 3 days for user with positive balance when he makes a transfer', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    const fee = 2;
    const timeNowInSeconds = Math.round(new Date() / 1000);
    let user1Balance;

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, oneGCoin, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin))
    .then(() => increaseTime(oneDayInSec * 3 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.balanceOf(user1))
    .then(result => user1Balance = result.valueOf())
    .then(() => rGManagerClone.transfer(user2, 1, {from: user1}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin - 1))
    .then(() => rGManagerClone.feeToCollect(user1))
    //fee for threedays is 548 * 3
    .then(result => assert.equal(result.valueOf(), calculateFee(3, user1Balance, fee)))
  });

  it('should set fee for 10 years for user with positive balance when he makes a transfer', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    const timeNowInSeconds = Math.round(new Date() / 1000);
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    const fee = 2;
    let user1Balance;

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, oneGCoin, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin))
    .then(() => increaseTime(oneDayInSec * 365 * 10 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.balanceOf(user1))
    .then(result => user1Balance = result.valueOf())
    .then(() => rGManagerClone.transfer(user2, 1, {from: user1}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin - 1))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), calculateFee(365 * 10, user1Balance, fee)))
  });

  it('should set 1 base unit fee for user with positive balance less or equal to 0.001825 GCoins', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    const val = 182500;
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.deploy(chip1, oneGCoin, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    .then(() => rGManagerClone.setYearlyFee(20, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, val, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, val))
    .then(() => increaseTime(oneDayInSec + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.transfer(user2, 1, {from: user1}))
    .then(() => assertBalance(rGManagerClone, user1, val - 1))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), 1));
  });

  it('should set 2 base unit fee for user with positive balance more than 0.001825 GCoins', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    const val = 182501;
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.deploy(chip1, oneGCoin, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    //set yearly fee as 0.02% (or 0.0002 * 1000) - 2
    .then(() => rGManagerClone.setYearlyFee(20, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, val, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, val))
    .then(() => increaseTime(oneDayInSec + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.transfer(user2, 1, {from: user1}))
    .then(() => assertBalance(rGManagerClone, user1, val - 1))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), 2));
  });

  it('should not set fee for user with zero balance', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.deploy(chip1, oneGCoin, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    .then(() => rGManagerClone.setYearlyFee(20, {from: rgOwner}))
    .then(() => increaseTime(oneDayInSec * 5 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => assertBalance(rGManagerClone, user1, 0))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), 0));
  });

  it('should not calculate fee if defaultFeeTime is not set', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.deploy(chip1, oneGCoin, rgOwner)
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    .then(() => rGManagerClone.setYearlyFee(20, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, oneGCoin, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin))
    .then(() => increaseTime(oneDayInSec * 10 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.transfer(user2, oneGCoin / 2, {from: user1}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin / 2))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), 0));
  });

  it('should NOT collect fee from feeCollector address', function() {
    const chip1 = 'chip1';
    const feeCollector = accounts[1];
    const user2 = accounts[2];
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    .then(() => rGManagerClone.setFeeCollectorAddress(feeCollector))
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds))
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    .then(() => rGManagerClone.setYearlyFee(20, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(feeCollector, oneGCoin, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, feeCollector, oneGCoin))
    .then(() => increaseTime(oneDayInSec * 10 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(feeCollector))
    .then(() => rGManagerClone.transfer(user2, 1, {from: feeCollector}))
    .then(() => assertBalance(rGManagerClone, feeCollector, oneGCoin - 1))
    .then(() => rGManagerClone.feeToCollect(feeCollector))
    .then(result => assert.equal(result.valueOf(), 0));
  });

  it('should NOT be possible to set account as feeCollector if fee debt exist', function() {
    const chip1 = 'chip1';
    const feeCollector = accounts[1];
    const user2 = accounts[2];
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds))
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    .then(() => rGManagerClone.setYearlyFee(20, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(feeCollector, oneGCoin, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, feeCollector, oneGCoin))
    .then(() => increaseTime(oneDayInSec * 10 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(feeCollector))
    .then(() => rGManagerClone.transfer(user2, 1, {from: feeCollector}))
    .then(() => assertBalance(rGManagerClone, feeCollector, oneGCoin - 1))
    .then(() => rGManagerClone.setFeeCollectorAddress(feeCollector))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Collector address has fee debt');
    })
    .then(() => rGManagerClone.feeCollector())
    .then(result => assert.equal(result, 0x0));
  })

  it('should be possible to collect fee via collectFee function', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    const feeCollector = accounts[3];
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    const fee = 2;
    const timeNowInSeconds = Math.round(new Date() / 1000);
    let user1Balance;

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    .then(() => rGManagerClone.setFeeCollectorAddress(feeCollector))
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, oneGCoin, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin))
    .then(() => increaseTime(oneDayInSec * 365 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.balanceOf(user1))
    .then(result => user1Balance = result.valueOf())
    .then(() => rGManagerClone.transfer(user2, 1, {from: user1}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin - 1))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), calculateFee(365, user1Balance, fee)))
    .then(() => rGManagerClone.collectFee(user1, {from: user1}))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), 0))
  });

  it('should NOT be possible to collect fee via collectFee function if feeCollector is not set', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    const feeCollector = accounts[3];
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    const fee = 2;
    const timeNowInSeconds = Math.round(new Date() / 1000);
    let user1Balance;

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, oneGCoin, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin))
    .then(() => increaseTime(oneDayInSec * 10 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.balanceOf(user1))
    .then(result => user1Balance = result.valueOf())
    .then(() => rGManagerClone.transfer(user2, 1, {from: user1}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin - 1))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), calculateFee(10, user1Balance, fee)))
    .then(() => rGManagerClone.collectFee(user1, {from: user1}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Set feeCollector address first');
    })
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), calculateFee(10, user1Balance, fee)))
  });

  it('should NOT be possible to collect fee if address has no debt', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    const feeCollector = accounts[3];
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    const fee = 2;
    const timeNowInSeconds = Math.round(new Date() / 1000);
    let user1Balance;

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    .then(() => rGManagerClone.setFeeCollectorAddress(feeCollector))
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, oneGCoin, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.balanceOf(user1))
    .then(result => user1Balance = result.valueOf())
    .then(() => rGManagerClone.transfer(user2, 1, {from: user1}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin - 1))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), 0))
    .then(() => rGManagerClone.collectFee(user1, {from: user1}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Nothing to collect');
    })
  });

  it('should set fee for user if he receives coins for 2nd time', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    const fee = 2;
    const timeNowInSeconds = Math.round(new Date() / 1000);
    let user1Balance;

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, oneGCoin, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin))
    .then(() => increaseTime(oneDayInSec * 3 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rGManagerClone.balanceOf(user1))
    .then(result => user1Balance = result.valueOf())
    .then(() => rGManagerClone.transfer(user1, oneGCoin / 2, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin * 1.5))
    .then(() => rGManagerClone.feeToCollect(user1))
    //fee for threedays is 548 * 3
    .then(result => assert.equal(result.valueOf(), calculateFee(3, user1Balance, fee)));
  });

  it('should set fee on all user balances (10 base units) after ten days', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    const val = 10;
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.deploy(chip1, oneGCoin, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    .then(() => rGManagerClone.setYearlyFee(20, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, val, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, val))
    .then(() => increaseTime(oneDayInSec * 10 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.transfer(user2, 0, {from: user1}))
    .then(() => assertBalance(rGManagerClone, user1, val))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), 10));
  });

  it('should set fee when transfer to the receiver via rgassetcard', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    //set yearly fee as 0.2% (or 0.002 * 10000) - 20
    const fee = 20;
    const val = 182504;
    const timeNowInSeconds = Math.round(new Date() / 1000);
    let user1Balance;
    let userFeeForThreeDays;
    let rgAssetOwnershipCardAddress;
    let RGACcontract1;

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    .then(result => rgAssetOwnershipCardAddress = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress))
    .then(instance => RGACcontract1 = instance)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, val, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, val))
    .then(() => increaseTime(oneDayInSec * 3 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.balanceOf(user1))
    .then(result => user1Balance = result.valueOf())
    .then(() => RGACcontract1.transfer(user2, 1, {from: user1}))
    .then(() => assertBalance(rGManagerClone, user1, val - 1))
    .then(() => userFeeForThreeDays = calculateFee(3, user1Balance, fee))
    //fee for threedays 1st day 2 fee, 2nd - 2 fee, 3rd - 1. 5 is total
    .then(() => assert.equal(userFeeForThreeDays.valueOf(), 5))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), userFeeForThreeDays));
  });

  it('should set fee when transfer to the invoice via rgassetcard', function() {
    const chip1 = 'chip1';
    const chip2 = 'chip2';
    const invoice = 'invoice';
    const user1 = accounts[1];
    //set yearly fee as 0.2% (or 0.002 * 10000) - 20
    const fee = 20;
    const timeNowInSeconds = Math.round(new Date() / 1000);
    let user1Balance;
    let userFeeForThreeDays;
    let rgAssetOwnershipCardAddres1;
    let RGACcontract1;
    let rgAssetOwnershipCardAddress2;
    let RGACcontract2;
    let rgAssetOwnershipCardAddress1;

    return rGManagerClone.deploy(chip1, oneGCoin / 2, rgOwner)
    .then(result => rgAssetOwnershipCardAddress1 = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress1))
    .then(instance => RGACcontract1 = instance)
    .then(() => rGManagerClone.transfer(user1, oneGCoin / 2, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, oneGCoin / 2, rgOwner))
    .then(result => rgAssetOwnershipCardAddress2 = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress2))
    .then(instance => RGACcontract2 = instance)
    .then(() => rGManagerClone.transfer(user1, oneGCoin / 2, {from: rgOwner}))
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => increaseTime(oneDayInSec * 3 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.balanceOf(user1))
    .then(result => user1Balance = result.valueOf())
    .then(() => RGACcontract1.transferToInvoice(invoice, {from: user1}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin / 2))
    .then(() => userFeeForThreeDays = calculateFee(3, user1Balance, fee))
    .then(() => assert.equal(userFeeForThreeDays.valueOf(), 1644))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), userFeeForThreeDays));
  });

  it('should NOT allow to make transfer to the receiver via rgassetcard if user is not able to cover fee', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    const timeNowInSeconds = Math.round(new Date() / 1000);
    //set yearly fee as 0.2% (or 0.002 * 10000) - 20
    const fee = 20;
    const val = 182504;
    let user1Balance;
    let userFeeForThreeDays;
    let rgAssetOwnershipCardAddress;
    let RGACcontract1;

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    .then(result => rgAssetOwnershipCardAddress = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress))
    .then(instance => RGACcontract1 = instance)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, val, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, val))
    .then(() => increaseTime(oneDayInSec * 3 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.balanceOf(user1))
    .then(result => user1Balance = result.valueOf())
    .then(() => RGACcontract1.transfer(user2, 182500, {from: user1}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Not possible to cover fee');
    })
    .then(() => assertBalance(rGManagerClone, user1, val))
    .then(() => userFeeForThreeDays = calculateFee(3, user1Balance, fee))
    //fee for threedays 1st day 2 fee, 2nd - 2 fee, 3rd - 1. 5 is total
    .then(() => assert.equal(userFeeForThreeDays.valueOf(), 5))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), userFeeForThreeDays));
  });

  it('should NOT allow to make transfer to the invoice via rgassetcard if user is not able to cover fee', function() {
    const chip1 = 'chip1';
    const invoice = 'invoice';
    const user1 = accounts[1];
    const timeNowInSeconds = Math.round(new Date() / 1000);
    //set yearly fee as 0.02% (or 0.002 * 10000) - 20
    const fee = 20;
    let user1Balance;
    let userFeeForThreeDays;
    let rgAssetOwnershipCardAddres1;
    let RGACcontract1;
    let rgAssetOwnershipCardAddress1;

    return rGManagerClone.deploy(chip1, oneGCoin, rgOwner)
    .then(result => rgAssetOwnershipCardAddress1 = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => RGAssetOwnershipCard.at(rgAssetOwnershipCardAddress1))
    .then(instance => RGACcontract1 = instance)
    .then(() => rGManagerClone.transfer(user1, oneGCoin, {from: rgOwner}))
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => increaseTime(oneDayInSec * 3 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.balanceOf(user1))
    .then(result => user1Balance = result.valueOf())
    .then(() => RGACcontract1.transferToInvoice(invoice, {from: user1}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Not possible to cover fee');
    })
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin))
    .then(() => userFeeForThreeDays = calculateFee(3, user1Balance, fee))
    .then(() => assert.equal(userFeeForThreeDays.valueOf(), 1644))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), userFeeForThreeDays));
  });

  it('should set fee when makes redemptionTransferToInvoice', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const timeNowInSeconds = Math.round(new Date() / 1000);
    //set yearly fee as 0.2% (or 0.002 * 10000) - 20
    const fee = 20;
    const val = 182504;
    let user1Balance;
    let userFeeForThreeDays;

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, val, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, val))
    .then(() => increaseTime(oneDayInSec * 3 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.balanceOf(user1))
    .then(result => user1Balance = result.valueOf())
    .then(() => rGManagerClone.redemptionTransferToInvoice('invoice1', 1, {from: user1}))
    .then(() => assertBalance(rGManagerClone, user1, val - 1))
    .then(() => userFeeForThreeDays = calculateFee(3, user1Balance, fee))
    //fee for threedays 1st day 2 fee, 2nd - 2 fee, 3rd - 1. 5 is total
    .then(() => assert.equal(userFeeForThreeDays.valueOf(), 5))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), userFeeForThreeDays));
  });

  it('should NOT allow to make redemptionTransferToInvoice if user is not able to cover fee', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    //set yearly fee as 0.002% (or 0.002 * 10000) - 20
    const fee = 20;
    const val = 182504;
    const timeNowInSeconds = Math.round(new Date() / 1000);
    let user1Balance;
    let userFeeForThreeDays;

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, val, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, val))
    .then(() => increaseTime(oneDayInSec * 3 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.balanceOf(user1))
    .then(result => user1Balance = result.valueOf())
    .then(() => rGManagerClone.redemptionTransferToInvoice('invoice1', 182500, {from: user1}))
    .then(result => {
      assert.equal(bytesToString(result.logs[3].args.error), 'Not possible to cover fee');
      assert.equal(result.logs[4].args.availableBalance.valueOf(), 182499);
    })
    .then(() => assertBalance(rGManagerClone, user1, val))
    .then(() => userFeeForThreeDays = calculateFee(3, user1Balance, fee))
    //fee for threedays 1st day 2 fee, 2nd - 2 fee, 3rd - 1. 5 is total
    .then(() => assert.equal(userFeeForThreeDays.valueOf(), 5))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), userFeeForThreeDays));
  });


  it('should NOT set fee if any transfers happens earlier than 1 day', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    const fee = 2;
    let user1Balance;
    const timeNow = new Date() / 1000;

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNow, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, oneGCoin, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin))
    .then(() => increaseTime(86350))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => rGManagerClone.balanceOf(user1))
    .then(result => user1Balance = result.valueOf())
    .then(() => rGManagerClone.transfer(user2, 1, {from: user1}))
    .then(() => assertBalance(rGManagerClone, user1, oneGCoin - 1))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), 0))
  });

  it('should be possible to set nonFeeAddresses', function() {
    const nonFeeAddress = accounts[2];
    return rGManagerClone.addNonFeeAddress.call(nonFeeAddress, {from: rgOwner})
    .then(assert.isTrue)
    .then(() => rGManagerClone.nonFeeAddresses(nonFeeAddress))
    .then(result => assert.equal(result, false))
    .then(() => rGManagerClone.addNonFeeAddress(nonFeeAddress, {from: rgOwner}))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'NonFeeAddressAdded');
      assert.equal(result.logs[0].args.nonFeeAddress, nonFeeAddress);
    })
    .then(() => rGManagerClone.nonFeeAddresses(nonFeeAddress))
    .then(result => assert.equal(result, true));
  });

  it('should be NOT possible to set nonFeeAddresses if it is not valid', function() {
    return rGManagerClone.addNonFeeAddress.call(0x0, {from: rgOwner})
    .then(assert.isFalse)
    .then(() => rGManagerClone.nonFeeAddresses(0x0))
    .then(result => assert.equal(result, false))
    .then(() => rGManagerClone.addNonFeeAddress(0x0, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Non fee address is not valid');
    })
    .then(() => rGManagerClone.nonFeeAddresses(0x0))
    .then(result => assert.equal(result, false));
  });

  it('should be NOT possible to set nonFeeAddresses if it has debt', function() {
    const chip1 = 'chip1';
    const nonFeeAddress = accounts[1];
    const user2 = accounts[2];
    const timeNowInSeconds = Math.round(new Date() / 1000);

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds))
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    .then(() => rGManagerClone.setYearlyFee(20, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(nonFeeAddress, oneGCoin, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, nonFeeAddress, oneGCoin))
    .then(() => increaseTime(oneDayInSec * 10 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rgTransactionRulesClone.addToWhitelist(nonFeeAddress))
    .then(() => rGManagerClone.transfer(user2, 1, {from: nonFeeAddress}))
    .then(() => assertBalance(rGManagerClone, nonFeeAddress, oneGCoin - 1))
    .then(() => rGManagerClone.addNonFeeAddress(nonFeeAddress))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Non fee address has fee debt');
    })
    .then(() => rGManagerClone.nonFeeAddresses(nonFeeAddress))
    .then(result => assert.equal(result, false));
  });

  it('should be NOT possible to set nonFeeAddresses if address already added', function() {
    const nonFeeAddress = accounts[2];
    return rGManagerClone.addNonFeeAddress.call(nonFeeAddress, {from: rgOwner})
    .then(assert.isTrue)
    .then(() => rGManagerClone.nonFeeAddresses(nonFeeAddress))
    .then(result => assert.equal(result, false))
    .then(() => rGManagerClone.addNonFeeAddress(nonFeeAddress, {from: rgOwner}))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'NonFeeAddressAdded');
      assert.equal(result.logs[0].args.nonFeeAddress, nonFeeAddress);
    })
    .then(() => rGManagerClone.nonFeeAddresses(nonFeeAddress))
    .then(result => assert.equal(result, true))
    .then(() => rGManagerClone.addNonFeeAddress(nonFeeAddress))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Non fee address already added');
    });
  });

  it('should be NOT possible to set nonFeeAddresses for not rg owner', function() {
    const nonFeeAddress = accounts[2];
    return rGManagerClone.addNonFeeAddress.call(nonFeeAddress, {from: accounts[3]})
    .then(assert.isFalse)
    .then(() => rGManagerClone.nonFeeAddresses(nonFeeAddress))
    .then(result => assert.equal(result, false))
    .then(() => rGManagerClone.addNonFeeAddress(nonFeeAddress, {from: accounts[3]}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Call allowed only for owner');
    })
    .then(() => rGManagerClone.nonFeeAddresses(nonFeeAddress))
    .then(result => assert.equal(result, false));
  });

  it('should be possible to remove address from nonFeeAddresses', function() {
    const nonFeeAddress = accounts[2];
    return rGManagerClone.addNonFeeAddress(nonFeeAddress, {from: rgOwner})
    .then(() => rGManagerClone.nonFeeAddresses(nonFeeAddress))
    .then(result => assert.equal(result, true))
    .then(() => rGManagerClone.removeNonFeeAddress.call(nonFeeAddress, {from: rgOwner}))
    .then(assert.isTrue)
    .then(() => rGManagerClone.removeNonFeeAddress(nonFeeAddress, {from: rgOwner}))
    .then(result => {
      assert.equal(result.logs.length, 2);
      assert.equal(result.logs[0].event, 'LastTimeFeeToCollectUpdated');
      assert.equal(result.logs[0].args.payer, nonFeeAddress);
      assert.equal(result.logs[1].event, 'NonFeeAddressRemoved');
      assert.equal(result.logs[1].args.nonFeeAddress, nonFeeAddress);
    })
    .then(() => rGManagerClone.nonFeeAddresses(nonFeeAddress))
    .then(result => assert.equal(result, false));
  });

  it('should NOT be possible to remove address from nonFeeAddresses if address is not in nonFee list', function() {
    const nonFeeAddress = accounts[2];
    return rGManagerClone.removeNonFeeAddress.call(nonFeeAddress, {from: rgOwner})
    .then(assert.isFalse)
    .then(() => rGManagerClone.removeNonFeeAddress(nonFeeAddress, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Is not a nonFeeAddress');
    })
  });

  it('should NOT be possible to remove feeCollector address from nonFeeAddresses via removeNonFeeAddress function', function() {
    const feeCollector = accounts[2];
    return rGManagerClone.setFeeCollectorAddress(feeCollector, {from: rgOwner})
    .then(() => rGManagerClone.feeCollector())
    .then(result => assert.equal(result, feeCollector))
    .then(() => rGManagerClone.removeNonFeeAddress.call(feeCollector, {from: rgOwner}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.removeNonFeeAddress(feeCollector, {from: rgOwner}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Not possible to remove collector');
    })
    .then(() => rGManagerClone.nonFeeAddresses(feeCollector))
    .then(result => assert.equal(result, true));
  });

  it('should NOT be possible to remove feeColldetor address from nonFeeAddresses for not rg owner', function() {
    const nonFeeAddress = accounts[2];
    return rGManagerClone.addNonFeeAddress(nonFeeAddress, {from: rgOwner})
    .then(() => rGManagerClone.nonFeeAddresses(nonFeeAddress))
    .then(result => assert.equal(result, true))
    .then(() => rGManagerClone.removeNonFeeAddress.call(nonFeeAddress, {from: accounts[3]}))
    .then(assert.isFalse)
    .then(() => rGManagerClone.removeNonFeeAddress(nonFeeAddress, {from: accounts[3]}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Call allowed only for owner');
    })
    .then(() => rGManagerClone.nonFeeAddresses(nonFeeAddress))
    .then(result => assert.equal(result, true));
  });

  it('should update lastTimeFeeToCollect and NOT set fee for user if he receives coins after defaultFeeTime', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    const user2 = accounts[2];
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    const fee = 2;
    const timeNowInSeconds = Math.round(new Date() / 1000);
    let user1Balance;

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => increaseTime(oneDayInSec * 10 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rGManagerClone.transfer(user1, oneGCoin, {from: rgOwner}))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => increaseTime(oneDayInSec * 5 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), 0))
    .then(() => rGManagerClone.transfer(user2, 1, {from: user1}))
    //fee will be set for 5 days, not for all 15 days defaultFeeTime period
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), calculateFee(5, oneGCoin, fee)));
  });

  it('should be possible to get available balance from user with tokens after 10 days', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    const fee = 2;
    const timeNowInSeconds = Math.round(new Date() / 1000);
    let user1Balance;

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => rGManagerClone.transfer(user1, oneGCoin, {from: rgOwner}))
    .then(() => rgTransactionRulesClone.addToWhitelist(user1))
    .then(() => increaseTime(oneDayInSec * 5 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), 0))

    .then(() => rGManagerClone.availableBalance(user1))
    .then(result => assert.equal(result.valueOf(), oneGCoin - calculateFee(5, oneGCoin, fee)))
    //feeToCollect will be 0, because simulation happen in availableBalance
    .then(() => rGManagerClone.feeToCollect(user1))
    .then(result => assert.equal(result.valueOf(), 0))
  });

  it('should be possible to get user balances and fee via getUserData getter', function() {
    const chip1 = 'chip1';
    const user1 = accounts[1];
    //set yearly fee as 0.02% (or 0.0002 * 10000) - 2
    const fee = 2;
    const timeNowInSeconds = Math.round(new Date() / 1000);
    let user1Balance;

    return rGManagerClone.deploy(chip1, oneGCoin * 2, rgOwner)
    //default fee time is current day starttime in seconds
    .then(() => rGManagerClone.setDefaultFeeTime(timeNowInSeconds, {from: rgOwner}))
    .then(() => rGManagerClone.setYearlyFee(fee, {from: rgOwner}))
    .then(() => rGManagerClone.getUserData.call(user1))
    .then(result => {
      assert.equal(result[0], 0);
      assert.equal(result[1], 0);
      assert.equal(result[2], 0);
    })
    .then(() => rGManagerClone.transfer(user1, oneGCoin, {from: rgOwner}))
    .then(() => rGManagerClone.getUserData.call(user1))
    .then(result => {
      assert.equal(result[0], oneGCoin);
      assert.equal(result[1], 0);
      assert.equal(result[2], oneGCoin);
    })
    .then(() => increaseTime(oneDayInSec * 5 + (timeNowInSeconds - timeNowInSecondsStart)))
    .then(() => rGManagerClone.getUserData.call(user1))
    .then(result => {
      assert.equal(result[0], oneGCoin); //balance
      assert.equal(result[1], calculateFee(5, oneGCoin, fee)); //fee
      assert.equal(result[2], oneGCoin - calculateFee(5, oneGCoin, fee)); //available balance
    })
  });

  it('should NOT allow to transfer to merchant account without rule authorization', function() {
    let rgAssetOwnershipCardAddress;
    const recipient = accounts[1];
    const senderUser = accounts[5];
    const icapRecipient = icap(asset, institution, '123456789').padEnd(32, '0');
    return rGManagerClone.deploy(chip1, 1000, senderUser)
    .then(result => rgAssetOwnershipCardAddress = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => assertBalance(rGManagerClone, senderUser, 1000))
    .then(() => assertBalance(rGManagerClone, recipient, 0))
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(recipient, rgAssetOwnershipCardAddress))
    .then(assert.isFalse)
    .then(() => rgRegistryClone.registerInstitution(asset, institution, recipient, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'InstitutionRegistered');
      assert.equal(logs[0].args.asset, asset);
      assert.equal(logs[0].args.institution, institution);
      assert.equal(logs[0].args.ethAddress, recipient);
    })
    .then(() => rGManagerClone.transferToMerchant(icapRecipient, 100, {from: senderUser}))
    .then(result => {
      var logs = result.logs
      assert.equal(bytesToString(logs[0].args.error),'Operation was not signed')
      assert.equal(bytesToString(logs[1].args.error),'Origin isnt allowed for transfer')
    })
    .then(() => assertBalance(rGManagerClone, recipient, 0))
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(recipient, rgAssetOwnershipCardAddress))
    .then(assert.isFalse);
  });

  it('should be possible to transfer to merchant if sender is not in whitelist and transaction is signed', function() {

    let rgAssetOwnershipCardAddress;

    const recipient = accounts[1];
    const senderUser = accounts[5];
    const senderBytes32 = addLeftToAddressWithPrefix(senderUser);
    const icapRecipient = icap(asset, institution, '123456789').padEnd(32, '0');
    const uintBytes = addLeftToInt(100);
    const spendData = senderUser + recipient.substr(2) + uintBytes;
    return rGManagerClone.deploy(chip1, 1000, senderUser)
    .then(result => rgAssetOwnershipCardAddress = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => assertBalance(rGManagerClone, senderUser, 1000))
    .then(() => assertBalance(rGManagerClone, recipient, 0))
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(recipient, rgAssetOwnershipCardAddress))
    .then(assert.isFalse)
    .then(() => rgRegistryClone.registerInstitution(asset, institution, recipient, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'InstitutionRegistered');
      assert.equal(logs[0].args.asset, asset);
      assert.equal(logs[0].args.institution, institution);
      assert.equal(logs[0].args.ethAddress, recipient);
    })
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(spendData, {encoding: 'hex'}), rgTransactionRulesClone.address, senderBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => rGManagerClone.transferToMerchant(icapRecipient, 100, {from: senderUser}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 3);
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(logs[0].args.from, senderUser);
      assert.equal(logs[0].args.to, recipient);
      assert.equal(logs[0].args.value, 100);
      assert.equal(logs[1].event, 'Spent');
      assert.equal(logs[1].args.from, senderUser);
      assert.equal(logs[1].args.to, recipient);
      assert.equal(logs[1].args.value, 100);
      assert.equal(logs[1].args.channel, 0);
      assert.equal(logs[1].args.comment, '');
      assert.equal(logs[2].event, 'MerchantTransfer');
      assert.equal(bytesToString(logs[2].args.icap), icapRecipient);
      assert.equal(logs[2].args.from, senderUser);
      assert.equal(logs[2].args.to, recipient);
      assert.equal(logs[2].args.value, 100);
    })
    .then(() => assertBalance(rGManagerClone, recipient, 100))
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(recipient, rgAssetOwnershipCardAddress))
    .then(assert.true);
  });

  it('should NOT allow to transfer to merchant account without rule authorization', function() {
    let rgAssetOwnershipCardAddress;
    const recipient = accounts[1];
    const senderUser = accounts[5];
    const icapRecipient = icap(asset, institution, '123456789').padEnd(32, '0');
    return rGManagerClone.deploy(chip1, 1000, senderUser)
    .then(result => rgAssetOwnershipCardAddress = result.logs[1].args.rgAssetOwnershipCardAddress)
    .then(() => assertBalance(rGManagerClone, senderUser, 1000))
    .then(() => assertBalance(rGManagerClone, recipient, 0))
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(recipient, rgAssetOwnershipCardAddress))
    .then(assert.isFalse)
    .then(() => rgRegistryClone.registerInstitution(asset, institution, recipient, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'InstitutionRegistered');
      assert.equal(logs[0].args.asset, asset);
      assert.equal(logs[0].args.institution, institution);
      assert.equal(logs[0].args.ethAddress, recipient);
    })
    .then(() => rGManagerClone.transferToMerchant(icapRecipient, 100, {from: senderUser}))
    .then(result => {
      var logs = result.logs
      assert.equal(bytesToString(logs[0].args.error),'Operation was not signed')
    })
    .then(() => assertBalance(rGManagerClone, recipient, 0))
    .then(() => rGManagerClone.hasUserRGACcoinsInAssetCard(recipient, rgAssetOwnershipCardAddress))
    .then(assert.isFalse);
  });
  ownedBase(accounts);

});
