"use strict";
const Reverter = require('../helpers/reverter');
const replaceAll = require('../helpers/replaceAll');
const RGRuleAuthorizer = artifacts.require('./RGRuleAuthorizerPrototype_v6.sol');
const ownedBase = require('../ownedBase');
const util = require('ethereumjs-util');
const deployHelperContracts = require('../helpers/deployHelperContracts');

contract('RGRuleAuthorizer v6', function(accounts) {
  const reverter = new Reverter(web3);
  afterEach('revert', reverter.revert);
  const rgOwner = accounts[0];
  const spendHash = web3.sha3('0x1234');
  const ruleAuthorizerPK = util.toBuffer('0x15bab7cc703515242f5811cc2e6a187241eb37999bbf091a7101fb609869c248');
  const ruleAuthorizer = util.bufferToHex(util.privateToAddress(ruleAuthorizerPK));
  const placeholder = 'cafecafecafecafecafecafecafecafecafecafe';
  
  let owned;
  let rgRuleAuthorizerClone;

  function bytesToString(bytes) {
    return web3.toAscii(bytes.split('00')[0]);
  }

  before('setup others', function() {
    //rule authorizer contracts
    return deployHelperContracts(RGRuleAuthorizer, true)
    .then(contracts => {
      rgRuleAuthorizerClone = RGRuleAuthorizer.at(contracts.clone.address);
    })
    .then(() => rgRuleAuthorizerClone.constructRuleAuthorizer(rgOwner))
    //setup for owned
    .then(() => RGRuleAuthorizer.at(rgRuleAuthorizerClone.address))
    .then(instance => this.owned = instance)
    .then(reverter.snapshot);
  });

  it('should be possible to set ruleAuthorizer for contract owner', function() {
      return rgRuleAuthorizerClone.setRuleAuthorizer.call(ruleAuthorizer)
      .then(assert.isTrue)
      .then(() => rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer))
      .then(() => rgRuleAuthorizerClone.authorizer())
      .then(result => assert.equal(result, ruleAuthorizer));
  });

  it('should NOT be possible to set ruleAuthorizer for NOT contract owner', function() {
    return rgRuleAuthorizerClone.setRuleAuthorizer.call(ruleAuthorizer, {from: accounts[3]})
    .then(assert.isFalse)
    .then(() => rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer, {from: accounts[3]}))
    .then(() => rgRuleAuthorizerClone.authorizer())
    .then(result => assert.equal(result, '0x0000000000000000000000000000000000000000'));
  });

  it('should be possible to sign operation by ruleAuthorizer', function() {
    const consumer = accounts[3];
    
    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer.call(spendHash, consumer, ruleAuthorizer, 1, 1, {from: ruleAuthorizer}))
    .then(assert.isTrue);
  })

  it('should NOT be possible to sign operation via confirmByAuthorizer by NOT ruleAuthorizer', function() {
    const consumer = accounts[3];

    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer.call(spendHash, consumer, ruleAuthorizer, 1, 1, {from: accounts[3]}))
    .then(assert.isFalse);
  })

  it('should increment consumptionsRequired after sign operation by ruleAuthorizer', function() {
    const consumer = accounts[3];
    
    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(spendHash, consumer, ruleAuthorizer, 1, 1, {from: ruleAuthorizer}))
    .then(() => rgRuleAuthorizerClone.consumptionsRequired(spendHash, 1))
    .then(result => assert.equal(result, 1));
  })
  

  it('should be possible to consumeOperation with 1 consumption', function() {
    const consumer = accounts[2];

    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(spendHash, consumer, ruleAuthorizer, 1, 1, {from: ruleAuthorizer}))
    .then(() => rgRuleAuthorizerClone.consumeOperation.call(spendHash, ruleAuthorizer, {from: consumer}))
    .then(result => {
      assert.equal(result[0], true);
      assert.equal(result[1], true);
    })
  })

  it('should decrement consumptionsRequired after successfull consumeOperation', function() {
    const consumer = accounts[3];
    
    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(spendHash, consumer, ruleAuthorizer, 1, 1, {from: ruleAuthorizer}))
    .then(() => rgRuleAuthorizerClone.consumeOperation(spendHash, ruleAuthorizer, {from: consumer}))
    .then(() => rgRuleAuthorizerClone.consumptionsRequired(spendHash, 1))
    .then(result => assert.equal(result, 0));
  })

  it('should NOT consumeOperation if hash is not valid', function() {
    const consumer = accounts[2];
    const notValidHash = web3.sha3('0x123');
    
    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(spendHash, consumer, ruleAuthorizer, 1, 1, {from: ruleAuthorizer}))
    .then(() => rgRuleAuthorizerClone.consumeOperation.call(notValidHash, ruleAuthorizer, {from: consumer}))
    .then(result => {
      assert.equal(result[0], false);
      assert.equal(result[1], false);
    })
  })

  it('should return success on consumeOperation and is not a last consumption if passed not all required consumptions', function() {
    const consumer = accounts[2];
    
    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(spendHash, consumer, ruleAuthorizer, 1, 2, {from: ruleAuthorizer}))
    .then(() => rgRuleAuthorizerClone.consumeOperation.call(spendHash, ruleAuthorizer, {from: consumer}))
    .then(result => {
      assert.equal(result[0], true);
      assert.equal(result[1], false);
    })
  })

  it('should be possible to consumeOperations with 2 consumption', function() {
    const consumer1 = accounts[2];
    const consumer2 = accounts[3];
    
    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(spendHash, consumer1, ruleAuthorizer, 1, 2, {from: ruleAuthorizer}))
    .then(() => rgRuleAuthorizerClone.confirmByAuthorizer(spendHash, consumer2, ruleAuthorizer, 1, 2, {from: ruleAuthorizer}))
    .then(() => rgRuleAuthorizerClone.consumeOperation(spendHash, ruleAuthorizer, {from: consumer1}))
    .then(() => rgRuleAuthorizerClone.consumeOperation.call(spendHash, ruleAuthorizer, {from: consumer2}))
    .then(result => {
      assert.equal(result[0], true);
      assert.equal(result[1], true);
    })
  })

  it('should be possible to sign operation by ruleAuthorizer via confirm', function() {
    const consumer = accounts[3];
    const requiredConsumptions = '0000000000000000000000000000000000000000000000000000000000000001';
    const nonce = '0000000000000000000000000000000000000000000000000000000000000001';
    const consumerInternalId = 1;
    const sum = spendHash + consumer.substr(2) + ruleAuthorizer.substr(2) + '000000000000000000000000' + consumerInternalId + '000000000000000000000000000000000000000000000000000000000000000' + requiredConsumptions + rgRuleAuthorizerClone.address.substr(2) + nonce + ruleAuthorizer.substr(2);
    const hash = web3.sha3(sum, {encoding: 'hex'});
    const sig = util.ecsign(util.toBuffer(hash), ruleAuthorizerPK);

    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => rgRuleAuthorizerClone.confirm.call(spendHash, consumer, ruleAuthorizer, 1, requiredConsumptions, nonce, sig.v, util.bufferToHex(sig.r), util.bufferToHex(sig.s), {from: ruleAuthorizer}))
    .then(assert.isTrue);
  })

  it('should be possible to sign 2nd operation by ruleAuthorizer via confirm and nonce incrementing', function() {
    const consumer = accounts[3];
    const requiredConsumptions = '0000000000000000000000000000000000000000000000000000000000000001';
    const nonce = '0000000000000000000000000000000000000000000000000000000000000001';
    const consumerInternalId = 1;
    const sumNonce1 = spendHash + consumer.substr(2) + ruleAuthorizer.substr(2) + '000000000000000000000000' + consumerInternalId + '000000000000000000000000000000000000000000000000000000000000000' + requiredConsumptions + rgRuleAuthorizerClone.address.substr(2) + nonce + ruleAuthorizer.substr(2);
    const hash1 = web3.sha3(sumNonce1, {encoding: 'hex'});
    const sig1 = util.ecsign(util.toBuffer(hash1), ruleAuthorizerPK);

    const nonce2 = '0000000000000000000000000000000000000000000000000000000000000002';
    const sumNonce2 = spendHash + consumer.substr(2) + ruleAuthorizer.substr(2) + '000000000000000000000000' + consumerInternalId + '000000000000000000000000000000000000000000000000000000000000000' + requiredConsumptions + rgRuleAuthorizerClone.address.substr(2) + nonce2 + ruleAuthorizer.substr(2);
    const hash2 = web3.sha3(sumNonce2, {encoding: 'hex'});
    const sig2 = util.ecsign(util.toBuffer(hash2), ruleAuthorizerPK);

    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => rgRuleAuthorizerClone.confirm(spendHash, consumer, ruleAuthorizer, 1, requiredConsumptions, nonce, sig1.v, util.bufferToHex(sig1.r), util.bufferToHex(sig1.s), {from: ruleAuthorizer}))
    .then(() => rgRuleAuthorizerClone.confirm.call(spendHash, consumer, ruleAuthorizer, 1, requiredConsumptions, nonce2, sig2.v, util.bufferToHex(sig2.r), util.bufferToHex(sig2.s), {from: ruleAuthorizer}))
    .then(assert.isTrue);
  })

  it('should NOT be possible to sign operation by ruleAuthorizer via confirm if nonce is not valid', function() {
    const consumer = accounts[3];
    const requiredConsumptions = '0000000000000000000000000000000000000000000000000000000000000001';
    const nonce = '0000000000000000000000000000000000000000000000000000000000000001';
    const consumerInternalId = 1;
    const sumNonce1 = spendHash + consumer.substr(2) + ruleAuthorizer.substr(2) + '000000000000000000000000' + consumerInternalId + '000000000000000000000000000000000000000000000000000000000000000' + requiredConsumptions + rgRuleAuthorizerClone.address.substr(2) + nonce + ruleAuthorizer.substr(2);
    const hash1 = web3.sha3(sumNonce1, {encoding: 'hex'});
    const sig1 = util.ecsign(util.toBuffer(hash1), ruleAuthorizerPK);

    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => rgRuleAuthorizerClone.confirm(spendHash, consumer, ruleAuthorizer, 1, requiredConsumptions, nonce, sig1.v, util.bufferToHex(sig1.r), util.bufferToHex(sig1.s), {from: ruleAuthorizer}))
    .then(() => rgRuleAuthorizerClone.confirm.call(spendHash, consumer, ruleAuthorizer, 1, requiredConsumptions, nonce, sig1.v, util.bufferToHex(sig1.r), util.bufferToHex(sig1.s), {from: ruleAuthorizer}))
    .then(assert.isFalse);
  })

  it('should NOT be possible to sign operation if sign(v) is not valid', function() {
    const consumer = accounts[3];
    const requiredConsumptions = '0000000000000000000000000000000000000000000000000000000000000001';
    const nonce = '0000000000000000000000000000000000000000000000000000000000000001';
    const consumerInternalId = 1;
    const sum = spendHash + consumer.substr(2) + ruleAuthorizer.substr(2) + '000000000000000000000000' + consumerInternalId + '000000000000000000000000000000000000000000000000000000000000000' + requiredConsumptions + rgRuleAuthorizerClone.address.substr(2) + nonce + ruleAuthorizer.substr(2);
    const hash = web3.sha3(sum, {encoding: 'hex'});
    const sig = util.ecsign(util.toBuffer(hash), ruleAuthorizerPK);

    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => rgRuleAuthorizerClone.confirm.call(spendHash, consumer, ruleAuthorizer, 1, requiredConsumptions, nonce, 100, util.bufferToHex(sig.r), util.bufferToHex(sig.s), {from: ruleAuthorizer}))
    .then(assert.isFalse);
  })

  it('should be possible to consumeOperation with 1 consumption via confirm', function() {
    const consumer = accounts[3];
    const requiredConsumptions = '0000000000000000000000000000000000000000000000000000000000000001';
    const nonce = '0000000000000000000000000000000000000000000000000000000000000001';
    const consumerInternalId = 1;
    const sum = spendHash + consumer.substr(2) + ruleAuthorizer.substr(2) + '000000000000000000000000' + consumerInternalId + '000000000000000000000000000000000000000000000000000000000000000' + requiredConsumptions + rgRuleAuthorizerClone.address.substr(2) + nonce + ruleAuthorizer.substr(2);
    const hash = web3.sha3(sum, {encoding: 'hex'});
    const sig = util.ecsign(util.toBuffer(hash), ruleAuthorizerPK);

    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => rgRuleAuthorizerClone.confirm(spendHash, consumer, ruleAuthorizer, 1, requiredConsumptions, nonce, sig.v, util.bufferToHex(sig.r), util.bufferToHex(sig.s), {from: ruleAuthorizer}))
    .then(() => rgRuleAuthorizerClone.consumeOperation.call(spendHash, ruleAuthorizer, {from: consumer}))
    .then(result => {
      assert.equal(result[0], true);
      assert.equal(result[1], true);
    })
  })

  ownedBase(accounts);

});