"use strict";
const Owned = artifacts.require('./OwnedPrototype.sol');

module.exports = accounts => {
  const rgOwner = accounts[0];

  it('Contract owner should be set by default', function() {
    return this.owned.contractOwner()
    .then(result => assert.equal(result, accounts[0]));
  });

  it('Contract pending owner should Not be set by default', function() {
    return this.owned.pendingContractOwner()
    .then(result => assert.equal(result, '0x0000000000000000000000000000000000000000'));
  });

  it('should be possible to change contract ownership for contract owner', function() {
    return this.owned.changeContractOwnership.call(accounts[1], {from: rgOwner})
    .then(assert.isTrue);
  });

  it('should NOT be possible to change contract ownership for not contract owner', function() {
    return this.owned.changeContractOwnership.call(accounts[1], {from: accounts[2]})
    .then(assert.isFalse);
  });

  it('should be possible to claim contract ownership for pending contract owner', function() {
    return this.owned.changeContractOwnership(accounts[1])
    .then(() => this.owned.claimContractOwnership.call({from: accounts[1]}))
    .then(assert.isTrue);
  });

  it('should emit PendingOwnerSet event when owner hange contract ownership for contract owner', function() {
    return this.owned.changeContractOwnership(accounts[1])
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].event, 'PendingOwnerSet');
      assert.equal(result.logs[0].args.pendingOwner, accounts[1]);
    });

  });

  it('should be possible to get pending contract owner if changeContractOwnership has been called', function() {
    return this.owned.changeContractOwnership(accounts[1])
    .then(() => this.owned.pendingContractOwner())
    .then(result => assert.equal(result, accounts[1]));
  });

  it('pending contract should be deleted when contract owner is changed', function() {
    return this.owned.changeContractOwnership(accounts[1])
    .then(() => this.owned.claimContractOwnership({from: accounts[1]}))
    .then(() => this.owned.pendingContractOwner())
    .then(result => assert.equal(result, '0x0000000000000000000000000000000000000000'));
  });

  it('should emit OwnerChanged event when owner change contract ownership for contract owner', function() {
    return this.owned.changeContractOwnership(accounts[1])
    .then(() => this.owned.claimContractOwnership({from: accounts[1]}))
    .then(result => {
      assert.equal(result.logs[0].event, 'OwnerChanged');
      assert.equal(result.logs[0].args.newOwner, accounts[1]);
    });
  });

};