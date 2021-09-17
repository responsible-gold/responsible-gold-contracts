"use strict";
const Reverter = require('../helpers/reverter');
const Asserts = require('../helpers/asserts');
const replaceAll = require('../helpers/replaceAll');
const RGValidator = artifacts.require('./RGValidatorPrototype_v10.sol');
const placeholder = 'cafecafecafecafecafecafecafecafecafecafe';
const deployHelperContracts = require('../helpers/deployHelperContracts');

contract('RGValidator v10', function(accounts) {
  const reverter = new Reverter(web3);
  const asserts = Asserts(assert);
  const data = '0x1234';
  afterEach('revert', reverter.revert);

  let rgValidatorClone;

  before('setup others', function() {
    //validator contracts
    return deployHelperContracts(RGValidator, true)
    .then(contracts => {
      rgValidatorClone = RGValidator.at(contracts.clone.address);
    })
    .then(reverter.snapshot);
  });


  it('should be possible forward one call to the contract, CalledTransactions event should be emitted', function() {
    return rgValidatorClone.forwardCalls.call([accounts[1], '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0'], data, '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1')
    .then(assert.isTrue)
    .then(() => rgValidatorClone.forwardCalls([accounts[1], '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0'], data, '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1'))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'CalledTransactions');
      assert.equal(result.logs[0].args.count, 1);
    });
  });

  it('should be possible forward 11 calls, CalledTransactions event should be emitted with 11 calls count', function() {
    return rgValidatorClone.forwardCalls.call([accounts[1], accounts[1], accounts[1], accounts[1], accounts[1], accounts[1], accounts[1], accounts[1], accounts[1], accounts[1], accounts[1]], data, data, data, data, data, data, data, data, data, data, data)
    .then(assert.isTrue)
    .then(() => rgValidatorClone.forwardCalls([accounts[1], accounts[1], accounts[1], accounts[1], accounts[1], accounts[1], accounts[1], accounts[1], accounts[1], accounts[1], accounts[1]], data, data, data, data, data, data, data, data, data, data, data))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'CalledTransactions');
      assert.equal(result.logs[0].args.count, 11);
    });
  });

  it('should be possible call forwardCalls without valid contract addresses, CalledTransactions event should be emitted with 0 calls count', function() {
    return rgValidatorClone.forwardCalls.call(['0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0'], '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1')
    .then(assert.isTrue)
    .then(() => rgValidatorClone.forwardCalls(['0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0', '0x0'], '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1', '0x1'))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'CalledTransactions');
      assert.equal(result.logs[0].args.count, 0);
    });
  });


});
