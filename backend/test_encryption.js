import { createWallet } from './wallet.js';
import { createPaymentPayload } from './transaction.js';
import { decryptPayload } from './crypto.js';
import { strict as assert } from 'assert';
import { Buffer } from 'buffer';

describe('Encryption and Decryption', function() {
  it('should encrypt and decrypt a payload correctly', async function() {
    // 1. Create two wallets
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

    // 2. Create a transaction payload
    const originalPayload = {
      to: recipientWallet.peerId.toString(),
      description: 'Test payment',
      reference: 'test-123',
      amount: 100,
      nonce: 1,
      currency: 'TOKEN'
    };

    // 3. Encrypt the payload
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

    assert.ok(encryptedTransaction.isEncrypted, 'Transaction should be marked as encrypted');
    assert.ok(encryptedTransaction.encryptedData, 'Transaction should contain encrypted data');

    // 4. Decrypt the payload
    const decryptedPayloadBuffer = decryptPayload(
      encryptedTransaction.encryptedData,
      recipientWallet.encryptionPrivateKey
    );
    const decryptedPayload = JSON.parse(decryptedPayloadBuffer.toString());

    // 5. Assert that the decrypted payload matches the original
    assert.deepStrictEqual(decryptedPayload, originalPayload, 'Decrypted payload does not match original');
  });
});
