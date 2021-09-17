"use strict";
const Reverter = require('../helpers/reverter');
const replaceAll = require('../helpers/replaceAll');
const RGTransactionRules = artifacts.require('./RGTransactionRulesPrototype_v8.sol');
const RGRuleAuthorizer = artifacts.require('./RGRuleAuthorizerPrototype_v8.sol');
const ownedBase = require('../ownedBase');
const deployHelperContracts = require('../helpers/deployHelperContracts');

contract('RGTransactionRules v8', function(accounts) {
  const reverter = new Reverter(web3);
  afterEach('revert', reverter.revert);
  const rgOwner = accounts[0];
  const rgWallet = accounts[6];
  const ruleAuthorizer = accounts[3];
  const data = web3.sha3('0x1234');
  const placeholder = 'cafecafecafecafecafecafecafecafecafecafe';

  let owned;
  let rgTransactionRulesClone;
  let rgRuleAuthorizerClone;

  function bytesToString(bytes) {
    return web3.toAscii(bytes.split('00')[0]);
  }

  before('setup others', function() {
    //prepare transaction rules contracts
    return deployHelperContracts(RGTransactionRules, true)
    .then(contracts => {
      rgTransactionRulesClone = RGTransactionRules.at(contracts.clone.address);
    })
    //rule authorizer contracts
    .then(() => deployHelperContracts(RGRuleAuthorizer, true))
    .then(contracts => {
      rgRuleAuthorizerClone = RGRuleAuthorizer.at(contracts.clone.address);
    })
    .then(() => rgRuleAuthorizerClone.constructRuleAuthorizer(rgOwner))
    .then(() => rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer))
    .then(() => rgTransactionRulesClone.constructTransactionRules(rgOwner))
    //set Rule authorizer
    .then(() => rgTransactionRulesClone.setRuleAuthorizer(rgRuleAuthorizerClone.address))
    //setup for owned
    .then(() => RGTransactionRules.at(rgTransactionRulesClone.address))
    .then(instance => this.owned = instance)
    .then(reverter.snapshot);
  });

  it('should be possible to add user to the whitelist for contract owner', function() {
    const user = accounts[7];

    return rgTransactionRulesClone.addToWhitelist.call(user)
    .then(assert.isTrue)
    .then(() => rgTransactionRulesClone.addToWhitelist(user))
    .then(result => {
        assert.equal(result.logs.length, 1);
        assert.equal(result.logs[0].event, 'AddedToWhitelist');
        assert.equal(result.logs[0].args.addressAdded, user);
    })
    .then(() => rgTransactionRulesClone.whitelist(user))
    .then(assert.isTrue);
  });

  it('should NOT be possible to add user to the whitelist for not contract owner', function() {
    const user = accounts[7];

    return rgTransactionRulesClone.addToWhitelist.call(user, {from: user})
    .then(assert.isFalse)
    .then(() => rgTransactionRulesClone.addToWhitelist(user, {from: user}))
    .then(() => rgTransactionRulesClone.whitelist(user))
    .then(assert.isFalse);
  });

  it('should be possible to remove user from the whitelist for contract owner', function() {
    const user = accounts[7];

    return rgTransactionRulesClone.addToWhitelist(user)
    .then(() => rgTransactionRulesClone.whitelist(user))
    .then(assert.isTrue)
    .then(() => rgTransactionRulesClone.removeFromWhitelist.call(user))
    .then(assert.isTrue)
    .then(() => rgTransactionRulesClone.removeFromWhitelist(user))
    .then(result => {
        assert.equal(result.logs.length, 1);
        assert.equal(result.logs[0].event, 'RemovedFromWhitelist');
        assert.equal(result.logs[0].args.addressRemoved, user);
    })
    .then(() => rgTransactionRulesClone.whitelist(user))
    .then(assert.isFalse);

  });

  it('should NOT be possible to remove user from whitelist for not contract owner', function() {
    const user = accounts[7];

    return rgTransactionRulesClone.addToWhitelist(user)
    .then(() => rgTransactionRulesClone.removeFromWhitelist(user, {from: user}))
    .then(() => rgTransactionRulesClone.whitelist(user))
    .then(assert.isTrue);
  });


  it('should NOT allow to transfer if tx.origin is not in whitelist', function() {
    const user = accounts[7];

    return rgTransactionRulesClone.isTransferAllowed(rgOwner, user, 10, user, {from: rgOwner})
    .then(result => {
        assert.equal(bytesToString(result.logs[1].args.error), 'Origin isnt allowed for transfer');
    })
  });

  it('should allow to transfer if tx.origin is in whitelist', function() {
    const user = accounts[7];

    return rgTransactionRulesClone.addToWhitelist(rgOwner)
    .then(() => rgTransactionRulesClone.isTransferAllowed.call(rgOwner, user, 10, user, {from: rgOwner}))
    .then(assert.isTrue);
  });

  ownedBase(accounts);

});