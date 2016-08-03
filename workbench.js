var path = require('path');
var fs = require('fs');

var Pudding = require('ether-pudding');
var Sandbox = require('ethereum-sandbox-client');
var helper = require('ethereum-sandbox-helper');

function configureState(options, ethereumJsonPath) {
  var state;
  if (options.initialState) {
    console.log('Using initialState from options');
    state = {
      contracts: 'contracts',
      env: options.initialState
    };
    fs.writeFileSync(ethereumJsonPath, JSON.stringify(state));
  }

  if (!fs.existsSync(ethereumJsonPath)) {
    console.log('Ethereum json doesn\'t exist, generating');
    var defaultAccount = '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826';
    if (options.defaults && options.defaults.from) defaultAccount = options.defaults.from;
    state = {
      contracts: 'contracts',
      env: {
        block: {
          coinbase: defaultAccount,
          difficulty: '0x0100',
          gasLimit: 314159200,
          gasPrice: 600000000
        },
        accounts: {}
      }
    };
    state.env.accounts[defaultAccount] = {
      name: 'fellow-1',
      balance: 1000000000000000000000000,
      nonce: '1430',
      pkey: 'cow',
      default: true
    };
    fs.writeFileSync(ethereumJsonPath, JSON.stringify(state));
  }
}

var Workbench = function(options) {
  this.sandbox = new Sandbox('http://localhost:8554');
  this.readyContracts = {};
  if (!options) options = {};
  this.defaults = options.defaults;
  this.contractsDirectory = options.contratcsDirectory;
  this.ethereumJsonPath = path.dirname(module.parent.filename) + '/ethereum.json';
  if (options.ethereumJsonPath) this.ethereumJsonPath = options.ethereumJsonPath;
  configureState(options, this.ethereumJsonPath);
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
  this.sandbox.start(this.ethereumJsonPath, function (err) {
    if (err) return cb(err);
    Object.keys(contracts).forEach(contractName => {
      contracts[contractName].setProvider(self.sandbox.web3.currentProvider);
      if (self.defaults) contracts[contractName].defaults(self.defaults);
    });
    cb();
  });
};

Workbench.prototype.stop = function(cb) {
  this.sandbox.stop(cb);
};

Workbench.prototype.startTesting = function(contracts, cb) {
  var self = this;
  if (typeof contracts === 'string') contracts = [contracts];
  contracts = contracts.map(x => x + '.sol');
  var dir = this.contractsDirectory;
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
    if (cb) cb(self.readyContracts);
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

Workbench.prototype.waitForSandboxReceipt = function (txHash) {
  var self = this;
  return new Promise((resolve, reject) => {
    helper.waitForSandboxReceipt(self.sandbox.web3, txHash, function (err, receipt) {
      if (err) return reject(err);
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
