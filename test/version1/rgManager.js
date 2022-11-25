"use strict";
const Reverter = require('../helpers/reverter');
const replaceAll = require('../helpers/replaceAll');
const RGManager = artifacts.require('./RGManagerPrototype_v1.sol');
const RGAssetOwnershipCardCloneFactory = artifacts.require('./RGAssetOwnershipCardCloneFactory.sol');
const RGAssetOwnershipCard = artifacts.require('./RGAssetOwnershipCardPrototype_v1.sol');
const ownedBase = require('../ownedBase');
const deployHelperContracts = require('../helpers/deployHelperContracts');

contract('RGManager v1', function(accounts) {
  const reverter = new Reverter(web3);
  const rgOwner = accounts[0];
  const chip1 = '20_symbols_ac_chip1';
  const chip2 = 'chip2';
  const chip3 = 'chip3';
  const placeholder = 'cafecafecafecafecafecafecafecafecafecafe';

  afterEach('revert', reverter.revert);

  let owned;
  let rGManagerRouter;
  let rGManagerClone;
  let rGAssetOwnershipCardCloneFactory;
  let rGAssetOwnershipCardClone;
  let rGAssetOwnershipCardResolver;

  function assertBalance(erc20Contract, balanceOwner, value) {
    return erc20Contract.balanceOf(balanceOwner)
    .then(result => assert.equal(result, value));
  }

  function bytesToString(bytes) {
    return web3.toAscii(bytes.split('00')[0]);
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
    //prepare RGManager
    .then(() => deployHelperContracts(RGManager, true))
    .then(contracts => {
      rGManagerRouter = contracts.router;
      rGManagerClone = RGManager.at(contracts.clone.address);
    })
    .then(() => rGManagerClone.constructRGManager(rgOwner, 8, rGAssetOwnershipCardCloneFactory.address))
    //setup for owned
    .then(() => RGManager.at(rGManagerClone.address))
    .then(instance => this.owned = instance)
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
    .then(result => assert.equal(bytesToString(result.logs[1].args.chip), chip1))
    .then(() => rGManagerClone.deploy(chip2, 1500, rgOwner))
    .then(result => assert.equal(bytesToString(result.logs[1].args.chip), chip2))
    .then(() => rGManagerClone.deploy(chip3, 2000, rgOwner))
    .then(result => assert.equal(bytesToString(result.logs[1].args.chip), chip3))
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
    let rgAssetOwnershipCardAddress
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

  it('should Emit Transfer event when user transfer to the another user', function() {
    const recipient = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(recipient, 400, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(logs[0].args.from, rgOwner);
      assert.equal(logs[0].args.to, recipient);
      assert.equal(logs[0].args.value, 400);
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
    
    return rGManagerClone.deploy(chip1, uint256, rgOwner)
    .then(() => rGManagerClone.transfer(approver, uint256, {from: rgOwner}))
    .then(() => rGManagerClone.approve(rgOwner, uint256, {from: approver}))
    .then(() => rGManagerClone.transferFrom(approver, accounts[3], uint256, {from: rgOwner}))
    .then(() => rGManagerClone.deploy(chip2, 1000, rgOwner))
    .then(() => rGManagerClone.approve(rgOwner, 1000, {from: approver}))
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

  it('should Emit Transfer event when approved user transferFrom to the another user', function() {
    const approver = accounts[1];
    
    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(() => rGManagerClone.transfer(approver, 1000, {from: rgOwner}))
    .then(() => rGManagerClone.approve(rgOwner, 1000, {from: approver}))
    .then(() => rGManagerClone.transferFrom(approver, accounts[3], 1000, {from: rgOwner}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(logs[0].args.from, approver);
      assert.equal(logs[0].args.to, accounts[3]);
      assert.equal(logs[0].args.value, 1000);
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
    .then(result => assert.equal(bytesToString(result.logs[1].args.chip), chip1))
    .then(() => rGManagerClone.deployWithoutGcoins(chip2, 1500, rgOwner))
    .then(result => assert.equal(bytesToString(result.logs[1].args.chip), chip2));
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
    .then(() => rGManagerClone.transfer(rgOwner, 200, {from: accounts[1]}))
    //transfer 100 coins from rgOwner to 1st receiver, AC2 coins should be sent from queue
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
    })
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

  it('should emit Transfer event and update balances when user transfers AC coins using callBack to RG Manager contract', function() {
    let RGACcontract;
    const recipient = accounts[1];

    return rGManagerClone.deploy(chip1, 1000, rgOwner)
    .then(result => RGAssetOwnershipCard.at(result.logs[1].args.rgAssetOwnershipCardAddress))
    .then(instance => RGACcontract = instance)
    .then(() => RGACcontract.transfer(recipient, 500))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(logs[0].args.from, rgOwner);
      assert.equal(logs[0].args.to, recipient);
      assert.equal(logs[0].args.value, 500);
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
    .then(() => RGACcontract.transferFrom(rgOwner, user, 500, {from: user}))
    .then(result => {
      var logs = result.logs.filter(log => log.address == rGManagerClone.address)
      assert.equal(logs.length, 1);
      assert.equal(logs[0].event, 'Transfer');
      assert.equal(logs[0].args.from, rgOwner);
      assert.equal(logs[0].args.to, user);
      assert.equal(logs[0].args.value, 500);
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
  })

  ownedBase(accounts);

});