const rlp = require('rlp'),
  utils = require('ethereumjs-util'),
  bignum = require('bignum-browserify');

/**
 * Represents a Block Header
 * @constructor
 * @param {Array} data raw data, deserialized
 */
var BlockHeader = module.exports = function(data) {
  var self = this,
    fields = [{
        name: 'parentHash',
        length: 32
      },
      'uncleHash', {
        name: 'coinbase',
        length: 20
      }, {
        name: 'stateRoot',
        length: 32
      },
      'transactionsTrie',
      'receiptTrie',
      'bloom',
      'difficulty',
      'number',
      'gasLimit',
      'gasUsed',
      'timestamp',
      'extraData', {
        name: 'nonce',
        length: 32
      }
    ];

  this.raw = [];

  if (!data || data.length === 0) {
    //set defaults
    data = [
      utils.zeros(32), //parent
      utils.SHA3_RLP_ARRAY, //uncles
      utils.zeros(20), //coinbase
      utils.zeros(32), //state root
      utils.SHA3_RLP, //trasacntionsTrie Root
      utils.SHA3_RLP, //RecieptTrie Root
      utils.zeros(64), //bloom
      new Buffer('020000', 'hex'), //difficulty
      new Buffer([]), //number
      utils.intToBuffer(1000000), //gasLimit
      new Buffer([]), //gasUsed
      new Buffer([]), //timestamp
      new Buffer([]), //extraData
      utils.sha3(new Buffer([42])) //nonce
    ];
  }

  //make sure all the items are buffers
  data.forEach(function(d, i) {
    self.raw[i] = typeof d === 'string' ? new Buffer(d, 'hex') : d;
  });

  utils.validate(fields, this.raw);
  utils.defineProperties(this, fields);
};

/**
 * @method validatePOW
 */
BlockHeader.prototype.validatePOW = function() {
  var raw = this.raw.slice(0, -1),
    i = utils.sha3(rlp.encode(raw)),
    a = Buffer.concat([i, this.nonce]),
    pow = bignum.fromBuffer(utils.sha3(a));
    //2^256

  return pow.lt(utils.TWO_POW256.div(bignum.fromBuffer(this.difficulty)));
};

BlockHeader.prototype.canonicalDifficulty = function(parentBlock) {
  var blockTs = utils.bufferToInt(this.timestamp),
    parentTs = utils.bufferToInt(parentBlock.header.timestamp),
    parentDif = utils.bufferToInt(parentBlock.header.difficulty),
    dif;

  if (blockTs < parentTs + 5) {
    dif = parentDif + Math.floor(parentDif / 1024);
  } else {
    dif = parentDif - Math.floor(parentDif / 1024);
  }
  return dif;
};

//check the block for the canical difficulty
BlockHeader.prototype.validateDifficulty = function(parentBlock) {
  var dif = this.canonicalDifficulty(parentBlock);
  return dif === utils.bufferToInt(this.difficulty);
};

BlockHeader.prototype.canonicalGaslimit = function(parentBlock) {
  var pGasLim = utils.bufferToInt(parentBlock.header.gasLimit),
    pGasUsed = utils.bufferToInt(parentBlock.header.gasUsed),
    gasLimit = Math.floor((1023 * pGasLim + Math.floor(6 / 5 * pGasUsed)) / 1024);

  if (gasLimit < 125000) {
    gasLimit = 125000;
  }
  return gasLimit;
};

BlockHeader.prototype.validateGasLimit = function(parentBlock) {
  var gasLimit = this.canonicalGaslimit(parentBlock);
  return utils.bufferToInt(this.gasLimit) === gasLimit;
};

/**
 * Validates the entire block headers
 * @method validate
 * @param {Blockchain} blockChain the blockchain that this block is validating against
 * @param {Bignum} [height] if this is an uncle header, this is the height of the block that is including it
 * @param {Function} cb the callback function
 */
BlockHeader.prototype.validate = function(blockchain, height, cb) {

  if (arguments.length === 2) {
    cb = height;
    height = false;
  }

  var self = this;

  //find the blocks parent
  blockchain.getBlock(self.parentHash, function(err, parentBlock) {

    self.parentBlock = parentBlock;

    if (height) {
      var dif = height.sub(bignum.fromBuffer(parentBlock.header.number));
      if (!(dif.lt(8) && dif.gt(1))) {
        err = 'uncle block has a parent that is too old or to young';
      }
    }

    if (
      //make sure uncles parents are between 1 and 8 blocks back
      self.validateDifficulty(parentBlock) &&
      self.validateGasLimit(parentBlock) &&
      self.validatePOW() &&
      (utils.bufferToInt(self.timestamp) >= utils.bufferToInt(parentBlock.header.timestamp)) &&
      (self.extraData.length < 1024) && !err) {
      cb();
    } else {
      cb('invalid block');
    }
  });
};

BlockHeader.prototype.hash = function() {
  return utils.sha3(rlp.encode(this.raw));
};
