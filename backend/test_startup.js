import { TestNode } from './test_utils.js';
import assert from 'assert';
import { createWallet } from './wallet.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { rm, mkdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Node Startup Test', function () {
    this.timeout(30000); // 30 second timeout

    let node;
    const dataDir = '/app/backend/data';
    const walletPath = path.join(dataDir, 'startup_wallet.dat');

    before(async () => {
        await rm(dataDir, { recursive: true, force: true }).catch(() => {});
        await mkdir(dataDir, { recursive: true });
        const walletDetails = {
            accountType: 'individual',
            givenName: 'Startup',
            familyName: 'Test',
            dateOfBirth: '1990-01-01',
            countryOfBirth: 'USA',
            cityOfBirth: 'New York'
        };
        await createWallet(walletPath, walletDetails);
    });

    after(async () => {
        if (node) await node.stop();
        await rm(dataDir, { recursive: true, force: true }).catch(() => {});
    });

    it('should start a single test node successfully', async () => {
        node = new TestNode('startup_wallet.dat', 'test_startup_db');
        await node.start();
        assert.ok(node.isReady, 'Node should be ready');
        assert.ok(node.address, 'Node should have an address');
    });
});
