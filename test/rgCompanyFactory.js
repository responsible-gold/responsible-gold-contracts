"use strict";
const Reverter = require('./helpers/reverter');
const replaceAll = require('./helpers/replaceAll');
const RGOrganizationFactory = artifacts.require('./RGOrganizationFactory.sol');
const RGOrganization = artifacts.require('./RGOrganizationPrototype_v9.sol');
const RGAccount = artifacts.require('./RGAccountPrototype_v9.sol');
const deployHelperContracts = require('./helpers/deployHelperContracts');

contract('RGOrganizationFactory', function(accounts) {
  const reverter = new Reverter(web3);
  afterEach('revert', reverter.revert);
  const rgOwner = accounts[0];
  const placeholder = 'cafecafecafecafecafecafecafecafecafecafe';
  const placeholder2 = 'fefefefefefefefefefefefefefefefefefefefe';

  let rgOrganizationFactory;
  let rgAccountResolver;
  let rgOrganizationResolver;

  function bytesToString(bytes) {
    return web3.toAscii(bytes.split('00')[0]);
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
    //organization and account factory
    .then(() => {
      RGOrganizationFactory._json.unlinked_binary = replaceAll(RGOrganizationFactory._json.unlinked_binary, placeholder, rgAccountResolver.address.slice(-40));
      RGOrganizationFactory._json.unlinked_binary = replaceAll(RGOrganizationFactory._json.unlinked_binary, placeholder2, rgOrganizationResolver.address.slice(-40));
      return RGOrganizationFactory.new();
    })
    .then(instance => rgOrganizationFactory = instance)
  });

  it('should be possible deploy organization account', function() {
      return rgOrganizationFactory.deployAccount()
      .then(result => {
        assert.equal(result.logs.length, 1);
        assert.equal(result.logs[0].event, 'AccountDeployed');
        assert.equal(web3.isAddress(result.logs[0].args.account), true);
      });
  });

  it('should be possible to deploy organization contracts', function() {
    return rgOrganizationFactory.deployOrganization.call(rgOwner)
    .then(assert.isTrue)
    .then(() => rgOrganizationFactory.deployOrganization(rgOwner))
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'OrganizationDeployed');
      assert.equal(web3.isAddress(result.logs[0].args.organization), true);
    });
  });

});