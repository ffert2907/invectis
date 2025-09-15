import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { strict as assert } from 'assert';
import { createWallet } from './wallet.js';
import { rm } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const index_path = path.join(__dirname, 'index.js');

// Helper to manage a node process
class NodeRunner {
    constructor(walletFile) {
        this.walletFile = walletFile;
        this.datastorePath = path.join(__dirname, 'data', `test_helia_${path.basename(this.walletFile, '.dat')}`);
        this.walletPath = path.join(__dirname, 'data', this.walletFile);
        this.pinsPath = path.join(this.datastorePath, 'pins'); // Corrected path
        this.child = null;
        this.address = null;
        this.isReady = false;
        this.requests = new Map();
        this.requestId = 0;
    }

    async init() {
        console.log(`Initializing environment for ${this.walletFile}...`);
        await rm(this.walletPath, { force: true, recursive: true });
        await rm(this.datastorePath, { force: true, recursive: true });
        await rm(this.pinsPath, { force: true, recursive: true });

        await createWallet(this.walletPath, {
            accountType: 'individual', givenName: 'Test', familyName: 'User',
            dateOfBirth: '1990-01-01', countryOfBirth: 'XX', cityOfBirth: 'Testville'
        }, null);
        console.log(`Wallet created for ${this.walletFile}.`);
    }

    async start(peerAddress = null) {
        console.log(`Starting node for ${this.walletFile}...`);

        const customDataDir = `test_helia_${path.basename(this.walletFile, '.dat')}`;
        const args = [
            this.walletFile,
            peerAddress,
            customDataDir
        ];

        this.isReady = false;
        this.child = fork(index_path, args, { silent: true });

        this.child.stdout.on('data', (data) => console.log(`[${this.walletFile}]: ${data.toString().trim()}`));
        this.child.stderr.on('data', (data) => console.error(`[${this.walletFile} ERROR]: ${data.toString().trim()}`));

        this.child.on('message', (message) => {
            if (message.type === 'ready') {
                this.address = message.address;
                this.isReady = true;
            } else if (this.requests.has(message.id)) {
                const { resolve, reject } = this.requests.get(message.id);
                if (message.type === 'result') resolve(message.data);
                else if (message.type === 'error') reject(new Error(message.message));
                this.requests.delete(message.id);
            }
        });

        const startTime = Date.now();
        while (!this.isReady) {
            if (Date.now() - startTime > 20000) throw new Error(`Node ${this.walletFile} failed to start in time.`);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log(`Node ${this.walletFile} is ready at address ${this.address}`);
    }

    sendCommand(command, data) {
        return new Promise((resolve, reject) => {
            const id = this.requestId++;
            this.requests.set(id, { resolve, reject });
            this.child.send({ id, command, data });
            setTimeout(() => {
                if (this.requests.has(id)) {
                    reject(new Error(`Command ${command} timed out`));
                    this.requests.delete(id);
                }
            }, 15000);
        });
    }

    async stop() {
        if (!this.child || this.child.killed) {
            return;
        }
        console.log(`Stopping node for ${this.walletFile}...`);
        const exitPromise = new Promise(resolve => this.child.on('exit', resolve));
        this.child.send({ command: 'stop' }); // Send graceful stop command
        await exitPromise;
        this.child = null;
        console.log(`Node for ${this.walletFile} has exited.`);
    }
}

async function runTests() {
    console.log("--- STARTING AUTOMATED TEST SUITE ---");
    const node1 = new NodeRunner('test_wallet_1.dat');
    const node2 = new NodeRunner('test_wallet_2.dat');

    try {
        await node1.init();
        await node2.init();

        // Start nodes for all tests
        console.log("\nStarting nodes for tests...");
        await node1.start();
        const node1Address = node1.address;
        assert.ok(node1Address, 'Node 1 has no address');
        await node2.start(node1Address);

        // Test 1: Replication & Pinning
        console.log("\n--- TEST 1: REPLICATION & PINNING ---");
        const txPayload2 = { some: 'replication data', v: 2 };
        const cidToReplicate = await node1.sendCommand('create-tx', { type: 'REPL_TEST', payload: txPayload2 });
        console.log(`Node 1 created tx to replicate: ${cidToReplicate}`);

        await node1.sendCommand('pin-cid', { cid: cidToReplicate });
        console.log(`Node 1 pinned ${cidToReplicate}. Waiting for replication...`);

        // Wait for replication to complete by polling for providers
        let providerCount = 0;
        const startTime = Date.now();
        while(providerCount < 2) {
            if (Date.now() - startTime > 25000) { // 25s timeout for replication
                throw new Error(`Replication timed out. Only found ${providerCount} provider(s).`);
            }
            try {
                providerCount = await node1.sendCommand('get-providers', { cid: cidToReplicate });
                console.log(`Found ${providerCount} provider(s) for the CID.`);
            } catch (e) {
                console.warn("get-providers command failed, retrying...", e.message);
            }
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        console.log(`Asking Node 2 for CID ${cidToReplicate}...`);
        const replicatedTx = await node2.sendCommand('get-tx', { cid: cidToReplicate });

        assert.deepStrictEqual(replicatedTx.payload, txPayload2, 'Transaction data on node 2 does not match original');
        console.log("✅ Replication test passed!");

        // Test 2: Garbage Collection
        console.log("\n--- TEST 2: GARBAGE COLLECTION ---");
        const c1_unpinned = await node1.sendCommand('create-tx', { type: 'GC_TEST', payload: {v:1} });
        console.log(`Created unpinned tx C1: ${c1_unpinned}`);
        await node1.sendCommand('create-tx', { type: 'GC_TEST', payload: {v:2} });

        let deletedCount = await node1.sendCommand('run-gc');
        console.log(`GC run 1 deleted ${deletedCount} block(s).`);
        assert.strictEqual(deletedCount, 0, "GC should not delete ancestors of heads");

        console.log("✅ Garbage collection test passed!");

        console.log("\n--- ✅ ALL TESTS PASSED ---");

    } finally {
        await node1.stop();
        await node2.stop();
        console.log("\n--- TEST SUITE FINISHED ---");
    }
}

Promise.race([
    runTests(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Test suite timed out after 90 seconds')), 90000))
]).catch(error => {
    console.error("\n--- ❌ TEST FAILED ---");
    console.error(error);
    process.exit(1);
});
