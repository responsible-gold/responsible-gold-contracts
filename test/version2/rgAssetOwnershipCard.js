"use strict";
const Reverter = require('../helpers/reverter');
const replaceAll = require('../helpers/replaceAll');
const RGAssetOwnershipCard = artifacts.require('./RGAssetOwnershipCardPrototype_v2.sol');
const RGAssetOwnershipCardCloneFactory = artifacts.require('./RGAssetOwnershipCardCloneFactory.sol');
const ownedBase = require('../ownedBase');
const deployHelperContracts = require('../helpers/deployHelperContracts');

contract('RGAssetOwnershipCard v2', function(accounts) {
  const reverter = new Reverter(web3);
  afterEach('revert', reverter.revert);
  const rgOwner = accounts[0];
  const chip1 = 'chip1';
  const baseUnit = 8;
  const placeholder = 'cafecafecafecafecafecafecafecafecafecafe';

  let owned;
  let rGAssetOwnershipCardCloneFactory;
  let rGAssetOwnershipCardClone;
  let rGAssetOwnershipCardResolver;

  function bytesToString(bytes) {
    return web3.toAscii(bytes.split('00')[0]);
  }

  function deployRGACWithCloneFactory() {
    let rGACaddress;
    return rGAssetOwnershipCardCloneFactory.deploy.call()
    .then(result => rGACaddress = result)
    .then(() => rGAssetOwnershipCardCloneFactory.deploy())
    .then(() => RGAssetOwnershipCard.at(rGACaddress))
    .then(instance => rGAssetOwnershipCardClone = instance);
  }

  before('setup others', function() {
    let rGACaddress;
    return deployHelperContracts(RGAssetOwnershipCard)
    .then(contracts => {
      rGAssetOwnershipCardResolver = contracts.resolver;
    })
    .then(() => {
      RGAssetOwnershipCardCloneFactory._json.unlinked_binary = replaceAll(RGAssetOwnershipCardCloneFactory._json.unlinked_binary, placeholder, rGAssetOwnershipCardResolver.address.slice(-40));
      return RGAssetOwnershipCardCloneFactory.new()
    })
    .then(instance => rGAssetOwnershipCardCloneFactory = instance)
    //setup for owned
    .then(() => rGAssetOwnershipCardCloneFactory.deploy.call())
    .then(result => rGACaddress = result)
    .then(() => rGAssetOwnershipCardCloneFactory.deploy())
    .then(() => RGAssetOwnershipCard.at(rGACaddress))
    .then(instance => this.owned = instance)
    .then(() => this.owned.constructRGAssetOwnershipCard(chip1, rgOwner, 1000, baseUnit, rgOwner))
    .then(reverter.snapshot);
  });

  it('should be possible to transfer AC coins using managedTransfer from RGmanager contract', function() {
    let rGACaddress;
    const recipient = accounts[1];

    return deployRGACWithCloneFactory()
    .then(() => rGAssetOwnershipCardClone.constructRGAssetOwnershipCard(chip1, rgOwner, 1000, baseUnit, rgOwner))
    .then(() => rGAssetOwnershipCardClone.managedTransfer.call(rgOwner, recipient, 1, {from: rgOwner}))
    .then(assert.isTrue);
  });

  it('should set chip property when RGAC contract is deployed', function() {
    let rGACaddress;
    const recipient = accounts[1];

    return deployRGACWithCloneFactory()
    .then(() => rGAssetOwnershipCardClone.constructRGAssetOwnershipCard(chip1, rgOwner, 1000, baseUnit, rgOwner))
    .then(() => rGAssetOwnershipCardClone.chip())
    .then(result => assert.equal(result, 'chip1'));
  });

  it('should NOT be possible to transfer AC coins using managedTransfer for NOT RGmanager contract', function() {
    let rGACaddress;
    const recipient = accounts[1];

    return deployRGACWithCloneFactory()
    .then(() => rGAssetOwnershipCardClone.constructRGAssetOwnershipCard(chip1, rgOwner, 1000, baseUnit, rgOwner))
    .then(() => rGAssetOwnershipCardClone.managedTransfer(rgOwner, recipient, 1, {from: recipient}))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'Error');
      assert.equal(bytesToString(result.logs[0].args.error), 'Caller isnt RGmanager contract');
    });
  });

  it('should emit Transfer event when managedTransfer happened', function() {
    let rGACaddress;
    const recipient = accounts[1];

    return deployRGACWithCloneFactory()
    .then(() => rGAssetOwnershipCardClone.constructRGAssetOwnershipCard(chip1, rgOwner, 1000, baseUnit, rgOwner))
    .then(() => rGAssetOwnershipCardClone.managedTransfer(rgOwner, recipient, 1, {from: rgOwner}))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'Transfer');
      assert.equal(result.logs[0].args.from, rgOwner);
      assert.equal(result.logs[0].args.to, recipient);
      assert.equal(result.logs[0].args.value, 1);
    });
  });

  it('should be possible to change RGAC ownership with moving all balances of AC coins', function() {
    let rGACaddress;
    const user = accounts[1];

    return deployRGACWithCloneFactory()
    .then(() => rGAssetOwnershipCardClone.constructRGAssetOwnershipCard(chip1, rgOwner, 1000, baseUnit, rgOwner))
    .then(() => rGAssetOwnershipCardClone.balanceOf(user))
    .then(result => assert.equal(result, 0))
    .then(() => rGAssetOwnershipCardClone.balanceOf(rgOwner))
    .then(result => assert.equal(result, 1000))
    .then(() => rGAssetOwnershipCardClone.changeContractOwnership(user))
    .then(() => rGAssetOwnershipCardClone.claimContractOwnership({from: user}))
    .then(() => rGAssetOwnershipCardClone.contractOwner())
    .then(result => assert.equal(result, user))
    .then(() => rGAssetOwnershipCardClone.balanceOf(user))
    .then(result => assert.equal(result, 1000))
    .then(() => rGAssetOwnershipCardClone.balanceOf(rgOwner))
    .then(result => assert.equal(result, 0));
  })

  it('should throw an error when Owner of RGAC has not all AC coins is trying to change ownership', function() {
    let rGACaddress;
    const user = accounts[1];

    return deployRGACWithCloneFactory()
    .then(() => rGAssetOwnershipCardClone.constructRGAssetOwnershipCard(chip1, rgOwner, 1000, baseUnit, rgOwner))
    .then(() => rGAssetOwnershipCardClone.managedTransfer(rgOwner, user, 1, {from: rgOwner}))
    .then(() => rGAssetOwnershipCardClone.balanceOf(user))
    .then(result => assert.equal(result, 1))
    .then(() => rGAssetOwnershipCardClone.balanceOf(rgOwner))
    .then(result => assert.equal(result, 999))
    .then(() => rGAssetOwnershipCardClone.changeContractOwnership(user))
    .then(() => rGAssetOwnershipCardClone.claimContractOwnership({from: user}))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'Error');
      assert.equal(bytesToString(result.logs[0].args.error), 'Owner doesnt have all AC coins');
    })
    .then(() => rGAssetOwnershipCardClone.contractOwner())
    .then(result => assert.equal(result, rgOwner));
  });

  it('should be possible to approve transfering AC coins from RGAC contract', function() {
    let rGACaddress;
    const approver = accounts[1];

    return deployRGACWithCloneFactory()
    .then(() => rGAssetOwnershipCardClone.constructRGAssetOwnershipCard(chip1, rgOwner, 1000, baseUnit, rgOwner))
    .then(() => rGAssetOwnershipCardClone.approve.call(rgOwner, 500, {from: approver}))
    .then(assert.isTrue);
  });

  ownedBase(accounts);

});