"use strict";
function increaseTime(time) {
  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [time],
            id: new Date().getTime()
        }, (error, result) => error ? reject(error) : resolve(result.result)
    )}
  );
}

module.exports = increaseTime;