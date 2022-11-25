"use strict";
const Reverter = require('../helpers/reverter');
const replaceAll = require('../helpers/replaceAll');
const RGManager1 = artifacts.require('./RGManagerPrototype_v1.sol');
const RGManager = artifacts.require('./RGManagerPrototype_v2.sol');
const RGAssetOwnershipCardCloneFactory = artifacts.require('./RGAssetOwnershipCardCloneFactory.sol');
const RGAssetOwnershipCard1 = artifacts.require('./RGAssetOwnershipCardPrototype_v1.sol');
const RGAssetOwnershipCard = artifacts.require('./RGAssetOwnershipCardPrototype_v2.sol');
const deployHelperContracts = require('../helpers/deployHelperContracts');
const ownedBase = require('../ownedBase');

contract('chipMigration v2', function(accounts) {
  const reverter = new Reverter(web3);
  const rgOwner = accounts[0];
  const chip1 = '20_symbols_ac_chip1';
  const chip2 = 'chip2';
  const newChip1 = '40_symbols_ac_chip_40_symbols_ac_chip1';
  const newChip2 = '40_symbols_ac_chip_40_symbols_ac_chip2';
  const placeholder = 'cafecafecafecafecafecafecafecafecafecafe';

  afterEach('revert', reverter.revert);
  let owned;
  let rGManagerRouter;
  let rGManagerClone;
  let rGAssetOwnershipCardCloneFactory;
  let rgManagerPrototype;
  let rGAssetOwnershipCardRouter;
  let rGAssetOwnershipCardClone;
  let rGAssetOwnershipCardResolver;
  let rGAssetOwnershipCard;

  function assertBalance(erc20Contract, balanceOwner, value) {
    return erc20Contract.balanceOf(balanceOwner)
    .then(result => assert.equal(result, value));
  }

  function bytesToString(bytes) {
    return web3.toAscii(bytes.split('00')[0]);
  }

  before('Setup', function() {
   //prepare RGAssetOwnershipCard
   return deployHelperContracts(RGAssetOwnershipCard1)
   .then(contracts => {
     rGAssetOwnershipCardRouter = contracts.router;
     rGAssetOwnershipCardResolver = contracts.resolver;
   })
   .then(() => {
     RGAssetOwnershipCardCloneFactory._json.unlinked_binary = replaceAll(RGAssetOwnershipCardCloneFactory._json.unlinked_binary, placeholder, rGAssetOwnershipCardResolver.address.slice(-40));
     return RGAssetOwnershipCardCloneFactory.new()
   })
   .then(instance => rGAssetOwnershipCardCloneFactory = instance)
   //prepare RGManager
   .then(() => deployHelperContracts(RGManager1, true))
   .then(contracts => {
     rGManagerRouter = contracts.router;
     rGManagerClone = RGManager1.at(contracts.clone.address);
   })
   .then(() => rGManagerClone.constructRGManager(rgOwner, 8, rGAssetOwnershipCardCloneFactory.address))
   //setup for owned
   .then(() => RGManager.at(rGManagerClone.address))
   .then(instance => this.owned = instance)
   .then(reverter.snapshot);
  });

  it('should be possible to migrate old chips', function() {
    let rgac1Address;
    let rgac2Address;
    let rGManagerCloneLatest;

    //deploy chips before migration
    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => assert.equal(bytesToString(result.logs[1].args.chip), chip1))
    .then(() => rGManagerClone.rGAssetOwnershipCardChips(chip1))
    .then(instance => rgac1Address = instance)
    .then(() => rGManagerClone.deploy(chip2, 2000, rgOwner))
    .then(result => assert.equal(bytesToString(result.logs[1].args.chip), chip2))
    .then(() => rGManagerClone.rGAssetOwnershipCardChips(chip2))
    .then(instance => rgac2Address = instance)
    //update prototypes to the latest version
    .then(() => RGManager.at(rGManagerClone.address))
    .then(instance => rGManagerCloneLatest = instance)
    .then(() => RGManager.new())
    .then(instance => rgManagerPrototype = instance)
    .then(() => rGManagerRouter.updateVersion(rgManagerPrototype.address))
    .then(() => RGAssetOwnershipCard.new())
    .then(instance => rGAssetOwnershipCard = instance)
    .then(() => rGAssetOwnershipCardRouter.updateVersion(rGAssetOwnershipCard.address))
    //make chips migration
    .then(() => rGManagerCloneLatest.migrationSetMigrationLock(true))
    .then(() => rGManagerCloneLatest.migrationMigrateChips.call(chip1, newChip1))
    .then(assert.isTrue)
    .then(() => rGManagerCloneLatest.migrationMigrateChips(chip1, newChip1))
    .then(() => rGManagerCloneLatest.migrationMigrateChips.call(chip2, newChip2))
    .then(assert.isTrue)
    .then(() => rGManagerCloneLatest.migrationMigrateChips(chip2, newChip2))
    .then(() => rGManagerCloneLatest.migrationSetMigrationLock(false))
    .then(() => rGManagerCloneLatest.underMigration())
    .then(assert.isFalse)
    //get RGAC addresses by new chips
    .then(() => rGManagerCloneLatest.getAddressByChip(newChip1))
    .then(chipAddress => assert.equal(chipAddress, rgac1Address))
    .then(() => rGManagerCloneLatest.getAddressByChip(newChip2))
    .then(chipAddress => assert.equal(chipAddress, rgac2Address));
  });

  it('should throw an error when rg owner is trying to migrate old chip twice', function() {
    let rgac1Address;
    let rGManagerCloneLatest;

    //deploy chips before migration
    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => assert.equal(bytesToString(result.logs[1].args.chip), chip1))
    .then(() => rGManagerClone.rGAssetOwnershipCardChips(chip1))
    .then(instance => rgac1Address = instance)
    //update prototypes to the latest version
    .then(() => RGManager.at(rGManagerClone.address))
    .then(instance => rGManagerCloneLatest = instance)
    .then(() => RGManager.new())
    .then(instance => rgManagerPrototype = instance)
    .then(() => rGManagerRouter.updateVersion(rgManagerPrototype.address))
    .then(() => RGAssetOwnershipCard.new())
    .then(instance => rGAssetOwnershipCard = instance)
    .then(() => rGAssetOwnershipCardRouter.updateVersion(rGAssetOwnershipCard.address))
    //make chips migration
    .then(() => rGManagerCloneLatest.migrationSetMigrationLock(true))
    .then(() => rGManagerCloneLatest.migrationMigrateChips.call(chip1, newChip1))
    .then(assert.isTrue)
    .then(() => rGManagerCloneLatest.migrationMigrateChips(chip1, newChip1))
    .then(() => rGManagerCloneLatest.migrationMigrateChips(chip1, newChip2))
    .then(result => {
        assert.equal(result.logs.length, 1);
        assert.equal(bytesToString(result.logs[0].args.error), 'Chip is migrated or missing');
    });
  });

  it('should emit MigrationStatusSet event when migration starts or finish', function() {
    let rGManagerCloneLatest;

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => assert.equal(bytesToString(result.logs[1].args.chip), chip1))
    .then(() => RGManager.at(rGManagerClone.address))
    .then(instance => rGManagerCloneLatest = instance)
    .then(() => RGManager.new())
    .then(instance => rgManagerPrototype = instance)
    .then(() => rGManagerRouter.updateVersion(rgManagerPrototype.address))
    .then(() => RGAssetOwnershipCard.new())
    .then(instance => rGAssetOwnershipCard = instance)
    .then(() => rGAssetOwnershipCardRouter.updateVersion(rGAssetOwnershipCard.address))
    .then(() => rGManagerCloneLatest.migrationSetMigrationLock(true))
    .then(result => {
        assert.equal(result.logs.length, 1);
        assert.equal(result.logs[0].event, 'MigrationStatusSet');
        assert.equal(result.logs[0].args.value, true);
    })
    .then(() => rGManagerCloneLatest.migrationSetMigrationLock(false))
    .then(result => {
        assert.equal(result.logs.length, 1);
        assert.equal(result.logs[0].event, 'MigrationStatusSet');
        assert.equal(result.logs[0].args.value, false);
    });
  })

  it('should not be possible to transfer GCoins if system is under migration', function() {
    const receiver = accounts[1];
    let rGManagerCloneLatest;

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => assert.equal(bytesToString(result.logs[1].args.chip), chip1))
    .then(() => RGManager.at(rGManagerClone.address))
    .then(instance => rGManagerCloneLatest = instance)
    .then(() => RGManager.new())
    .then(instance => rgManagerPrototype = instance)
    .then(() => rGManagerRouter.updateVersion(rgManagerPrototype.address))
    .then(() => RGAssetOwnershipCard.new())
    .then(instance => rGAssetOwnershipCard = instance)
    .then(() => rGAssetOwnershipCardRouter.updateVersion(rGAssetOwnershipCard.address))
    .then(() => rGManagerCloneLatest.migrationSetMigrationLock(true))
    .then(() => assertBalance(rGManagerCloneLatest, receiver, 0))
    .then(() => rGManagerCloneLatest.transfer(receiver, 1, {from: rgOwner}))
    .then(result => {
        assert.equal(result.logs.length, 1);
        assert.equal(bytesToString(result.logs[0].args.error), 'Contract is under migration');
    })
    .then(() => assertBalance(rGManagerCloneLatest, receiver, 0));
  })

});