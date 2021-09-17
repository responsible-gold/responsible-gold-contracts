"use strict";
const Reverter = require('../helpers/reverter');
const Asserts = require('../helpers/asserts');
const replaceAll = require('../helpers/replaceAll');
const RGAccount = artifacts.require('./RGAccountPrototype_v8.sol');
const RGOrganizationFactory = artifacts.require('./RGOrganizationFactory.sol');
const RGOrganization = artifacts.require('./RGOrganizationPrototype_v8.sol');
const RGManager = artifacts.require('./RGManagerPrototype_v8.sol');
const RGAssetOwnershipCardCloneFactory = artifacts.require('./RGAssetOwnershipCardCloneFactory.sol');
const RGAssetOwnershipCard = artifacts.require('./RGAssetOwnershipCardPrototype_v8.sol');
const RGTransactionRules = artifacts.require('./RGTransactionRulesPrototype_v8.sol');
const RGRuleAuthorizer = artifacts.require('./RGRuleAuthorizerPrototype_v8.sol');
const RGValidator = artifacts.require('./RGValidatorPrototype_v8.sol');
const RGUserClonePool = artifacts.require('./RGUserClonePoolTestable.sol');
const RGUser = artifacts.require('./RGUserPrototype.sol');
const RGProxy = artifacts.require('./RGProxyPrototype.sol');
const util = require('ethereumjs-util');
const deployHelperContracts = require('../helpers/deployHelperContracts');

contract('RGOrganization v8', function(accounts) {
  const reverter = new Reverter(web3);
  const asserts = Asserts(assert);
  afterEach('revert', reverter.revert);
  const rgOwner = accounts[0];
  const rgOwnerBytes32 = addLeftToAddressWithPrefix(rgOwner);
  const rgWallet = accounts[6];
  const ruleAuthorizerPK = util.toBuffer('0x15bab7cc703515242f5811cc2e6a187241eb37999bbf091a7101fb609869c248');
  const ruleAuthorizer = util.bufferToHex(util.privateToAddress(ruleAuthorizerPK));
  const placeholder = 'cafecafecafecafecafecafecafecafecafecafe';
  const placeholder2 = 'fefefefefefefefefefefefefefefefefefefefe';
  const placeholder3 = 'cacacacacacacacacacacacacacacacacacacaca';

  let rgOrganizationFactory;
  let rgAccountCloneOwned;
  let rgAccountResolver;
  let rgOrganizationResolver;

  let rGManagerClone;
  let rGAssetOwnershipCardCloneFactory;
  let rGAssetOwnershipCardClone;
  let rGAssetOwnershipCardResolver;
  let rgTransactionRulesClone;
  let rgRuleAuthorizerClone;
  let rgValidatorClone;
  let rgUserClonePool;
  let rgUserPrototype;
  let rgProxyPrototype;

  function bytesToString(bytes) {
    return web3.toAscii(bytes.split('00')[0]);
  }

  function assertBalance(erc20Contract, balanceOwner, value) {
    return erc20Contract.balanceOf(balanceOwner)
    .then(result => assert.equal(result.valueOf(), value));
  }

  function prepareSignature(signerPK, hashToSign, consumer, consumerInternalId, operationId, requiredConsumptions, authorizerAddress, nonce, msgSender) {
    const consumerPrepared = addRightToAddress(consumer);
    const consumerInternalIdPrepared = util.stripHexPrefix(consumerInternalId);
    const operationIdPrepared = addLeftToInt(operationId);
    const requiredConsumptionsPrepared = addLeftToInt(requiredConsumptions);
    const authorizerAddressPrepared = util.stripHexPrefix(authorizerAddress);
    const noncePrepared = addLeftToInt(nonce);
    const msgSenderPrepared = util.stripHexPrefix(msgSender);

    let sum = hashToSign + consumerPrepared + consumerInternalIdPrepared + operationIdPrepared + requiredConsumptionsPrepared + authorizerAddressPrepared + noncePrepared + msgSenderPrepared;
    let hash = web3.sha3(sum, {encoding: 'hex'});
    return util.ecsign(util.toBuffer(hash), signerPK);
  }

  function addLeftToIntWithPrefix(intValue) {
    return util.addHexPrefix(util.setLengthLeft(util.toBuffer(web3.toHex(intValue)), 32).toString('hex'));
  }

  function addLeftToInt(intValue) {
    return util.setLengthLeft(util.toBuffer(web3.toHex(intValue)), 32).toString('hex');
  }

  function addLeftToAddressWithPrefix(addressValue) {
    return util.addHexPrefix(util.setLengthLeft(util.toBuffer(addressValue), 32).toString('hex'));
  }

  function addRightToAddress(addressValue) {
    return util.setLengthRight(util.toBuffer(addressValue), 32).toString('hex');
  }

  before('setup others', function() {
    //setup accounts
    return deployHelperContracts(RGAccount)
    .then(contracts => {
      rgAccountResolver = contracts.resolver;
    })

    //organizations
    .then(() => deployHelperContracts(RGOrganization))
    .then(contracts => {
      rgOrganizationResolver = contracts.resolver;
    })

    //prepare RGAssetOwnershipCard
    .then(() => deployHelperContracts(RGAssetOwnershipCard))
    .then(contracts => {
      rGAssetOwnershipCardResolver = contracts.resolver;
    })
   .then(() => {
      RGAssetOwnershipCardCloneFactory._json.unlinked_binary = replaceAll(RGAssetOwnershipCardCloneFactory._json.unlinked_binary, placeholder, rGAssetOwnershipCardResolver.address.slice(-40));
      return RGAssetOwnershipCardCloneFactory.new()
   })
   .then(instance => rGAssetOwnershipCardCloneFactory = instance)
    //rule authorizer
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
    //set Rule authorizer
    .then(() => rgTransactionRulesClone.setRuleAuthorizer(rgRuleAuthorizerClone.address))

   //prepare RGManager
   .then(() => deployHelperContracts(RGManager, true))
   .then(contracts => {
    rGManagerClone = RGManager.at(contracts.clone.address);
   })
   .then(() => rGManagerClone.constructRGManager(rgOwner, 8, rGAssetOwnershipCardCloneFactory.address, rgTransactionRulesClone.address))
    //organization and account factory
    .then(() => {
      RGOrganizationFactory._json.unlinked_binary = replaceAll(RGOrganizationFactory._json.unlinked_binary, placeholder, rgAccountResolver.address.slice(-40));
      RGOrganizationFactory._json.unlinked_binary = replaceAll(RGOrganizationFactory._json.unlinked_binary, placeholder2, rgOrganizationResolver.address.slice(-40));
      RGOrganizationFactory._json.unlinked_binary = replaceAll(RGOrganizationFactory._json.unlinked_binary, placeholder3, rgRuleAuthorizerClone.address.slice(-40));
      return RGOrganizationFactory.new();
    })
    .then(instance => rgOrganizationFactory = instance)
    //validator contracts
    .then(() => deployHelperContracts(RGValidator, true))
    .then(contracts => {
      rgValidatorClone = RGValidator.at(contracts.clone.address);
    })
    //deploy rg contracts
    .then(() => RGProxy.new())
    .then(instance => rgProxyPrototype = instance)
    .then(() => RGUser.new())
    .then(instance => rgUserPrototype = instance)
    .then(() => RGUserClonePool._json.unlinked_binary = replaceAll(RGUserClonePool._json.unlinked_binary, '2231231231231231231231231231231231231232', rgProxyPrototype.address.slice(-40)))
    .then(() => RGUserClonePool._json.unlinked_binary = replaceAll(RGUserClonePool._json.unlinked_binary, '1231231231231231231231231231231231231231', rgUserPrototype.address.slice(-40)))
    .then(() => RGUserClonePool.new())
    .then(instance => rgUserClonePool = instance)
    .then(reverter.snapshot);
  });

  it('should set organization 1st user after organization creation', function() {
    let organizationAddress;
    let organization;

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => organization.companyUsers(rgOwner))
    .then(assert.isTrue);
  });


  it('should set organization 1st user after organization creation', function() {
    let organizationAddress;
    let organization;

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => organization.companyUsers(rgOwner))
    .then(assert.isTrue);
  });

  it('should set rganization factory after organization creation', function() {
    let organizationAddress;
    let organization;

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => organization.organizationFactory())
    .then(result => assert.equal(result, rgOrganizationFactory.address));
  });

  it('should be possible to set new organization factory', function() {
    let organizationAddress;
    let organization;
    let data;

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.updateOrganizationFactory.getData(accounts[2]))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.updateOrganizationFactory.call(accounts[2], {from: rgOwner}))
    .then(assert.isTrue)
    .then(() => organization.updateOrganizationFactory(accounts[2]), {from: rgOwner})
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'OrganizationFactoryChanged');
      assert.equal(result.logs[0].args.newFactory, accounts[2]);
    })
    .then(() => organization.organizationFactory())
    .then(result => assert.equal(result, accounts[2]));
  });

  it('should NOT be possible to set new organization factory for NOT admin', function() {
    let organizationAddress;
    let organization;
    const notOwner = accounts[3];

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => organization.updateOrganizationFactory.call(accounts[2], {from: notOwner}))
    .then(assert.isFalse)
    .then(() => organization.updateOrganizationFactory(accounts[2], {from: notOwner}))
    .then(() => organization.organizationFactory())
    .then(result => assert.equal(result, rgOrganizationFactory.address));
  });

  it('should be possible to create new organization account', function() {
    let organizationAddress;
    let organization;
    let organizationAccount;
    let data;

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount.call())
    .then(assert.isTrue)
    .then(() => organization.createAccount())
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'AccountCreated');
      organizationAccount = result.logs[0].args.account;
    })
    .then(() => organization.companyAccounts(organizationAccount))
    .then(assert.isTrue);
  });

  it('should NOT be possible to create new account on organization for NOT admin', function() {
    let organizationAddress;
    let organization;

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => organization.createAccount.call({from: accounts[2]}))
    .then(assert.isFalse)
    .then(() => organization.createAccount({from: accounts[2]}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Caller is not a company user');
    })
  });

  it('should NOT be possible to transfer to account if sender is not a organization user', function() {
    let organizationAddress;
    let organization;
    let data;
    let spendData;
    const acc1 = accounts[1];
    const acc2 = accounts[2];

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => spendData = rGManagerClone.contract.spend.getData(acc2, 400, 5, 'test comment'))
    .then(() => data = organization.contract.forward.getData(acc1, rGManagerClone.address, 0, spendData, false))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.forward.call(acc1, rGManagerClone.address, 0, spendData, false, {from: accounts[3]}))
    .then(assert.isFalse)
    .then(() => organization.forward(acc1, rGManagerClone.address, 0, spendData, false, {from: accounts[3]}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Caller is not a company user');
    })
  });

  it('should NOT be possible to transfer account if sender is not a organization account', function() {
    let organizationAddress;
    let organization;
    let data;
    let spendData;
    const acc1 = accounts[1];
    const acc2 = accounts[2];

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => spendData = rGManagerClone.contract.spend.getData(acc2, 400, 5, 'test comment'))
    .then(() => data = organization.contract.forward.getData(acc1, rGManagerClone.address, 0, spendData, false))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.forward(acc1, rGManagerClone.address, 0, spendData, false))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Address from is not an account');
    })
  });

  it('should NOT be possible to transfer to account if it failed on spend step', function() {
    let organizationAddress;
    let organization;
    let data;
    let acc1;
    let account1;
    let acc2;
    let spendData;

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc1 = result.logs[0].args.account;
    })
    .then(() => RGAccount.at(acc1))
    .then(instance => account1 = instance)
    .then(() => account1.contractOwner())
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc2 = result.logs[0].args.account;
    })
    .then(() => spendData = rGManagerClone.contract.spend.getData(acc2, 10, 5, 'test comment'))
    .then(() => data = organization.contract.forward.getData(acc1, rGManagerClone.address, 0, spendData, false))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.forward.call(acc1, rGManagerClone.address, 0, spendData, false))
    .then(assert.isFalse)
    .then(() => organization.forward(acc1, rGManagerClone.address, 0, spendData, false))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Not enough balance for transfer');
    })
  });

  it('should NOT be possible to transfer to account if transaction is not signed', function() {
    let organizationAddress;
    let organization;
    let acc1;
    let account1;
    let acc2;
    let data;
    let spendData;
    const chip1 = 'chip1';

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc1 = result.logs[0].args.account;
    })
    .then(() => RGAccount.at(acc1))
    .then(instance => account1 = instance)
    .then(() => rGManagerClone.deploy(chip1, 1000, rgOwner))
    .then(() => rGManagerClone.transfer(acc1, 400, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, acc1, 400))
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc2 = result.logs[0].args.account;
    })
    .then(() => spendData = rGManagerClone.contract.spend.getData(acc2, 10, 5, 'test comment'))
    .then(() => organization.forward.call(acc1, rGManagerClone.address, 0, spendData, false))
    .then(assert.isFalse)
    .then(() => organization.forward(acc1, rGManagerClone.address, 0, spendData, false))
    .then(result => {
      assert.equal(bytesToString(result.logs[1].args.error), 'Tx is not signed');
    })
    .then(() => assertBalance(rGManagerClone, acc1, 400))
    .then(() => assertBalance(rGManagerClone, acc2, 0))
  });

  it('should NOT be possible to transfer to account if passed not all required consumptions', function() {
    let organizationAddress;
    let organization;
    let acc1;
    let account1;
    let acc2;
    let data;
    let spendData;
    const chip1 = 'chip1';

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc1 = result.logs[0].args.account;
    })
    .then(() => RGAccount.at(acc1))
    .then(instance => account1 = instance)
    .then(() => rGManagerClone.deploy(chip1, 1000, rgOwner))
    .then(() => rGManagerClone.transfer(acc1, 400, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, acc1, 400))
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc2 = result.logs[0].args.account;
    })

    .then(() => spendData = rGManagerClone.contract.spend.getData(acc2, 10, 5, 'test comment'))
    .then(() => data = organization.contract.forward.getData(acc1, rGManagerClone.address, 0, spendData, false))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 2, {from: ruleAuthorizer}))
    .then(() => organization.forward.call(acc1, rGManagerClone.address, 0, spendData, false))
    .then(assert.isFalse)
    .then(() => organization.forward(acc1, rGManagerClone.address, 0, spendData, false))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Not all signatures collected');
    })
    .then(() => assertBalance(rGManagerClone, acc1, 400))
    .then(() => assertBalance(rGManagerClone, acc2, 0))
  });

  it('should be possible to transfer to organization account', function() {
    let organizationAddress;
    let organization;
    let acc1;
    let account1;
    let acc2;
    let data;
    let spendData;
    const chip1 = 'chip1';

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc1 = result.logs[0].args.account;
    })
    .then(() => RGAccount.at(acc1))
    .then(instance => account1 = instance)
    .then(() => rGManagerClone.deploy(chip1, 1000, rgOwner))
    .then(() => rGManagerClone.transfer(acc1, 400, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, acc1, 400))
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc2 = result.logs[0].args.account;
    })

    .then(() => spendData = rGManagerClone.contract.spend.getData(acc2, 10, 5, 'test comment'))
    .then(() => data = organization.contract.forward.getData(acc1, rGManagerClone.address, 0, spendData, false))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.forward.call(acc1, rGManagerClone.address, 0, spendData, false))
    .then(assert.isTrue)
    .then(() => organization.forward(acc1, rGManagerClone.address, 0, spendData, false))
    .then(() => assertBalance(rGManagerClone, acc1, 390))
    .then(() => assertBalance(rGManagerClone, acc2, 10))
  });

  it('should be possible to add user to the organization', function() {
    let organizationAddress;
    let organization;
    let data;
    const user = accounts[2];

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.addUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser.call(user))
    .then(assert.isTrue)
    .then(() => organization.addUser(user))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'UserAdded');
      assert.equal(result.logs[0].args.userAdded, user);
    })
    .then(() => organization.companyUsers(user))
    .then(assert.isTrue);
  });

  it('should NOT be possible to add user to the organization for not admin user', function() {
    let organizationAddress;
    let organization;
    const user = accounts[2];

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => organization.addUser.call(user, {from: accounts[4]}))
    .then(assert.isFalse)
    .then(() => organization.addUser(user, {from: accounts[4]}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Caller is not a company user');
    })
    .then(() => organization.companyUsers(user))
    .then(assert.isFalse);
  });

  it('should NOT be possible to add user to the organization if address is not valid', function() {
    let organizationAddress;
    let organization;
    let data;

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.addUser.getData('0x0000000000000000000000000000000000000000'))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser.call('0x0000000000000000000000000000000000000000'))
    .then(assert.isFalse)
    .then(() => organization.addUser('0x0000000000000000000000000000000000000000'))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Address is not valid');
    });
  });

  it('should NOT be possible to add user to the organization if it is already a user', function() {
    let organizationAddress;
    let organization;
    let data;
    const user = accounts[2];

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.addUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(user))
    .then(() => data = organization.contract.addUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser.call(user))
    .then(assert.isFalse)
    .then(() => organization.addUser(user))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Already organization user');
    });
  });

  it('should be possible to remove user from the organization', function() {
    let organizationAddress;
    let organization;
    let data;
    const user = accounts[2];

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.addUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(user))
    .then(() => data = organization.contract.removeUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.removeUser.call(user))
    .then(assert.isTrue)
    .then(() => organization.removeUser(user))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'UserRemoved');
      assert.equal(result.logs[0].args.userRemoved, user);
    })
    .then(() => organization.companyUsers(user))
    .then(assert.isFalse);
  });

  it('should NOT be possible to remove user from the organization for not organization user', function() {
    let organizationAddress;
    let organization;
    let data;
    const user = accounts[2];
    const userBytes32 = addLeftToAddressWithPrefix(user);

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.addUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(user))
    .then(() => data = organization.contract.removeUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, userBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.removeUser.call(user, {from: accounts[4]}))
    .then(assert.isFalse)
    .then(() => organization.removeUser(user, {from: accounts[4]}))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Caller is not a company user');
    })
    .then(() => organization.companyUsers(user))
    .then(assert.isTrue);
  });

  it('should NOT be possible to remove user from the organization if it is not user address', function() {
    let organizationAddress;
    let organization;
    let data;
    const user = accounts[2];

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.addUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(user))
    .then(() => data = organization.contract.removeUser.getData(accounts[3]))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.removeUser.call(accounts[3]))
    .then(assert.isFalse)
    .then(() => organization.removeUser(accounts[3]))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Is not an organization user');
    })
    .then(() => organization.companyUsers(user))
    .then(assert.isTrue);
  });

  it('should be possible to deactivate user', function() {
    let organizationAddress;
    let organization;
    let data;
    const user = accounts[2];

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.addUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(user))
    .then(() => data = organization.contract.deactivateUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.deactivateUser.call(user))
    .then(assert.isTrue)
    .then(() => organization.deactivateUser(user))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'UserDeactivated');
      assert.equal(result.logs[0].args.user, user);
    })
    .then(() => organization.companyUsers(user))
    .then(assert.isFalse)
    .then(() => organization.deactivatedUsers(user))
    .then(assert.isTrue);
  });

  it('should NOT be possible to deactivate user if address is not an organization user', function() {
    let organizationAddress;
    let organization;
    let data;
    const user = accounts[2];

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.addUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(user))
    .then(() => data = organization.contract.deactivateUser.getData(accounts[3]))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.deactivateUser.call(accounts[3]))
    .then(assert.isFalse)
    .then(() => organization.deactivateUser(accounts[3]))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Is not an organization user');
    })
    .then(() => organization.companyUsers(user))
    .then(assert.isTrue)
    .then(() => organization.deactivatedUsers(user))
    .then(assert.isFalse);
  });

  it('should NOT be possible to deactivate user if user already deactivated', function() {
    let organizationAddress;
    let organization;
    let data;
    const user = accounts[2];

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.addUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(user))
    .then(() => data = organization.contract.deactivateUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.deactivateUser(user))
    .then(() => data = organization.contract.deactivateUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.deactivateUser.call(user))
    .then(assert.isFalse)
    .then(() => organization.deactivateUser(user))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Is not an organization user');
    });
  });

  it('should be possible to activate deactivated user', function() {
    let organizationAddress;
    let organization;
    let data;
    const user = accounts[2];

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.addUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(user))
    .then(() => data = organization.contract.deactivateUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.deactivateUser(user))
    .then(() => data = organization.contract.activateUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.activateUser.call(user))
    .then(assert.isTrue)
    .then(() => organization.activateUser(user))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'UserActivated');
      assert.equal(result.logs[0].args.user, user);
    })
    .then(() => organization.companyUsers(user))
    .then(assert.isTrue)
    .then(() => organization.deactivatedUsers(user))
    .then(assert.isFalse);
  });

  it('should NOT be possible to activate not deactivated organization user', function() {
    let organizationAddress;
    let organization;
    let data;
    const user = accounts[2];

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.addUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(user))
    .then(() => data = organization.contract.activateUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.activateUser.call(user))
    .then(assert.isFalse)
    .then(() => organization.activateUser(user))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Address activated or not user');
    })
    .then(() => organization.companyUsers(user))
    .then(assert.isTrue)
    .then(() => organization.deactivatedUsers(user))
    .then(assert.isFalse);
  });

  it('should be possible to remove deactivated user', function() {
    let organizationAddress;
    let organization;
    let data;
    const user = accounts[2];

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.addUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(user))
    .then(() => data = organization.contract.deactivateUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.deactivateUser(user))
    .then(() => data = organization.contract.removeDeactivatedUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.removeDeactivatedUser.call(user))
    .then(assert.isTrue)
    .then(() => organization.removeDeactivatedUser(user))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'UserRemoved');
      assert.equal(result.logs[0].args.userRemoved, user);
    })
    .then(() => organization.companyUsers(user))
    .then(assert.isFalse)
    .then(() => organization.deactivatedUsers(user))
    .then(assert.isFalse);
  });

  it('should NOT be possible to remove user via removeDeactivatedUser if he is not deactivated', function() {
    let organizationAddress;
    let organization;
    let data;
    const user = accounts[2];

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.addUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(user))
    .then(() => data = organization.contract.removeDeactivatedUser.getData(user))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.removeDeactivatedUser.call(user))
    .then(assert.isFalse)
    .then(() => organization.removeDeactivatedUser(user))
    .then(result => {
      assert.equal(bytesToString(result.logs[0].args.error), 'Address activated or not user');
    })
    .then(() => organization.companyUsers(user))
    .then(assert.isTrue)
    .then(() => organization.deactivatedUsers(user))
    .then(assert.isFalse);
  });

  it('should be possible to transfer tokens with 1 cosigner via validator contract', function() {
    let organizationAddress;
    let organization;
    let acc1;
    let account1;
    let acc2;
    let data;
    let spendData;
    let forwardData;
    let hashedForwardData;
    let confirmData;
    let confirmData2;
    let userForwardData;
    let authorizerSig;
    let authorizerSig2;
    let rgProxyAddress;
    let rgUserAddress;
    let rgUser;
    let hashedSpendData;
    const chip1 = 'chip1';
    const operationId = 1;
    const tokensToTransfer = 10;
    const requiredConsumptions = 1;
    const nonce = 1;
    const nonce2 = 2;
    const uintBytes = addLeftToInt(tokensToTransfer);

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc1 = result.logs[0].args.account;
    })
    .then(() => RGAccount.at(acc1))
    .then(instance => account1 = instance)
    .then(() => rGManagerClone.deploy(chip1, 1000, rgOwner))
    .then(() => rGManagerClone.transfer(acc1, 400, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, acc1, 400))
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc2 = result.logs[0].args.account;
    })

    .then(() => rgUserClonePool.deploy())
    .then(result => {
      rgProxyAddress = result.logs[0].args.rgProxyAddress;
      rgUserAddress = result.logs[0].args.contractAddress;
    })
    .then(() => RGUser.at(rgUserAddress))
    .then(instance => rgUser = instance)
    .then(() => rgUserClonePool.assignTo(rgUser.address, rgValidatorClone.address, false))
    .then(() => data = organization.contract.addUser.getData(rgProxyAddress))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(rgProxyAddress))

    .then(() => spendData = rGManagerClone.contract.spend.getData(acc2, tokensToTransfer, 5, 'test comment'))
    .then(() => forwardData = organization.contract.forward.getData(acc1, rGManagerClone.address, 0, spendData, false))
    .then(() => hashedForwardData = web3.sha3(forwardData, {encoding: 'hex'}))
    .then(() => authorizerSig = prepareSignature(ruleAuthorizerPK, hashedForwardData, organization.address, rgProxyAddress, operationId, requiredConsumptions, rgRuleAuthorizerClone.address, nonce, rgValidatorClone.address))
    .then(() => confirmData = rgRuleAuthorizerClone.contract.confirm.getData(hashedForwardData, organization.address, addLeftToAddressWithPrefix(rgProxyAddress), operationId, requiredConsumptions, nonce, authorizerSig.v, util.bufferToHex(authorizerSig.r), util.bufferToHex(authorizerSig.s)))
    .then(() => userForwardData = rgUser.contract.forward.getData(organization.address, 0, forwardData))


    .then(() => rgTransactionRulesClone.removeFromWhitelist(rgOwner))
    .then(() => hashedSpendData = web3.sha3(acc1 + util.stripHexPrefix(acc2) + uintBytes, {encoding: 'hex'}))
    .then(() => authorizerSig2 = prepareSignature(ruleAuthorizerPK, hashedSpendData, rgTransactionRulesClone.address, acc1, operationId, requiredConsumptions, rgRuleAuthorizerClone.address, nonce2, rgValidatorClone.address))
    .then(() => confirmData2 = rgRuleAuthorizerClone.contract.confirm.getData(hashedSpendData, rgTransactionRulesClone.address, addLeftToAddressWithPrefix(acc1), operationId, requiredConsumptions, nonce2, authorizerSig2.v, util.bufferToHex(authorizerSig2.r), util.bufferToHex(authorizerSig2.s)))
    
    .then(() => rgValidatorClone.forwardCalls([rgRuleAuthorizerClone.address, rgRuleAuthorizerClone.address, rgUser.address, '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0'], confirmData, confirmData2,  userForwardData, '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1'))

    .then(() => assertBalance(rGManagerClone, acc1, 390))
    .then(() => assertBalance(rGManagerClone, acc2, tokensToTransfer))
  })

  it('should be possible to transfer tokens with 3 cosigners via validator contract', function() {
    let organizationAddress;
    let organization;
    let acc1;
    let account1;
    let acc2;
    let data;
    let spendData;
    let forwardData;
    let hashedForwardData;
    let confirmData;
    let confirmData2;
    let confirmData3;
    let confirmDataManager;
    let userForwardData;
    let authorizerSig;
    let authorizerSig2;
    let authorizerSig3;
    let authorizerSig4;
    let rgProxyAddress;
    let rgUserAddress;
    let rgUser;
    let rgProxyAddress2;
    let rgUserAddress2;
    let rgUser2;
    let rgProxyAddress3;
    let rgUserAddress3;
    let rgUser3;
    let hashedSpendData;
    let userForwardData3;
    let userForwardData2;
    const chip1 = 'chip1';
    const operationId = 1;
    const requiredConsumptions = 1;
    const requiredConsumptions3 = 3;
    const nonce = 1;
    const nonce2 = 2;
    const nonce3 = 3;
    const tokensToTransfer = 10;
    const uintBytes = addLeftToInt(tokensToTransfer);

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc1 = result.logs[0].args.account;
    })
    .then(() => RGAccount.at(acc1))
    .then(instance => account1 = instance)
    .then(() => rGManagerClone.deploy(chip1, 1000, rgOwner))
    .then(() => rGManagerClone.transfer(acc1, 400, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, acc1, 400))
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc2 = result.logs[0].args.account;
    })

    .then(() => rgUserClonePool.deploy())
    .then(result => {
      rgProxyAddress = result.logs[0].args.rgProxyAddress;
      rgUserAddress = result.logs[0].args.contractAddress;
    })
    .then(() => RGUser.at(rgUserAddress))
    .then(instance => rgUser = instance)
    .then(() => rgUserClonePool.assignTo(rgUser.address, rgValidatorClone.address, false))
    .then(() => data = organization.contract.addUser.getData(rgProxyAddress))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(rgProxyAddress))

    .then(() => rgUserClonePool.deploy())
    .then(result => {
      rgProxyAddress2 = result.logs[0].args.rgProxyAddress;
      rgUserAddress2 = result.logs[0].args.contractAddress;
    })
    .then(() => RGUser.at(rgUserAddress2))
    .then(instance => rgUser2 = instance)
    .then(() => rgUserClonePool.assignTo(rgUser2.address, rgValidatorClone.address, false))
    .then(() => data = organization.contract.addUser.getData(rgProxyAddress2))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(rgProxyAddress2))

    .then(() => rgUserClonePool.deploy())
    .then(result => {
      rgProxyAddress3 = result.logs[0].args.rgProxyAddress;
      rgUserAddress3 = result.logs[0].args.contractAddress;
    })
    .then(() => RGUser.at(rgUserAddress3))
    .then(instance => rgUser3 = instance)
    .then(() => rgUserClonePool.assignTo(rgUser3.address, rgValidatorClone.address, false))
    .then(() => data = organization.contract.addUser.getData(rgProxyAddress3))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(rgProxyAddress3))

    .then(() => spendData = rGManagerClone.contract.spend.getData(acc2, tokensToTransfer, 5, 'test comment'))
    .then(() => forwardData = organization.contract.forward.getData(acc1, rGManagerClone.address, 0, spendData, false))
    .then(() => hashedForwardData = web3.sha3(forwardData, {encoding: 'hex'}))
    .then(() => authorizerSig = prepareSignature(ruleAuthorizerPK, hashedForwardData, organization.address, rgProxyAddress, operationId, requiredConsumptions3, rgRuleAuthorizerClone.address, nonce, rgValidatorClone.address))
    .then(() => confirmData = rgRuleAuthorizerClone.contract.confirm.getData(hashedForwardData, organization.address, addLeftToAddressWithPrefix(rgProxyAddress), operationId, requiredConsumptions3, nonce, authorizerSig.v, util.bufferToHex(authorizerSig.r), util.bufferToHex(authorizerSig.s)))
    .then(() => userForwardData = rgUser.contract.forward.getData(organization.address, 0, forwardData))

    .then(() => authorizerSig2 = prepareSignature(ruleAuthorizerPK, hashedForwardData, organization.address, rgProxyAddress2, operationId, requiredConsumptions3, rgRuleAuthorizerClone.address, nonce2, rgValidatorClone.address))
    .then(() => confirmData2 = rgRuleAuthorizerClone.contract.confirm.getData(hashedForwardData, organization.address, addLeftToAddressWithPrefix(rgProxyAddress2), operationId, requiredConsumptions3, nonce2, authorizerSig2.v, util.bufferToHex(authorizerSig2.r), util.bufferToHex(authorizerSig2.s)))
    .then(() => userForwardData2 = rgUser2.contract.forward.getData(organization.address, 0, forwardData))

    .then(() => authorizerSig3 = prepareSignature(ruleAuthorizerPK, hashedForwardData, organization.address, rgProxyAddress3, operationId, requiredConsumptions3, rgRuleAuthorizerClone.address, nonce3, rgValidatorClone.address))
    .then(() => confirmData3 = rgRuleAuthorizerClone.contract.confirm.getData(hashedForwardData, organization.address, addLeftToAddressWithPrefix(rgProxyAddress3), operationId, requiredConsumptions3, nonce3, authorizerSig3.v, util.bufferToHex(authorizerSig3.r), util.bufferToHex(authorizerSig3.s)))
    .then(() => userForwardData3 = rgUser3.contract.forward.getData(organization.address, 0, forwardData))


    .then(() => rgTransactionRulesClone.removeFromWhitelist(rgOwner))
    .then(() => hashedSpendData = web3.sha3(acc1 + util.stripHexPrefix(acc2) + uintBytes, {encoding: 'hex'}))
    .then(() => authorizerSig4 = prepareSignature(ruleAuthorizerPK, hashedSpendData, rgTransactionRulesClone.address, acc1, operationId, requiredConsumptions, rgRuleAuthorizerClone.address, nonce, rgValidatorClone.address))
    .then(() => confirmDataManager = rgRuleAuthorizerClone.contract.confirm.getData(hashedSpendData, rgTransactionRulesClone.address, addLeftToAddressWithPrefix(acc1), operationId, requiredConsumptions, nonce, authorizerSig4.v, util.bufferToHex(authorizerSig4.r), util.bufferToHex(authorizerSig4.s)))
    
    .then(() => rgValidatorClone.forwardCalls([rgRuleAuthorizerClone.address, rgRuleAuthorizerClone.address, rgRuleAuthorizerClone.address, rgRuleAuthorizerClone.address, rgUser.address, rgUser2.address, rgUser3.address, '0x0', '0x0', '0x0', '0x0'], confirmData, confirmData2, confirmData3, confirmDataManager,  userForwardData, userForwardData2, userForwardData3, '0x1', '0x1', '0x1', '0x1'))

    .then(() => assertBalance(rGManagerClone, acc1, 390))
    .then(() => assertBalance(rGManagerClone, acc2, tokensToTransfer))
  })

  it('should NOT be possible to transfer tokens with 3 cosigners via validator contract if not all cosigners sign the TX', function() {
    let organizationAddress;
    let organization;
    let acc1;
    let account1;
    let acc2;
    let data;
    let spendData;
    let forwardData;
    let hashedForwardData;
    let confirmData;
    let confirmData2;
    let confirmData3;
    let confirmDataManager;
    let userForwardData;
    let authorizerSig;
    let authorizerSig2;
    let authorizerSig3;
    let authorizerSig4;
    let rgProxyAddress;
    let rgUserAddress;
    let rgUser;
    let rgProxyAddress2;
    let rgUserAddress2;
    let rgUser2;
    let rgProxyAddress3;
    let rgUserAddress3;
    let rgUser3;
    let hashedSpendData;
    let userForwardData2;
    const chip1 = 'chip1';
    const operationId = 1;
    const requiredConsumptions = 1;
    const requiredConsumptions3 = 3;
    const nonce = 1;
    const nonce2 = 2;
    const nonce3 = 3;
    const tokensToTransfer = 10;
    const uintBytes = addLeftToInt(tokensToTransfer);

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc1 = result.logs[0].args.account;
    })
    .then(() => RGAccount.at(acc1))
    .then(instance => account1 = instance)
    .then(() => rGManagerClone.deploy(chip1, 1000, rgOwner))
    .then(() => rGManagerClone.transfer(acc1, 400, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, acc1, 400))
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc2 = result.logs[0].args.account;
    })

    .then(() => rgUserClonePool.deploy())
    .then(result => {
      rgProxyAddress = result.logs[0].args.rgProxyAddress;
      rgUserAddress = result.logs[0].args.contractAddress;
    })
    .then(() => RGUser.at(rgUserAddress))
    .then(instance => rgUser = instance)
    .then(() => rgUserClonePool.assignTo(rgUser.address, rgValidatorClone.address, false))
    .then(() => data = organization.contract.addUser.getData(rgProxyAddress))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(rgProxyAddress))

    .then(() => rgUserClonePool.deploy())
    .then(result => {
      rgProxyAddress2 = result.logs[0].args.rgProxyAddress;
      rgUserAddress2 = result.logs[0].args.contractAddress;
    })
    .then(() => RGUser.at(rgUserAddress2))
    .then(instance => rgUser2 = instance)
    .then(() => rgUserClonePool.assignTo(rgUser2.address, rgValidatorClone.address, false))
    .then(() => data = organization.contract.addUser.getData(rgProxyAddress2))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(rgProxyAddress2))

    .then(() => rgUserClonePool.deploy())
    .then(result => {
      rgProxyAddress3 = result.logs[0].args.rgProxyAddress;
      rgUserAddress3 = result.logs[0].args.contractAddress;
    })
    .then(() => RGUser.at(rgUserAddress3))
    .then(instance => rgUser3 = instance)
    .then(() => rgUserClonePool.assignTo(rgUser3.address, rgValidatorClone.address, false))
    .then(() => data = organization.contract.addUser.getData(rgProxyAddress3))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(rgProxyAddress3))

    .then(() => spendData = rGManagerClone.contract.spend.getData(acc2, tokensToTransfer, 5, 'test comment'))
    .then(() => forwardData = organization.contract.forward.getData(acc1, rGManagerClone.address, 0, spendData, false))
    .then(() => hashedForwardData = web3.sha3(forwardData, {encoding: 'hex'}))
    .then(() => authorizerSig = prepareSignature(ruleAuthorizerPK, hashedForwardData, organization.address, rgProxyAddress, operationId, requiredConsumptions3, rgRuleAuthorizerClone.address, nonce, rgValidatorClone.address))
    .then(() => confirmData = rgRuleAuthorizerClone.contract.confirm.getData(hashedForwardData, organization.address, addLeftToAddressWithPrefix(rgProxyAddress), operationId, requiredConsumptions3, nonce, authorizerSig.v, util.bufferToHex(authorizerSig.r), util.bufferToHex(authorizerSig.s)))
    .then(() => userForwardData = rgUser.contract.forward.getData(organization.address, 0, forwardData))

    .then(() => authorizerSig2 = prepareSignature(ruleAuthorizerPK, hashedForwardData, organization.address, rgProxyAddress2, operationId, requiredConsumptions3, rgRuleAuthorizerClone.address, nonce2, rgValidatorClone.address))
    .then(() => confirmData2 = rgRuleAuthorizerClone.contract.confirm.getData(hashedForwardData, organization.address, addLeftToAddressWithPrefix(rgProxyAddress2), operationId, requiredConsumptions3, nonce2, authorizerSig2.v, util.bufferToHex(authorizerSig2.r), util.bufferToHex(authorizerSig2.s)))
    .then(() => userForwardData2 = rgUser2.contract.forward.getData(organization.address, 0, forwardData))

    .then(() => authorizerSig3 = prepareSignature(ruleAuthorizerPK, hashedForwardData, organization.address, rgProxyAddress3, operationId, requiredConsumptions3, rgRuleAuthorizerClone.address, nonce3, rgValidatorClone.address))
    .then(() => confirmData3 = rgRuleAuthorizerClone.contract.confirm.getData(hashedForwardData, organization.address, addLeftToAddressWithPrefix(rgProxyAddress3), operationId, requiredConsumptions3, nonce3, authorizerSig3.v, util.bufferToHex(authorizerSig3.r), util.bufferToHex(authorizerSig3.s)))
    //user3 doesn't sign the transaction

    .then(() => rgTransactionRulesClone.removeFromWhitelist(rgOwner))
    .then(() => hashedSpendData = web3.sha3(acc1 + util.stripHexPrefix(acc2) + uintBytes, {encoding: 'hex'}))
    .then(() => authorizerSig4 = prepareSignature(ruleAuthorizerPK, hashedSpendData, rgTransactionRulesClone.address, acc1, operationId, requiredConsumptions, rgRuleAuthorizerClone.address, nonce, rgValidatorClone.address))
    .then(() => confirmDataManager = rgRuleAuthorizerClone.contract.confirm.getData(hashedSpendData, rgTransactionRulesClone.address, addLeftToAddressWithPrefix(acc1), operationId, requiredConsumptions, nonce, authorizerSig4.v, util.bufferToHex(authorizerSig4.r), util.bufferToHex(authorizerSig4.s)))
    
    .then(() => rgValidatorClone.forwardCalls([rgRuleAuthorizerClone.address, rgRuleAuthorizerClone.address, rgRuleAuthorizerClone.address, rgRuleAuthorizerClone.address, rgUser.address, rgUser2.address, '0x0', '0x0', '0x0', '0x0', '0x0'], confirmData, confirmData2, confirmData3, confirmDataManager,  userForwardData, userForwardData2, '0x1', '0x1', '0x1', '0x1', '0x1'))
    .then(result => {
      assert.equal(result.logs.length, 3);
      assert.equal(result.logs[1].event, 'Error');
      assert.equal(bytesToString(result.logs[1].args.error), 'Not all signatures collected');
    })
    .then(() => assertBalance(rGManagerClone, acc1, 400))
    .then(() => assertBalance(rGManagerClone, acc2, 0))
  });

  it('should NOT be possible to transfer tokens with 3 cosigners via validator contract if rgManager did not confirm the transaction', function() {
    let organizationAddress;
    let organization;
    let acc1;
    let account1;
    let acc2;
    let data;
    let spendData;
    let forwardData;
    let hashedForwardData;
    let confirmData;
    let confirmData2;
    let confirmData3;
    let confirmDataManager;
    let userForwardData;
    let authorizerSig;
    let authorizerSig2;
    let authorizerSig3;
    let authorizerSig4;
    let rgProxyAddress;
    let rgUserAddress;
    let rgUser;
    let rgProxyAddress2;
    let rgUserAddress2;
    let rgUser2;
    let rgProxyAddress3;
    let rgUserAddress3;
    let rgUser3;
    let userForwardData2;
    let userForwardData3;
    const chip1 = 'chip1';
    const operationId = 1;
    const requiredConsumptions = 1;
    const requiredConsumptions3 = 3;
    const nonce = 1;
    const nonce2 = 2;
    const nonce3 = 3;
    const tokensToTransfer = 10;
    const uintBytes = addLeftToInt(tokensToTransfer);

    return rgOrganizationFactory.deployOrganization(rgOwner)
    .then(result => {
      organizationAddress = result.logs[0].args.organization;
    })
    .then(() => RGOrganization.at(organizationAddress))
    .then(instance => organization = instance)
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc1 = result.logs[0].args.account;
    })
    .then(() => RGAccount.at(acc1))
    .then(instance => account1 = instance)
    .then(() => rGManagerClone.deploy(chip1, 1000, rgOwner))
    .then(() => rGManagerClone.transfer(acc1, 400, {from: rgOwner}))
    .then(() => assertBalance(rGManagerClone, acc1, 400))
    .then(() => data = organization.contract.createAccount.getData())
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.createAccount())
    .then(result => {
      acc2 = result.logs[0].args.account;
    })

    .then(() => rgUserClonePool.deploy())
    .then(result => {
      rgProxyAddress = result.logs[0].args.rgProxyAddress;
      rgUserAddress = result.logs[0].args.contractAddress;
    })
    .then(() => RGUser.at(rgUserAddress))
    .then(instance => rgUser = instance)
    .then(() => rgUserClonePool.assignTo(rgUser.address, rgValidatorClone.address, false))
    .then(() => data = organization.contract.addUser.getData(rgProxyAddress))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(rgProxyAddress))

    .then(() => rgUserClonePool.deploy())
    .then(result => {
      rgProxyAddress2 = result.logs[0].args.rgProxyAddress;
      rgUserAddress2 = result.logs[0].args.contractAddress;
    })
    .then(() => RGUser.at(rgUserAddress2))
    .then(instance => rgUser2 = instance)
    .then(() => rgUserClonePool.assignTo(rgUser2.address, rgValidatorClone.address, false))
    .then(() => data = organization.contract.addUser.getData(rgProxyAddress2))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(rgProxyAddress2))

    .then(() => rgUserClonePool.deploy())
    .then(result => {
      rgProxyAddress3 = result.logs[0].args.rgProxyAddress;
      rgUserAddress3 = result.logs[0].args.contractAddress;
    })
    .then(() => RGUser.at(rgUserAddress3))
    .then(instance => rgUser3 = instance)
    .then(() => rgUserClonePool.assignTo(rgUser3.address, rgValidatorClone.address, false))
    .then(() => data = organization.contract.addUser.getData(rgProxyAddress3))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(web3.sha3(data, {encoding: 'hex'}), organization.address, rgOwnerBytes32, 1, 1, {from: ruleAuthorizer}))
    .then(() => organization.addUser(rgProxyAddress3))

    .then(() => spendData = rGManagerClone.contract.spend.getData(acc2, tokensToTransfer, 5, 'test comment'))
    .then(() => forwardData = organization.contract.forward.getData(acc1, rGManagerClone.address, 0, spendData, false))
    .then(() => hashedForwardData = web3.sha3(forwardData, {encoding: 'hex'}))
    .then(() => authorizerSig = prepareSignature(ruleAuthorizerPK, hashedForwardData, organization.address, rgProxyAddress, operationId, requiredConsumptions3, rgRuleAuthorizerClone.address, nonce, rgValidatorClone.address))
    .then(() => confirmData = rgRuleAuthorizerClone.contract.confirm.getData(hashedForwardData, organization.address, addLeftToAddressWithPrefix(rgProxyAddress), operationId, requiredConsumptions3, nonce, authorizerSig.v, util.bufferToHex(authorizerSig.r), util.bufferToHex(authorizerSig.s)))
    .then(() => userForwardData = rgUser.contract.forward.getData(organization.address, 0, forwardData))

    .then(() => authorizerSig2 = prepareSignature(ruleAuthorizerPK, hashedForwardData, organization.address, rgProxyAddress2, operationId, requiredConsumptions3, rgRuleAuthorizerClone.address, nonce2, rgValidatorClone.address))
    .then(() => confirmData2 = rgRuleAuthorizerClone.contract.confirm.getData(hashedForwardData, organization.address, addLeftToAddressWithPrefix(rgProxyAddress2), operationId, requiredConsumptions3, nonce2, authorizerSig2.v, util.bufferToHex(authorizerSig2.r), util.bufferToHex(authorizerSig2.s)))
    .then(() => userForwardData2 = rgUser2.contract.forward.getData(organization.address, 0, forwardData))

    .then(() => authorizerSig3 = prepareSignature(ruleAuthorizerPK, hashedForwardData, organization.address, rgProxyAddress3, operationId, requiredConsumptions3, rgRuleAuthorizerClone.address, nonce3, rgValidatorClone.address))
    .then(() => confirmData3 = rgRuleAuthorizerClone.contract.confirm.getData(hashedForwardData, organization.address, addLeftToAddressWithPrefix(rgProxyAddress3), operationId, requiredConsumptions3, nonce3, authorizerSig3.v, util.bufferToHex(authorizerSig3.r), util.bufferToHex(authorizerSig3.s)))
    .then(() => userForwardData3 = rgUser3.contract.forward.getData(organization.address, 0, forwardData))


    .then(() => rgTransactionRulesClone.removeFromWhitelist(rgOwner))
    
    .then(() => rgValidatorClone.forwardCalls([rgRuleAuthorizerClone.address, rgRuleAuthorizerClone.address, rgRuleAuthorizerClone.address, '0x0', rgUser.address, rgUser2.address, rgUser3.address, '0x0', '0x0', '0x0', '0x0'], confirmData, confirmData2, confirmData3, '0x1',  userForwardData, userForwardData2, userForwardData3, '0x1', '0x1', '0x1', '0x1'))
    .then(result => {
      assert.equal(result.logs.length, 6);
      assert.equal(result.logs[2].event, 'Error');
      assert.equal(bytesToString(result.logs[2].args.error), 'Operation was not signed');
      assert.equal(result.logs[3].event, 'Error');
      assert.equal(bytesToString(result.logs[3].args.error), 'Origin isnt allowed for transfer');
      assert.equal(result.logs[4].event, 'Error');
      assert.equal(bytesToString(result.logs[4].args.error), 'Transfer not allowed for sender');
    })
    .then(() => assertBalance(rGManagerClone, acc1, 400))
    .then(() => assertBalance(rGManagerClone, acc2, 0))
  })


});
