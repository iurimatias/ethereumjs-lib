const bignum = require('bignum-browserify'),
  rlp = require('rlp'),
  utils = require('ethereumjs-util'),
  fees = require('./fees.js'),
  ecdsaOps = require('./ecdsaOps');

/**
 * Represents a transaction
 * @constructor
 * @param {Buffer|Array} data raw data, deserialized
 */
var Transaction = module.exports = function(data) {

  //default values
  this.raw = [
    new Buffer([]), //nonce
    new Buffer([0]), //gasPrice
    new Buffer([0]), //gasLimit
    new Buffer([]), //t0
    new Buffer([]), //value
    new Buffer([0]), //data
    new Buffer([0x1c]), //v
    utils.zeros(32), //r
    utils.zeros(32) //s
  ];

  if (data && data.toString() === '[object Object]') {
    var objData = data;
    data = null;
  }else if (data && !Array.isArray(data)) {
    data = rlp.decode(data);
  }

  if (!data) data = this.raw;

  this.parse(data);

  if (objData) {
    for (var i in objData) {
      this[i] = objData[i];
    }
  }
};

/**
 * parses a transactions
 * @method parse
 * @param {Array} data
 */
Transaction.prototype.parse = function(data) {
  var self = this,
    fields = [
      'nonce',
      'gasPrice',
      'gasLimit',
      'to',
      'value',
      'data',
      'v',
      'r',
      's'
    ];

  //make sure all the items are buffers
  data.forEach(function(d, i) {
    self.raw[i] = typeof d === 'string' ? new Buffer(d, 'hex') : d;
  });

  //an unsigned tx
  if (data.length !== 9 && data.length !== 6) {
    throw ('invalid number of fields in transaction data');
  }

  utils.validate(fields, this.raw);
  utils.defineProperties(this, fields);

  this.type = data[3].toString('hex') === '' ? 'contract' : 'message';

  Object.defineProperty(this, 'to', {
    set: function(v) {
      if (v && !Buffer.isBuffer(v)) {
        if (typeof v === 'string') {
          v = new Buffer(v, 'hex');
        } else {
          v = utils.intToBuffer(v);
        }
      }

      if (v && v.length !== 20) {
        throw 'The field `to` must have byte length of 20';
      }

      if (!v) {
        this.raw[3] = new Buffer([]);
        this.type = 'contract';
      } else {
        this.raw[3] = v;
        this.type = 'message';
      }
    }
  });
};

/**
 * Returns the rlp encoding of the transaction
 * @method serialize
 * @return {Buffer}
 */
Transaction.prototype.serialize = function() {
  return rlp.encode(this.raw);
};

/**
 * Computes a sha3-256 hash of the tx
 * @method hash
 * @param {Boolean} [true] signature - whether or not to inculde the signature
 * @return {Buffer}
 */
Transaction.prototype.hash = function(signature) {
  var toHash;

  if (typeof signature === 'undefined') {
    signature = true;
  }

  if (signature) {
    toHash = this.raw;
  } else {
    toHash = this.raw.slice(0, -3);
  }

  //create hash
  return utils.sha3(rlp.encode(toHash));
};

/**
 * gets the senders address
 * @method getSenderAddress
 * @return {Buffer}
 */
Transaction.prototype.getSenderAddress = function() {
  var pubKey = this.getSenderPublicKey();
  return utils.pubToAddress(pubKey);
};

/**
 * gets the senders public key
 * @method getSenderPublicKey
 * @return {Buffer}
 */
Transaction.prototype.getSenderPublicKey = ecdsaOps.txGetSenderPublicKey;

/**
 * @method verifySignature
 * @return {Boolean}
 */
Transaction.prototype.verifySignature = ecdsaOps.txVerifySignature;

/**
 * sign a transaction with a given a private key
 * @method sign
 * @param {Buffer} privateKey
 */
Transaction.prototype.sign = ecdsaOps.txSign;

/**
 * The amount of gas paid for the data in this tx
 * @method getDataFee
 * @return {bignum}
 */
Transaction.prototype.getDataFee = function() {
  var data = this.raw[5];
  var cost = bignum(0);
  for (var i = 0; i < data.length; i++) {
    if (data[i] === 0) {
      cost = cost.add(1);
    } else {
      cost = cost.add(5);
    }
  }

  return cost;
};

/**
 * the base amount of gas it takes to be a valid tx
 * @method getBaseFee
 * @return {bignum}
 */
Transaction.prototype.getBaseFee = function() {
  return this.getDataFee().add(bignum(fees.getFee('TRANSACTION')));
};

/**
 * the up front amount that an account must have for this transaction to be valid
 * @method getUpfrontCost
 * @return {bignum}
 */
Transaction.prototype.getUpfrontCost = function() {
  return bignum.fromBuffer(this.gasLimit)
    .mul(bignum.fromBuffer(this.gasPrice))
    .add(bignum.fromBuffer(this.value));
};

/**
 * validates the signature and checks to see if it has enough gas
 * @method validate
 * @return {Boolean}
 */
Transaction.prototype.validate = function() {
  return this.verifySignature() && (this.getBaseFee().toNumber() <= utils.bufferToInt(this.gasLimit));
};

/**
 * returns a JSON reprsetation of the transaction.
 * @method toJSON
 * @return {Object}
 */
Transaction.prototype.toJSON = function() {
  return utils.baToJSON(this.raw);
};
