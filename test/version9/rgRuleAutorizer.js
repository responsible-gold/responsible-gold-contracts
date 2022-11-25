"use strict";
const Reverter = require('../helpers/reverter');
const replaceAll = require('../helpers/replaceAll');
const RGRuleAuthorizer = artifacts.require('./RGRuleAuthorizerPrototype_v9.sol');
const ownedBase = require('../ownedBase');
const util = require('ethereumjs-util');
const deployHelperContracts = require('../helpers/deployHelperContracts');

contract('RGRuleAuthorizer v9', function(accounts) {
  const reverter = new Reverter(web3);
  afterEach('revert', reverter.revert);
  const rgOwner = accounts[0];
  const spendHash = web3.sha3('0x1234', {encoding: 'hex'});
  const ruleAuthorizerPK = util.toBuffer('0x15bab7cc703515242f5811cc2e6a187241eb37999bbf091a7101fb609869c248');
  const ruleAuthorizer = util.bufferToHex(util.privateToAddress(ruleAuthorizerPK));
  const placeholder = 'cafecafecafecafecafecafecafecafecafecafe';
  
  let owned;
  let rgRuleAuthorizerClone;

  function prepareSignature(signerPK, hashToSign, consumer, consumerInternalId, operationId, requiredConsumptions, authorizerAddress, nonce, msgSender) {
    const consumerPrepared = util.stripHexPrefix(consumer);
    const consumerInternalIdPrepared = addLeftToAddress(consumerInternalId);
    const operationIdPrepared = addLeftToInt(operationId);
    const requiredConsumptionsPrepared = addLeftToInt(requiredConsumptions);
    const authorizerAddressPrepared = util.stripHexPrefix(authorizerAddress);
    const noncePrepared = addLeftToInt(nonce);
    const msgSenderPrepared = util.stripHexPrefix(msgSender);

    let sum = hashToSign + consumerPrepared + consumerInternalIdPrepared + operationIdPrepared + requiredConsumptionsPrepared + authorizerAddressPrepared + noncePrepared + msgSenderPrepared;
    let hash = web3.sha3(sum, {encoding: 'hex'});
    return util.ecsign(util.toBuffer(hash), signerPK);
  }

  function bytesToString(bytes) {
    return web3.toAscii(bytes.split('00')[0]);
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

  function addLeftToAddress(addressValue) {
    return util.setLengthLeft(util.toBuffer(addressValue), 32).toString('hex');
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
      .then(result => {
        assert.equal(result.logs.length, 1);
        assert.equal(result.logs[0].event, 'AuthorizerSet');
        assert.equal(result.logs[0].args.authorizerAddress, ruleAuthorizer);
      })
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
    const requiredConsumptions = 1;
    const nonce = 1;
    const operationId = 1;
    let authorizerSig;

    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => authorizerSig = prepareSignature(ruleAuthorizerPK, spendHash, consumer, ruleAuthorizer, operationId, requiredConsumptions, rgRuleAuthorizerClone.address, nonce, ruleAuthorizer))
    .then(() => rgRuleAuthorizerClone.confirm.call(spendHash, consumer, addLeftToAddressWithPrefix(ruleAuthorizer), operationId, requiredConsumptions, nonce, authorizerSig.v, util.bufferToHex(authorizerSig.r), util.bufferToHex(authorizerSig.s), {from: ruleAuthorizer}))
    .then(assert.isTrue);
  })

  it('should be possible to sign 2nd operation by ruleAuthorizer via confirm and nonce incrementing', function() {
    const consumer = accounts[3];
    const requiredConsumptions = 1;
    const nonce = 1;
    const operationId = 1;
    const nonce2 = 2;
    let authorizerSig;
    let authorizerSig2;

    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => authorizerSig = prepareSignature(ruleAuthorizerPK, spendHash, consumer, ruleAuthorizer, operationId, requiredConsumptions, rgRuleAuthorizerClone.address, nonce, ruleAuthorizer))
    .then(() => authorizerSig2 = prepareSignature(ruleAuthorizerPK, spendHash, consumer, ruleAuthorizer, operationId, requiredConsumptions, rgRuleAuthorizerClone.address, nonce2, ruleAuthorizer))
    .then(() => rgRuleAuthorizerClone.confirm(spendHash, consumer, addLeftToAddressWithPrefix(ruleAuthorizer), operationId, requiredConsumptions, nonce, authorizerSig.v, util.bufferToHex(authorizerSig.r), util.bufferToHex(authorizerSig.s), {from: ruleAuthorizer}))
    .then(() => rgRuleAuthorizerClone.confirm.call(spendHash, consumer, addLeftToAddressWithPrefix(ruleAuthorizer), operationId, requiredConsumptions, nonce2, authorizerSig2.v, util.bufferToHex(authorizerSig2.r), util.bufferToHex(authorizerSig2.s), {from: ruleAuthorizer}))
    .then(assert.isTrue);
  })

  it('should NOT be possible to sign operation by ruleAuthorizer via confirm if nonce is not valid', function() {
    const consumer = accounts[3];
    const requiredConsumptions = 1;
    const nonce = 1;
    const operationId = 1;
    let authorizerSig;

    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => authorizerSig = prepareSignature(ruleAuthorizerPK, spendHash, consumer, ruleAuthorizer, operationId, requiredConsumptions, rgRuleAuthorizerClone.address, nonce, ruleAuthorizer))
    .then(() => rgRuleAuthorizerClone.confirm(spendHash, consumer, addLeftToAddressWithPrefix(ruleAuthorizer), operationId, requiredConsumptions, nonce, authorizerSig.v, util.bufferToHex(authorizerSig.r), util.bufferToHex(authorizerSig.s), {from: ruleAuthorizer}))
    .then(() => rgRuleAuthorizerClone.confirm.call(spendHash, consumer, addLeftToAddressWithPrefix(ruleAuthorizer), operationId, requiredConsumptions, nonce, authorizerSig.v, util.bufferToHex(authorizerSig.r), util.bufferToHex(authorizerSig.s), {from: ruleAuthorizer}))
    .then(assert.isFalse);
  })

  it('should NOT be possible to sign operation if sign(v) is not valid', function() {
    const consumer = accounts[3];
    const requiredConsumptions = 1;
    const nonce = 1;
    const operationId = 1;
    let authorizerSig;

    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => authorizerSig = prepareSignature(ruleAuthorizerPK, spendHash, consumer, ruleAuthorizer, operationId, requiredConsumptions, rgRuleAuthorizerClone.address, nonce, ruleAuthorizer))
    .then(() => rgRuleAuthorizerClone.confirm.call(spendHash, consumer, addLeftToAddressWithPrefix(ruleAuthorizer), operationId, requiredConsumptions, nonce, 100, util.bufferToHex(authorizerSig.r), util.bufferToHex(authorizerSig.s), {from: ruleAuthorizer}))
    .then(assert.isFalse);
  })

  it('should be possible to consumeOperation with 1 consumption via confirm', function() {
    const consumer = accounts[3];
    const requiredConsumptions = 1;
    const nonce = 1;
    const operationId = 1;
    let authorizerSig;

    return rgRuleAuthorizerClone.setRuleAuthorizer(ruleAuthorizer)
    .then(() => authorizerSig = prepareSignature(ruleAuthorizerPK, spendHash, consumer, ruleAuthorizer, operationId, requiredConsumptions, rgRuleAuthorizerClone.address, nonce, ruleAuthorizer))
    .then(() => rgRuleAuthorizerClone.confirm(spendHash, consumer, addLeftToAddressWithPrefix(ruleAuthorizer), operationId, requiredConsumptions, nonce, authorizerSig.v, util.bufferToHex(authorizerSig.r), util.bufferToHex(authorizerSig.s), {from: ruleAuthorizer}))
    .then(() => rgRuleAuthorizerClone.consumeOperation.call(spendHash, addLeftToAddressWithPrefix(ruleAuthorizer), {from: consumer}))
    .then(result => {
      assert.equal(result[0], true);
      assert.equal(result[1], true);
    })
  })

  ownedBase(accounts);

});