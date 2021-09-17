"use strict";
const Reverter = require('../helpers/reverter');
const RGRegistry = artifacts.require('./RGRegistryPrototype_v10.sol');
const RGPermissionsManager = artifacts.require('./RGPermissionsManager.sol');
const deployHelperContracts = require('../helpers/deployHelperContracts');
const ownedBase = require('../ownedBase');

contract('RGRegistry v10', function (accounts) {
  const reverter = new Reverter(web3);
  const rgOwner = accounts[0];
  const asset = 'XGC';
  const assetSymbol = 'GCoin';
  const institution = '0001';
  const emptyAddress = '0x0000000000000000000000000000000000000000'

  afterEach('revert', reverter.revert);

  let owned;
  let rgRegistryClone;
  let rgPermissionManagerClone;

  function bytesToString(bytes) {
    return web3.toAscii(bytes.split('00')[0]);
  }

  function icap(asset, institution, client) {
    return web3.eth.iban.fromBban(asset + institution + client).toString().padEnd(32, '0');
  }

  before('setup', function () {
    //registry contracts
    return deployHelperContracts(RGPermissionsManager, true)
      .then(contracts => {
        rgPermissionManagerClone = RGPermissionsManager.at(contracts.clone.address);
      })
      .then(() => deployHelperContracts(RGRegistry, true))
      .then(contracts => {
        rgRegistryClone = RGRegistry.at(contracts.clone.address)
        rgRegistryClone.constructRegistry(rgOwner)
        this.owned = rgRegistryClone
      })
      .then(() => rgRegistryClone.setupRGPermissionsManager(rgPermissionManagerClone.address))
      .then(() => rgPermissionManagerClone.assignRole(rgRegistryClone.address, 'register', rgOwner))
      .then(reverter.snapshot);
  });

  it('should be possible to register valid asset by registry contract owner', function () {
    return rgRegistryClone.registerAsset.call(asset, assetSymbol)
      .then(assert.isTrue)
      .then(() => rgRegistryClone.registerAsset(asset, assetSymbol))
      .then(result => {
        var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
        assert.equal(logs.length, 1);
        assert.equal(logs[0].event, 'AssetRegistered');
        assert.equal(logs[0].args.asset, asset);
        assert.equal(bytesToString(logs[0].args.symbol), assetSymbol);
      })
  });

  it('should NOT be possible to register invalid asset', function () {
    const invalidAsset = 'XG';

    return rgRegistryClone.registerAsset.call(invalidAsset, assetSymbol)
      .then(assert.isFalse)
      .then(() => rgRegistryClone.registerAsset(invalidAsset, assetSymbol))
      .then(result => {
        var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
        assert.equal(logs.length, 1);
        assert.equal(logs[0].event, 'Error');
        assert.equal(bytesToString(logs[0].args.error), 'Invalid asset length');
      })
  });

  it('should NOT be possible to register valid asset by non registry contract owner', function () {
    const notRgOwner = accounts[1];
    return rgRegistryClone.registerAsset.call(asset, assetSymbol, { from: notRgOwner })
      .then(assert.isFalse)
  });

  it('should NOT be possible to register registered asset', function () {
    return rgRegistryClone.registerAsset(asset, assetSymbol)
      .then(() => rgRegistryClone.registerAsset(asset, assetSymbol))
      .then(result => {
        var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
        assert.equal(logs.length, 1);
        assert.equal(logs[0].event, 'Error');
        assert.equal(bytesToString(logs[0].args.error), 'Asset already registered');
      })
  });

  it('should be possible to register valid institution of valid asset with register permission', function () {
    const recipient = accounts[1]
    return rgRegistryClone.registerAsset(asset, assetSymbol)
      .then(() => rgRegistryClone.registerInstitution.call(asset, institution, recipient))
      .then(assert.isTrue)
      .then(() => rgRegistryClone.registerInstitution(asset, institution, recipient))
      .then(result => {
        var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
        assert.equal(logs.length, 1);
        assert.equal(logs[0].event, 'InstitutionRegistered');
        assert.equal(logs[0].args.asset, asset);
        assert.equal(logs[0].args.institution, institution);
        assert.equal(logs[0].args.ethAddress, recipient);
      })
  });

  it('should NOT be possible to register institution without register permission', function () {
    const recipient = accounts[1]
    const notRegister = accounts[2]
    return rgRegistryClone.registerAsset(asset, assetSymbol)
      .then(() => rgRegistryClone.registerInstitution.call(asset, institution, recipient, { from: notRegister }))
      .then(assert.isFalse)
  });

  it('should NOT be possible to register institution with invalid asset', function () {
    const recipient = accounts[1]
    const invalidAsset = 'XG';
    return rgRegistryClone.registerAsset(asset, assetSymbol)
      .then(() => rgRegistryClone.registerInstitution.call(invalidAsset, institution, recipient))
      .then(assert.isFalse)
      .then(() => rgRegistryClone.registerInstitution(invalidAsset, institution, recipient))
      .then(result => {
        var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
        assert.equal(logs.length, 1);
        assert.equal(logs[0].event, 'Error');
        assert.equal(bytesToString(logs[0].args.error), 'Invalid asset length');
      })
  });

  it('should NOT be possible to register invalid institution', function () {
    const recipient = accounts[1]
    const invalidInstitution = '000';
    return rgRegistryClone.registerAsset(asset, assetSymbol)
      .then(() => rgRegistryClone.registerInstitution.call(asset, invalidInstitution, recipient))
      .then(assert.isFalse)
      .then(() => rgRegistryClone.registerInstitution(asset, invalidInstitution, recipient))
      .then(result => {
        var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
        assert.equal(logs.length, 1);
        assert.equal(logs[0].event, 'Error');
        assert.equal(bytesToString(logs[0].args.error), 'Invalid institution length');
      })
  });

  it('should NOT be possible to register institution with unregistered asset', function () {
    const recipient = accounts[1]
    return rgRegistryClone.registerInstitution.call(asset, institution, recipient)
      .then(assert.isFalse)
      .then(() => rgRegistryClone.registerInstitution(asset, institution, recipient))
      .then(result => {
        var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
        assert.equal(logs.length, 1);
        assert.equal(logs[0].event, 'Error');
        assert.equal(bytesToString(logs[0].args.error), 'Asset isn\'t registered');
      })
  });

  it('should NOT be possible to register registered institution', function () {
    const recipient = accounts[1]
    return rgRegistryClone.registerAsset(asset, assetSymbol)
      .then(() => rgRegistryClone.registerInstitution(asset, institution, recipient))
      .then(() => rgRegistryClone.registerInstitution.call(asset, institution, recipient))
      .then(asset.isFalse)
      .then(() => rgRegistryClone.registerInstitution(asset, institution, recipient))
      .then(result => {
        var logs = result.logs.filter(log => log.address == rgRegistryClone.address)
        assert.equal(logs.length, 1);
        assert.equal(logs[0].event, 'Error');
        assert.equal(bytesToString(logs[0].args.error), 'Institution already registered');
      })
  });

  it('should be possible to parse valid icap address', function () {
    const icapAddress = icap(asset, institution, '123456789')
    const recipient = accounts[1]
    return rgRegistryClone.registerAsset(asset, assetSymbol)
      .then(() => rgRegistryClone.registerInstitution(asset, institution, recipient))
      .then(() => rgRegistryClone.parse.call(icapAddress))
      .then(result => {
        assert.equal(recipient, result[0])
        assert.equal(assetSymbol, bytesToString(result[1]))
        assert.equal(true, result[2])
      })
  });

  it('should NOT be able to parse icap address of unregistered asset', function () {
    const icapAddress = icap(asset, institution, '123456789')
    return rgRegistryClone.parse.call(icapAddress)
      .then(result => {
        assert.equal(emptyAddress, result[0])
        assert.equal('', bytesToString(result[1]))
        assert.equal(false, result[2])
      })
  });

  it('should NOT be able to parse icap address of unregistered institution', function () {
    const icapAddress = icap(asset, institution, '123456789')
    return rgRegistryClone.registerAsset(asset, assetSymbol)
      .then(() => rgRegistryClone.parse.call(icapAddress))
      .then(result => {
        assert.equal(emptyAddress, result[0])
        assert.equal(assetSymbol, bytesToString(result[1]))
        assert.equal(false, result[2])
      })
  });

  it('should NOT be able to parse icap address with invalid country code', function () {
    const icapAddress = icap(asset, institution, '123456789')
    const invalidIcapAddress = 'Y' + icapAddress.substr(1)
    const recipient = accounts[1]
    return rgRegistryClone.registerAsset(asset, assetSymbol)
      .then(() => rgRegistryClone.registerInstitution(asset, institution, recipient))
      .then(() => rgRegistryClone.parse.call(invalidIcapAddress))
      .then(result => {
        assert.equal(emptyAddress, result[0])
        assert.equal('', bytesToString(result[1]))
        assert.equal(false, result[2])
      })
  });

  it('should NOT be able to parse icap address of invalid address length', function () {
    const icapAddress = icap(asset, institution, '123456789')
    const invalidIcapAddress = icapAddress.substr(0, icapAddress.length - 1) + '1'
    const recipient = accounts[1]
    return rgRegistryClone.registerAsset(asset, assetSymbol)
      .then(() => rgRegistryClone.registerInstitution(asset, institution, recipient))
      .then(() => rgRegistryClone.parse.call(invalidIcapAddress))
      .then(result => {
        assert.equal(emptyAddress, result[0])
        assert.equal('', bytesToString(result[1]))
        assert.equal(false, result[2])
      })
  });

  it('should NOT be able to parse icap address with invalid checksum', function () {
    const icapAddress = icap(asset, institution, '123456789')
    const invalidIcapAddress = icapAddress.substr(0, 2) + '00' + icapAddress.substr(4, icapAddress.length - 4)
    const recipient = accounts[1]
    return rgRegistryClone.registerAsset(asset, assetSymbol)
      .then(() => rgRegistryClone.registerInstitution(asset, institution, recipient))
      .then(() => rgRegistryClone.parse.call(invalidIcapAddress))
      .then(result => {
        assert.equal(emptyAddress, result[0])
        assert.equal('', bytesToString(result[1]))
        assert.equal(false, result[2])
      })
  });

  ownedBase(accounts);
});
