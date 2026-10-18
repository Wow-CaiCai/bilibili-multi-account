const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');
const { generateKeyPairSync, webcrypto } = require('node:crypto');
const bundle = require('./helpers/bundle.cjs');

const source = bundle(`
  import { createLoginRSA } from './src/vendor/jsencrypt.js';
  import { createLoginQR } from './src/vendor/qrcode.js';
  globalThis.factories = { createLoginRSA, createLoginQR };
`);

test('isolated login vendors still generate QR codes and encrypt credentials', () => {
  const context = vm.createContext({ console, navigator: {}, crypto: webcrypto });
  context.window = context;
  context.self = context;
  vm.runInContext(source, context);
  const qr = context.factories.createLoginQR()(0, 'M');
  qr.addData('https://passport.bilibili.com/fixture');
  qr.make();
  assert.ok(qr.getModuleCount() > 0);
  assert.equal(typeof qr.isDark(0, 0), 'boolean');
  const RSA = context.factories.createLoginRSA();
  const rsa = new RSA();
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  rsa.setPrivateKey(privateKey);
  const encrypted = rsa.encrypt('fixture-password');
  assert.equal(typeof encrypted, 'string');
  assert.equal(rsa.decrypt(encrypted), 'fixture-password');
  assert.equal(context.JSEncrypt, undefined);
  assert.equal(context.qrcode, undefined);
});
