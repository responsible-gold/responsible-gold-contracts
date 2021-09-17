const Promise = require('bluebird');

module.exports = ((EToken, _gasPrice = '0') => {
  var web3 = EToken.web3;
  var eth = web3.eth;
  var sender;
  var $logs = undefined;

  var nowSeconds = function(){return (Date.now() / 1000);};
  
  var gasPrice = web3.toBigNumber(_gasPrice);

  var setPrivateKey = function(pk) {
    EToken.setPrivateKey(pk);
    address = EToken.privateToAddress(('0x' + pk).slice(-64));
    log('Your address(global variable `address`) to send transactions: ' + address);
    return address;
  };

  var privateKeyToAddress = function(pk) {
    return EToken.privateToAddress(('0x' + pk).slice(-64));
  };

  var checkBalance = function(sender) {
    return Promise.promisify(eth.getBalance)(sender, 'pending');
  }

  var log = function(message) {
    console.log(message);
  };

  var logWarning = function(message) {
    console.log('Warning: ' + message);
};

var logSuccess = function(gas, result, params) {
    console.log('Success! Gas used: ' + gas + ' result: ' + result + (params ? ' params: ' + params : ''));
};

var logFinish = function(logger) {
  if (logger) {
    _log('<hr/>', logger);
  }
  console.log('--------------------------------------------------------------------------------');
}

var delay = function(msec) {
  return Promise.delay(msec);
};

var logError = function(message, dontThrow) {
  if (dontThrow) {
    console.error(message);
    return;
  }
  throw message;
};

var getBalance = function(sender) {
  eth.getBalance(sender, 'pending', function(err, balance) {
    if (err) {
      throw err;
    }
    log(sender + ' address balance is ' + web3.fromWei(balance, 'ether').toString() + ' ETH');
  });
};

var getTransaction = function(txHash, tries = 40) {
  return new Promise((resolve, reject) => {
    try {
      if (tries === 0) {
        return reject(new Error(`Transaction ${txHash} not found.`));
      }
      eth.getTransaction(txHash, (e, tx) => {
        if (e) {
          return reject(e);
        }
        resolve(tx);
      });
    } catch(err) {
      reject(err);
    }
  }).then(tx => {
    if (tx) {
      return tx;
    }
    return delay(500)
    .then(() => {
      return getTransaction(txHash, tries - 1);
    });
  });
};

var waitTransactionEvaluation = function(txHash) {
  return getTransaction(txHash)
  .then(tx => {
    if (tx.blockNumber) {
      return true;
    }
    return getBlock('pending')
    .then(block => {
      if (block.transactions.indexOf(txHash) >= 0) {
        return true;
      }
      return delay(500).then(() => waitTransactionEvaluation(txHash));
    });
  })
};

var getBlock = Promise.promisify(eth.getBlock);

var smartDeployContract = function(args) {
  if (arguments.length === 0) {
    log('smartDeployContract({constructorArgs, bytecode, abi, sender, name, gas, nonce, waitReceipt, fastRun, deployedAddress});');
    return;
  }
  const constructorArgs = args.constructorArgs || [];
  const bytecode = args.bytecode;
  const abi = args.abi || [];
  const sender = args.sender;
  const name = args.name;
  const gas = args.gas;
  const nonce = args.nonce;
  const waitReceipt = args.waitReceipt;
  const fastRun = args.fastRun;
  const deployedAddress = args.deployedAddress;
  const params = {
    from: sender,
    data: bytecode[1] === 'x' ? bytecode : '0x' + bytecode,
    gas: gas || 3900000, // leave some space for other transactions
    gasPrice: gasPrice,
  };
  if (nonce !== undefined) {
    params.nonce = nonce;
  }
  let processed = false;
  if (deployedAddress) {
    return Promise.resolve(eth.contract(abi).at(deployedAddress));
  }
  return new Promise((resolve, reject) => {
    eth.contract(abi).new(
      ...constructorArgs,
      params,
      (e, contract) => {
        if (e) {
          return reject(e);
        }
        if (waitReceipt) {
          if (typeof contract.address != 'undefined') {
            log(`Contract mined! address: ${contract.address} transactionHash: ${contract.transactionHash}`);
            const res = eth.contract(abi).at(contract.address);
            res.transactionHash = contract.transactionHash;
            return resolve(res);
          } else {
            log(`Contract deployment transaction: ${contract.transactionHash}. Waiting for receipt.`);
          }
        } else {
          if (processed) {
            return;
          }
          processed = true;
          log(`Contract deployment transaction: ${contract.transactionHash}`);
          getTransaction(contract.transactionHash)
          .then(tx => {
            const result = eth.contract(abi).at(tx.creates);
            if (fastRun) {
              return result;
            }
            return waitTransactionEvaluation(contract.transactionHash)
            .then(() => result);
          }).then(resolve).catch(reject);
        }
      }
    );
  }).then(contract => {
    if (name) {
      window[name] = contract;
      log(`Deployed contract is accessible by '${name}' global variable.`);
    }
    return contract;
  });
};

var flowControl = function() {
  var STATES = { ready: 'ready', waiting: 'waiting', stopping: 'stopping' };
  var state = STATES.ready;
  return {
    get ready () {
      return state === STATES.ready;
    },
    get waiting () {
      return state === STATES.waiting;
    },
    get stopping () {
      return state === STATES.stopping;
    },
    get state () {
      return state;
    },
    stop: function() {
      if (state === STATES.waiting) {
        state = STATES.stopping;
      }
      return state;
    },
    continue: function() {
      if (state === STATES.waiting || state === STATES.stopping) {
        state = STATES.ready;
      }
      return state;
    },
    __wait__: function() {
      state = STATES.waiting;
      return state;
    }
  };
}();

var safeTransactionFunction = function(fun, params, sender, argsObject) {
  if (arguments.length === 0) {
    log('See safeTransaction(). To be used as part of safeTransactions().');
    return;
  }
  var merge = function(base, args) {
    var target = ['nonce', 'value', 'gasPrice', 'to', 'data'];
    if (args) {
      while(target.length > 0) {
        var arg = target.pop();
        if (args[arg]) {
          base[arg] = args[arg];
        }
      }
    }
    return base;
  };

  var processFunctionParams = function(paramsToProcess) {
    for (var i = 0; i < paramsToProcess.length; i++) {
      if (typeof paramsToProcess[i] === 'function') {
        paramsToProcess[i] = paramsToProcess[i]();
      }
    }
  };

  var waitReceiptTimeoutSeconds = 120;
  var gas = argsObject && argsObject.gas || 3000000;
  return function(testRun, fastRun) {
    processFunctionParams(params);
    return new Promise(function(resolve, reject) {
      var _params = params.slice(0);
      _params.push(merge({from: sender, gas: Math.max(3000000, gas), gasPrice: gasPrice}, argsObject));
      _params.push(function(err, result) {
        if (err) {
          if (err.toString().startsWith('Error: no contract code at given address')) {
            gas = argsObject && argsObject.gas || 21000;
            resolve(gas);
            return;
          }
          reject(err);
        } else {
          resolve(result);
        }
      });
      if (typeof fun.call === "string") {
        eth.estimateGas.apply(this, _params);
      } else {
        fun.estimateGas.apply(this, _params);
      }
    }).then(function(estimateGas) {
      return estimateGas;
      return new Promise(function(resolve, reject) {
        var _params = params.slice(0);
        if (estimateGas > gas) {
          reject('Estimate gas is too big: ' + estimateGas);
        } else if (typeof fun.call === "string" || fastRun || (argsObject && argsObject.ignoreCallResponse)) {
          // simple eth.sendTransaction
          resolve(estimateGas);
        } else {
          var repeater = function(tries, funcToCall, funcToCallArgs) {
            var _repeat = function() {
              if (tries-- === 0) {
                return false;
              }
              setTimeout(() => funcToCall.apply(null, funcToCallArgs), 500);
              return true;
            };
            return _repeat;
          };
          var repeat = repeater(100, fun.call, _params);
          _params.push(merge({from: sender, gas: gas, gasPrice: gasPrice}, argsObject));
          _params.push('pending');
          _params.push(function(err, result) {
            var success = typeof result.toNumber === 'function' ? result.toNumber() > 0 : result;
            if (err) {
              reject(err);
            } else {
              if (success) {
                resolve(estimateGas);
              } else {
                if (!repeat()) {
                  reject('Call with gas: ' + gas + ' returned ' + result.toString() + ' 40 times in a row.');
                }
              }
            }
          });
          repeat();
        }
      });
    }).then(function(estimateGas) {
      return new Promise(function(resolve, reject) {
        var _params = params.slice(0);
        _params.push(merge({from: sender, gas: gas, gasPrice: gasPrice}, argsObject));
        _params.push(function(err, result) {
          if (err) {
            reject(err);
          } else {
            resolve([result, estimateGas]);
          }
        });
        if (testRun || (argsObject && argsObject.testRun)) {
          resolve(['OK', estimateGas]);
          return;
        }
        fun.apply(this, _params);
      });
    }).then(function(result) {
      var value = (argsObject && argsObject.value) ? " value: " + web3.fromWei(argsObject.value.valueOf(), 'ether') + " ETH." : "";
      var to = (argsObject && argsObject.to) ? " to: " + argsObject.to : "";
      var nonce = (argsObject && argsObject.nonce !== undefined) ? " nonce: " + argsObject.nonce : "";
      logSuccess(result[1], result[0], params.join(', ') + to + value + nonce);
      if (testRun || (argsObject && argsObject.testRun)) {
        return [false, result[1]];
      }
      return new Promise(function(resolve, reject) {
        if (argsObject && argsObject.waitReceipt) {
          log('Waiting receipt for ' + result[0]);
          flowControl.__wait__();
          var startTime = nowSeconds();
          var timeoutTime = startTime + waitReceiptTimeoutSeconds;
          var waitReceipt = function(txHash) {
            web3.eth.getTransactionReceipt(txHash, function(err, receipt) {
              var secondsPassed = Math.round(nowSeconds() - startTime);
              if ((receipt && receipt.blockNumber) || flowControl.ready) {
                flowControl.continue();
                resolve([secondsPassed, result[1], result[0]]);
              } else {
                var message = 'No transaction receipt after ' + secondsPassed + ' seconds.';
                if (flowControl.stopping) {
                  flowControl.continue();
                  reject(message);
                  return;
                }
                if (nowSeconds() > timeoutTime) {
                  logWarning(message + " If you are sure that transaction is already mined do: flowControl.continue(); If you want to stop execution do: flowControl.stop();");
                  timeoutTime += 60;
                }
                setTimeout(function() { waitReceipt(txHash); }, 1000);
              }
            });
          };
          return waitReceipt(result[0]);
        }
        if (fastRun) {
          return resolve([false, result[1]]);
        }
        return waitTransactionEvaluation(result[0]).then(() => resolve([false, result[1]])).catch(reject);
      });
    }).then(function(results) {
      if (results[0]) {
        log('Mined in ' + results[0] + ' seconds.');
      }
      return [results[1], argsObject && argsObject.value, results[2]];
    });
  };
};

var safeTransaction = function(fun, params, sender, argsObject) {
  if (arguments.length === 0) {
    log('safeTransaction(contract.method, paramsArray, sender[, {testRun: true, ignoreCallResponse: true, waitReceipt: true, transactionObjParams}]);', $logs);
    return;
  }
  return safeTransactionFunction(fun, params, sender, argsObject)().then(result => {
    logFinish($logs);
    return result;
  });
};

var safeTransactions = function(...args) {
  var _safeTransactions = function(txFunctions, testRun, fastRun, cumulativeGasUsed, totalValueSpent) {
    if (arguments.length === 0) {
      log('safeTransactions(safeFunctionsArray[, testRun[, fastRun]]);');
      return Promise.resolve();
    }
    cumulativeGasUsed = cumulativeGasUsed || 0;
    totalValueSpent = totalValueSpent || 0;
    if (txFunctions.length === 0) {
      log('Done! Cumulative gas used: ' + cumulativeGasUsed + ', total value sent: ' + web3.fromWei(totalValueSpent, 'ether') + ' ETH.');
      logFinish($logs);
      return Promise.resolve();
    }
    return txFunctions.shift()(testRun, fastRun).then(function(gasUsedAndvalueSpent){
      var gasUsed = gasUsedAndvalueSpent && gasUsedAndvalueSpent[0] || 0;
      var valueSent = web3.toBigNumber(gasUsedAndvalueSpent && gasUsedAndvalueSpent[1] || 0);
      return _safeTransactions(txFunctions, testRun, fastRun, cumulativeGasUsed + gasUsed, valueSent.add(totalValueSpent));
    });
  };
  return _safeTransactions(...args)
  .catch(function(err) {
    logError(err, true);
    throw err;
  });
};

var syncFunction = function(fun) {
  if (arguments.length === 0) {
    log('syncFunction(function(testRun) {}); To be used as part of safeTransactions().');
    return;
  }
  return function(testRun) {
    return new Promise(function(resolve, _) {
      fun(testRun);
      resolve();
    });
  };
};

var safeSend = function(to, value, sender, argsObject) {
  if (arguments.length === 0) {
    log('safeSend(toAddress, valueInWei, sender[, {testRun: true, ignoreCallResponse: true, waitReceipt: true, transactionObjParams}]);', $logs);
    return;
  }
  return safeSendFunction(to, value, sender, argsObject)().then(function() {
    logFinish($logs);
  });
};

var safeSendFunction = function(to, value, sender, argsObject) {
  if (arguments.length === 0) {
    log('See safeSend(). To be used as part of safeTransactions().', $logs);
    return;
  }
  argsObject = argsObject || {};
  argsObject.value = argsObject.value || value;
  argsObject.to = argsObject.to || to;
  return safeTransactionFunction(eth.sendTransaction, [], sender, argsObject);
};

return {
  nowSeconds,
  setPrivateKey,
  privateKeyToAddress,
  getBalance,
  checkBalance,
  smartDeployContract,
  web3,
  eth,
  safeTransactionFunction,
  safeTransactions,
  syncFunction,
  safeTransaction,
  safeSend,
};

});