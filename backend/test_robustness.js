import { TestNode } from './test_utils.js';
import assert from 'assert';
import { createWallet } from './wallet.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { rm, mkdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Robustness and Security Tests', function () {
    this.timeout(60000); // 60 second timeout for the whole suite

    let victim, attacker;
    let attackerPeerId;
    const dataDir = '/app/backend/data';
    const victimWalletPath = path.join(dataDir, 'victim_wallet.dat');
    const attackerWalletPath = path.join(dataDir, 'attacker_wallet.dat');


    before(async () => {
        // Ensure the data directory exists
        await rm(dataDir, { recursive: true, force: true });
        await new Promise(resolve => setTimeout(resolve, 100)); // Brief pause after rm
        await mkdir(dataDir, { recursive: true });

        // Create wallets for the test nodes
        const walletDetails = {
            accountType: 'individual',
            givenName: 'Test',
            familyName: 'User',
            dateOfBirth: '1990-01-01',
            countryOfBirth: 'USA',
            cityOfBirth: 'New York'
        };
        await createWallet(victimWalletPath, walletDetails);
        const attackerWallet = await createWallet(attackerWalletPath, walletDetails);
        attackerPeerId = attackerWallet.peerId.toString();

        victim = new TestNode('victim_wallet.dat', 'test_victim_db');
        attacker = new TestNode('attacker_wallet.dat', 'test_attacker_db');

        console.log('Starting nodes for testing...');
        await Promise.all([victim.start(), attacker.start()]);
        console.log('Nodes started successfully.');
    });

    after(async () => {
        console.log('Stopping nodes after tests...');
        if (victim) await victim.stop();
        if (attacker) await attacker.stop();
        console.log('Nodes stopped.');
        // Clean up wallets
        await rm(victimWalletPath, { force: true });
        await rm(attackerWalletPath, { force: true });
    });

    it('should rate limit a peer and lower its reputation for spamming pubsub', async () => {
        const initialReputation = await victim.getReputation(attackerPeerId);
        assert.strictEqual(initialReputation, 0, 'Attacker should have a neutral initial reputation');

        console.log('Attacker is sending a burst of transactions to trigger rate limiting...');
        const promises = [];
        // The rate limit is 0.5 msg/sec with a burst of 2.
        // Sending 5 messages quickly should trigger the limiter at least 3 times.
        // Penalty is -2 per trigger, so score should be at least -6.
        for (let i = 0; i < 5; i++) {
            promises.push(attacker.createTx('INFORMATION', { message: `spam ${i}` }));
        }

        try {
            await Promise.all(promises);
        } catch(e) {
            // Some might fail if the node is overwhelmed, which is fine for this test.
            console.warn("Some transaction creation promises were rejected, continuing test.", e.message);
        }


        // Wait a bit for the victim to process the messages and update reputation
        await delay(4000);

        const finalReputation = await victim.getReputation(attackerPeerId);
        console.log(`Initial reputation: ${initialReputation}, Final reputation: ${finalReputation}`);
        assert(finalReputation < initialReputation, 'Attacker reputation should be lowered after spamming');
        // A more specific check based on our config
        assert(finalReputation <= -6, `Expected final reputation to be <= -6, but was ${finalReputation}`);
    });
});
