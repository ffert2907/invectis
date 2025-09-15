import { randomBytes, createHmac } from 'crypto';
import aesjs from 'aes-js';
import { encrypt, decrypt } from 'ecies-lite';
import { logger } from './config.js';

/**
 * Encrypts a payload for a recipient using an envelope encryption scheme.
 *
 * @param {Buffer|Uint8Array} payload - The data to encrypt.
 * @param {Buffer|Uint8Array} recipientPublicKey - The recipient's raw public key.
 * @returns {{iv: string, encryptedKey: string, encryptedPayload: string, mac: string}} - The encrypted components.
 */
export function encryptPayload(payload, recipientPublicKey) {
    try {
        // 1. Generate two symmetric keys: one for encryption, one for MAC
        const encryptionKey = randomBytes(32);
        const macKey = randomBytes(32);
        const combinedKey = Buffer.concat([encryptionKey, macKey]);

        // 2. Encrypt the payload with the encryption key using AES-CTR
        const iv = randomBytes(16); // AES-CTR uses a 16-byte counter
        const aesCtr = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(iv));
        const encryptedPayload = aesCtr.encrypt(payload);

        // 3. Create a MAC of the encrypted payload
        const mac = createHmac('sha256', macKey).update(encryptedPayload).digest('hex');

        // 4. Encrypt the combined symmetric key with the recipient's public key using ECIES
        const encryptedKeyObject = encrypt(recipientPublicKey, combinedKey);

        logger.info('Payload successfully encrypted.');

        return {
            iv: iv.toString('base64'),
            encryptedKey: encryptedKeyObject.toString('base64'),
            encryptedPayload: Buffer.from(encryptedPayload).toString('base64'),
            mac: mac,
        };
    } catch (error) {
        logger.error('Error during payload encryption:', error);
        throw new Error('Payload encryption failed.');
    }
}

/**
 * Decrypts an envelope-encrypted payload.
 *
 * @param {object} encryptedData - The object containing the encrypted components.
 * @param {string} encryptedData.iv - The base64-encoded initialization vector.
 * @param {string} encryptedData.encryptedKey - The base64-encoded encrypted symmetric key.
 * @param {string} encryptedData.encryptedPayload - The base64-encoded encrypted payload.
 * @param {string} encryptedData.mac - The hex-encoded message authentication code.
 * @param {Buffer|Uint8Array} recipientPrivateKey - The recipient's raw private key.
 * @returns {Buffer} The original decrypted payload.
 */
export function decryptPayload({ iv, encryptedKey, encryptedPayload, mac }, recipientPrivateKey) {
    try {
        // 1. Decrypt the combined symmetric key with the recipient's private key
        const encryptedKeyBuffer = Buffer.from(encryptedKey, 'base64');
        const combinedKey = decrypt(recipientPrivateKey, encryptedKeyBuffer);
        const encryptionKey = combinedKey.slice(0, 32);
        const macKey = combinedKey.slice(32);

        // 2. Verify the MAC
        const encryptedPayloadBuffer = Buffer.from(encryptedPayload, 'base64');
        const expectedMac = createHmac('sha256', macKey).update(encryptedPayloadBuffer).digest('hex');
        if (mac !== expectedMac) {
            throw new Error('MAC verification failed. The message may have been tampered with.');
        }

        // 3. Decrypt the payload with the encryption key
        const ivBuffer = Buffer.from(iv, 'base64');
        const aesCtr = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(ivBuffer));
        const decryptedPayload = aesCtr.decrypt(encryptedPayloadBuffer);

        logger.info('Payload successfully decrypted.');

        return Buffer.from(decryptedPayload);
    } catch (error) {
        logger.error('Error during payload decryption:', error);
        throw new Error('Payload decryption failed. The key may be incorrect or the data corrupted.');
    }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { createWallet } = await import('./wallet.js');
  const { createPaymentPayload } = await import('./transaction.js');
  const { strict: assert } = await import('assert');
  const { Buffer } = await import('buffer');

  async function test() {
    console.log('Running encryption and decryption test...');

    const senderWallet = await createWallet(null, {
      accountType: 'individual',
      givenName: 'Sender',
      familyName: 'Test',
      dateOfBirth: '1990-01-01',
      countryOfBirth: 'FR',
      cityOfBirth: 'Paris'
    });

    const recipientWallet = await createWallet(null, {
      accountType: 'individual',
      givenName: 'Recipient',
      familyName: 'Test',
      dateOfBirth: '1991-01-01',
      countryOfBirth: 'DE',
      cityOfBirth: 'Berlin'
    });

    console.log('  - Wallets created.');

    const originalPayload = {
      to: recipientWallet.peerId.toString(),
      description: 'Test payment',
      reference: 'test-123',
      amount: 100,
      nonce: 1,
      currency: 'TOKEN'
    };

    console.log('  - Original payload:', originalPayload);

    const recipientPublicKey = recipientWallet.encryptionPublicKey;
    const encryptedTransaction = createPaymentPayload(
      senderWallet,
      recipientWallet.peerId,
      originalPayload.amount,
      originalPayload.nonce,
      originalPayload.description,
      originalPayload.reference,
      recipientPublicKey
    );

    console.log('  - Payload encrypted.');

    const decryptedPayloadBuffer = decryptPayload(
      encryptedTransaction.payload.encryptedData,
      recipientWallet.encryptionPrivateKey
    );
    const decryptedPayload = JSON.parse(decryptedPayloadBuffer.toString());

    console.log('  - Payload decrypted.');
    console.log('  - Decrypted payload:', decryptedPayload);

    assert.deepStrictEqual(decryptedPayload, originalPayload, 'Decrypted payload does not match original');

    console.log('✅ Encryption and decryption test passed!');
  }

  test().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}
