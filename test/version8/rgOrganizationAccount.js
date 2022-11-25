"use strict";
const Reverter = require('../helpers/reverter');
const replaceAll = require('../helpers/replaceAll');
const RGAccount = artifacts.require('./RGAccountPrototype_v8.sol');
const RGOrganizationFactory = artifacts.require('./RGOrganizationFactory.sol');
const deployHelperContracts = require('../helpers/deployHelperContracts');
const ownedBase = require('../ownedBase');

contract('RGOrganizationAccount v8', function(accounts) {
  const reverter = new Reverter(web3);
  afterEach('revert', reverter.revert);
  const rgOwner = accounts[0];
  const placeholder = 'cafecafecafecafecafecafecafecafecafecafe';

  let owned;
  let rgOrganizationFactory;
  let rgAccountResolver;
  let rgAccountCloneAddress;
  let rgAccountCloneOwned;

  before('setup others', function() {
    return deployHelperContracts(RGAccount)
    .then(contracts => {
      rgAccountResolver = contracts.resolver;
    })
    //organization and account factory
    .then(() => {
      RGOrganizationFactory._json.unlinked_binary = replaceAll(RGOrganizationFactory._json.unlinked_binary, placeholder, rgAccountResolver.address.slice(-40));
      return RGOrganizationFactory.new();
    })
    .then(instance => rgOrganizationFactory = instance)

    //setup for owned
    .then(() => rgOrganizationFactory.deployAccount())
    .then(result => {
      rgAccountCloneAddress = result.logs[0].args.account;
    })
    .then(() => RGAccount.at(rgAccountCloneAddress))
    .then(instance => rgAccountCloneOwned = instance)
    .then(() => rgAccountCloneOwned.constructAccount(rgOwner))
    .then(instance => this.owned = rgAccountCloneOwned)
    .then(reverter.snapshot);
  });

  it('should be possible to set up organization account', function() {
    let accountAddress;
    let account;

    return rgOrganizationFactory.deployAccount()
    .then(result => {
      accountAddress = result.logs[0].args.account;
    })
    .then(() => RGAccount.at(accountAddress))
    .then(instance => account = instance)
    .then(() => account.constructAccount.call(rgOwner))
    .then(assert.isTrue);
  });

  ownedBase(accounts);

});