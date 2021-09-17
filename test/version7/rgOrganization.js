"use strict";
const Reverter = require('../helpers/reverter');
const Asserts = require('../helpers/asserts');
const replaceAll = require('../helpers/replaceAll');
const RGAccount = artifacts.require('./RGAccountPrototype_v7.sol');
const RGOrganizationFactory = artifacts.require('./RGOrganizationFactory.sol');
const RGOrganization = artifacts.require('./RGOrganizationPrototype_v7.sol');
const RGManager = artifacts.require('./RGManagerPrototype_v7.sol');
const RGAssetOwnershipCardCloneFactory = artifacts.require('./RGAssetOwnershipCardCloneFactory.sol');
const RGAssetOwnershipCard = artifacts.require('./RGAssetOwnershipCardPrototype_v7.sol');
const RGTransactionRules = artifacts.require('./RGTransactionRulesPrototype_v7.sol');
const RGRuleAuthorizer = artifacts.require('./RGRuleAuthorizerPrototype_v7.sol');
const deployHelperContracts = require('../helpers/deployHelperContracts');

contract('RGOrganization v7', function(accounts) {
  const reverter = new Reverter(web3);
  const asserts = Asserts(assert);
  afterEach('revert', reverter.revert);
  const rgOwner = accounts[0];
  const rgOwnerBytes32 = '0x000000000000000000000000' + rgOwner.substr(2);
  const rgWallet = accounts[6];
  const ruleAuthorizer = accounts[3];
  const placeholder = 'cafecafecafecafecafecafecafecafecafecafe';
  const placeholder2 = 'fefefefefefefefefefefefefefefefefefefefe';
  const placeholder3 = 'cacacacacacacacacacacacacacacacacacacaca';

  let rgOrganizationFactory;
  let rgAccountCloneAddress;
  let rgAccountCloneOwned;
  let rgAccountResolver;
  let rgOrganizationResolver;

  let rGManagerClone;
  let rGAssetOwnershipCardCloneFactory;
  let rGAssetOwnershipCardClone;
  let rGAssetOwnershipCardResolver;
  let rgTransactionRulesClone;
  let rgRuleAuthorizerClone;

  function bytesToString(bytes) {
    return web3.toAscii(bytes.split('00')[0]);
  }

  function assertBalance(erc20Contract, balanceOwner, value) {
    return erc20Contract.balanceOf(balanceOwner)
    .then(result => assert.equal(result.valueOf(), value));
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
   //prepare transaction rules contracts
   .then(() => deployHelperContracts(RGTransactionRules, true))
   .then(contracts => {
    rgTransactionRulesClone = RGTransactionRules.at(contracts.clone.address);
   })

   //construct transaction rules
   .then(() => rgTransactionRulesClone.constructTransactionRules(rgOwner))
   //add to the whitelist
   .then(() => rgTransactionRulesClone.addToWhitelist(rgOwner))

   //prepare RGManager
   .then(() => deployHelperContracts(RGManager, true))
   .then(contracts => {
    rGManagerClone = RGManager.at(contracts.clone.address);
   })
   .then(() => rGManagerClone.constructRGManager(rgOwner, 8, rGAssetOwnershipCardCloneFactory.address, rgTransactionRulesClone.address))

   //rule authorizer
   .then(() => deployHelperContracts(RGRuleAuthorizer, true))
   .then(contracts => {
    rgRuleAuthorizerClone = RGRuleAuthorizer.at(contracts.clone.address);
   })
   .then(() => rgRuleAuthorizerClone.constructRuleAuthorizer(rgOwner))
   .then(() => rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer))
    //organization and account factory
    .then(() => {
      RGOrganizationFactory._json.unlinked_binary = replaceAll(RGOrganizationFactory._json.unlinked_binary, placeholder, rgAccountResolver.address.slice(-40));
      RGOrganizationFactory._json.unlinked_binary = replaceAll(RGOrganizationFactory._json.unlinked_binary, placeholder2, rgOrganizationResolver.address.slice(-40));
      RGOrganizationFactory._json.unlinked_binary = replaceAll(RGOrganizationFactory._json.unlinked_binary, placeholder3, rgRuleAuthorizerClone.address.slice(-40));
      return RGOrganizationFactory.new();
    })
    .then(instance => rgOrganizationFactory = instance)
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
      assert.equal(bytesToString(result.logs[0].args.error), 'Tx is not signed');
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
    let data;
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
    const userBytes32 = '0x000000000000000000000000' + user.substr(2);

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

});
