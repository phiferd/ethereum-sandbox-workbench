var Pudding = require('ether-pudding');
var Sandbox = require('ethereum-sandbox-client');
var helper = require('ethereum-sandbox-helper');

var Workbench = function() {
  this.sandbox = new Sandbox('http://localhost:8554');
  this.readyContracts = {};
};

Workbench.prototype.compile = function(contracts, dir, cb) {
  var output = helper.compile(dir, contracts);
  var ready = {};
  Object.keys(output.contracts).forEach(contractName => {
    var contract = output.contracts[contractName];
    var contractData = {
      abi: JSON.parse(contract.interface),
      unlinked_binary: '0x' + contract.bytecode
    };
    ready[contractName] = Pudding.whisk(contractName, contractData);
  });
  if (cb) cb(ready);
  return ready;
};

Workbench.prototype.start = function(contracts, cb) {
  var self = this;
  this.sandbox.start(__dirname + '/ethereum.json', function () {
    Object.keys(contracts).forEach(contractName => {
      contracts[contractName].setProvider(self.sandbox.web3.currentProvider);
    });
    cb();
  });
};

Workbench.prototype.stop = function(cb) {
  this.sandbox.stop(cb);
};

Workbench.prototype.startTesting = function(contracts, dir, cb) {
  var self = this;
  if (typeof dir === 'function') {
    cb = dir;
    dir = null;
  }
  if (typeof contracts === 'string') contracts = [contracts];
  contracts = contracts.map(x => x + '.sol');
  if (!dir) dir = './contract';

  this.readyContracts = this.compile(contracts, dir);

  var name = '[' + contracts.join(', ') + '] Contracts Testing';
  describe(name, function() {
    this.timeout(60000);
    before(function(done) {
      self.start(self.readyContracts, done);
    });
    after(function(done) {
      self.stop(done);
    });
    cb(self.readyContracts);
  });
};

Workbench.prototype.waitForReceipt = function (txHash) {
  var self = this;
  return new Promise((resolve, reject) => {
    helper.waitForReceipt(self.sandbox.web3, txHash, function (err, receipt) {
      if (err) return reject(err);
      receipt.logs.forEach(eventLog => {
        for (var key in self.readyContracts) {
          eventLog.parsed = helper.parseEventLog(self.readyContracts[key].abi, eventLog);
          if (eventLog.parsed) break;
        }
      });
      return resolve(receipt);
    });
  });
};

Workbench.prototype.sendTransaction = function (options) {
  var self = this;
  return new Promise((resolve, reject) => {
    return self.sandbox.web3.eth.sendTransaction(options, function (err, txHash) {
      if (err) return reject(err);
      return resolve(txHash);
    });
  });
};

module.exports = Workbench;
