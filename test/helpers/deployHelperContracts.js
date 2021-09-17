"use strict";
const replaceAll = require('./replaceAll');
const Router = artifacts.require('./Router.sol');
const Resolver = artifacts.require('./Resolver.sol');
const Clone = artifacts.require('./Clone.sol');
const placeholder = 'cafecafecafecafecafecafecafecafecafecafe';

function deployHelperContracts(rgPrototype, deployClone = false) {
  let contracts = {};

  return rgPrototype.new()
  .then(res => contracts.prototype = res)
  .then(() => Router.new())
  .then(res => contracts.router = res)
  .then(() => contracts.router.updateVersion(contracts.prototype.address))
  .then(() => {
    Resolver._json.unlinked_binary = replaceAll(Resolver._json.unlinked_binary, placeholder, contracts.router.address.slice(-40));
    return Resolver.new();
  })
  .then(res => contracts.resolver = res)
  .then(() => {
    //replace back
    Resolver._json.unlinked_binary = replaceAll(Resolver._json.unlinked_binary, contracts.router.address.slice(-40), placeholder);
  })
  .then(() => {
    if (deployClone) {
      Clone._json.unlinked_binary = replaceAll(Clone._json.unlinked_binary, placeholder, contracts.resolver.address.slice(-40));

      return Clone.new()
      .then(res => contracts.clone = res)
      .then(() => {
        //replace back
        Clone._json.unlinked_binary = replaceAll(Clone._json.unlinked_binary, contracts.resolver.address.slice(-40), placeholder);
      })
    }
  })
  .then(() => contracts);
}

module.exports = deployHelperContracts;
