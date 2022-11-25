`use strict`
const deployHelperContracts = require('../helpers/deployHelperContracts');
const SmartAccount = artifacts.require("RGSmartAccount_v10")
const SmartAccountManager = artifacts.require("RGSmartAccountManager_v10");
const MockERC20 = artifacts.require('Coin');

contract("SmartAccount & Manager", (accounts)=>{
    const owner = accounts[0];
    const someone = accounts[1];
    let account, manager;

    const reset = (i) =>{
            it(`should reset account and distribute for ${i} users`, async()=>{
                let supply = (await account.totalSupply()).toNumber();
                let signers = [];
                let distribution = [];
                
                for(let j=0; j<i; j++){
                    signers.push(accounts[j]);
                    distribution.push(supply / i);
                }
                await manager.resetAccount("Test", signers, distribution, {from: owner});
                for(let j=0; j<i; j++){
                    await assert.isTrue(await account.isSigner(accounts[j]))
                }
                await assert.equal((await account.totalSigners()).toNumber(), i);
                for(j=0; j<i; j++){
                    const balance = await account.balanceOf(accounts[j]);
                    await assert.equal(balance.toNumber(), supply/i);
                }
                const token = await MockERC20.new("MockERC20", "MRC20", 18, {from: owner});
                supply = (await account.totalSupply()).toNumber();
                await token.mint(account.address, await account.totalSupply(), {from: owner});
                let rgsaBalance = await token.balanceOf(account.address);
                await assert.equal(rgsaBalance.toNumber(), (await account.totalSupply()).toNumber());
                //await manager.distribute(token.address);
                const tx = await account.distribute(token.address)
                rgsaBalance = await token.balanceOf(accounts[i]);
                await assert.equal(rgsaBalance.toNumber(), 0);
                for(j=0; j<i; j++){
                    const balance = await token.balanceOf(accounts[j]);
                    await assert.equal(balance.toNumber(), supply/i);
                } 
            });
    }

    const managerOpts = () =>{
        it("should not reset unexcisting account", async()=>{
            let supply = (await account.totalSupply()).toNumber();
            let signers = [];
            let distribution = [];
                
            for(let j=0; j<10; j++){
                signers.push(accounts[j]);
                distribution.push(supply / 10);
            }
            const tx = await manager.resetAccount("Wrong name", signers, distribution, {from: owner});
            await assert.equal(tx.logs[0].event, 'Error');
        })

        it("should reset admin of account", async()=>{
            await manager.resetAdmin("Test", someone, {from: owner});
            let accounts = await manager.myAccountsAdmin({from: someone});
            await assert.isTrue(accounts[0]==account.address);
            accounts = await manager.myAccountsAdmin({from: owner});
            await assert.isFalse(accounts[0]==account.address);
        })

        it("should not reset admin of unexcisting account", async()=>{
            const tx = await manager.resetAdmin("Wrong name", someone, {from: owner});
            await assert.equal(tx.logs[0].event, 'Error');
        })
    }

    it("should create account", async()=>{
        const contracts = await deployHelperContracts(SmartAccountManager, true);
        manager = SmartAccountManager.at(contracts.clone.address);
        await manager.initAccount("Test", {from: owner})
        let accounts = await manager.myAccountsAdmin({from: owner});
        account = await SmartAccount.at(accounts[0]);
        await assert.equal((await account.totalSigners()).toNumber(), 1);
    })

    for(let i=1; i<6; i++){
        if(1000 % i > 0){
            continue;
        }
        reset(i);
    }
    managerOpts();
})