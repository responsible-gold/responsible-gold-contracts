`use strict`

const deploy = require('../helpers/deployHelperContracts');
const SmartAccount = artifacts.require("RGSmartAccount_v10")
const SmartAccountManager = artifacts.require("RGSmartAccountManager_v10");
const MockERC20 = artifacts.require('Coin');

contract("SmartAccount & Manager", (accounts)=>{

    const owner = accounts[0];
    const someone = accounts[1];
    let account, manager;

    const resetAccount = (i) =>{
            it(`should reset account for ${i} users`, async()=>{
                let supply = (await account.totalSupply()).toNumber();
                let signers = [];
                let distribution = [];
                
                for(let j=0; j<i; j++){
                    signers.push(accounts[j]);
                    distribution.push(supply / i);
                }
                await manager.resetAccount("Test", signers, distribution, {from: owner});
            })
    }

    const distribute = (i) => {
        it(`should distribute ERC20 between ${i} users`, async()=>{
           const token = await MockERC20.new("MockERC20", "MRC20", 18, {from: owner});
           let supply = (await account.totalSupply()).toNumber();
           await token.transfer(account.address, await token.totalSupply(), {from: owner});
           await manager.distribute(token.address);
           for(j=0; j<i; j++){
            const balance = await token.balanceOf(accounts[i]);
            assert.equal(balance.toNumber(), supply/i);
           }
           
       })
    }

    const managerOpts = () =>{
        it("should not reset unexcisting account", async()=>{
            let supply = (await account.totalSupply()).toNumber();
            let signers = [];
            let distribution = [];
                
            for(let j=0; j<i; j++){
                signers.push(accounts[j]);
                distribution.push(supply / i);
            }
            assert.isFalse(await manager.resetAccount("Test", signers, distribution, {from: owner}));
        })

        it("should reset admin of account", async()=>{
            await manager.resetAdmin("Wrong name", someone, {from: owner});
            let accounts = await manager.myAccountsAdmin({from: someone});
            asset.isTrue(accounts[i]==account);
            accounts = await manager.myAccountsAdmin({from: owener});
        })

        it("should not reset admin of unexcisting account", async()=>{
            assert.isFalse(await manager.resetAdmin("Wrong name", someone, {from: owner}));
        })
    }

    it("should create account", async()=>{
        const contracts = await deploy(SmartAccountManager, true);
        manager = SmartAccountManager.at(contracts.clone.address);
        await manager.initAccount("Test", {from: owner})
        let accounts = await manager.myAccountsAdmin({from: owner});
        account = await SmartAccount.at(accounts[0]);
    })

    for(let i=1; i<10; i++){
        if(1000 % i > 0){
            continue;
        }
        resetAccount(i);
        distribute(i);
    }

    managerOpts();

})