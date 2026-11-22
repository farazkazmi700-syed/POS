'use strict';

const crypto = require('node:crypto');

function mongoIdToUuid(oid) {
  const hex = String(oid).toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(hex)) throw new TypeError('Invalid MongoDB ObjectId');
  const NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  const nsBytes = NS.replace(/-/g, '').match(/.{2}/g).map(b => parseInt(b, 16));
  const hash = crypto.createHash('sha1')
    .update(Buffer.from(nsBytes))
    .update(hex)
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.slice(0, 16).toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

module.exports = { mongoIdToUuid };
