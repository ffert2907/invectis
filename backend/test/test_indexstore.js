import { FsIndexstore } from '../src/implementations/fs/fs-indexstore.js';
import assert from 'assert';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { CID } from 'multiformats/cid';
import * as hasher from 'multiformats/hashes/sha2';
import * as codec from '@ipld/dag-cbor';
import { TextEncoder } from 'util';

async function runTests() {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'indexstore-test-'));
  console.log(`Running tests in temporary directory: ${testDir}`);

  const indexStore = new FsIndexstore(testDir);

  // Helper to create a dummy CID
  const createDummyCid = async (data) => {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const hash = await hasher.sha256.digest(bytes);
    return CID.create(1, codec.code, hash);
  };

  try {
    await indexStore.open();
    console.log('Indexstore opened.');

    const peer1 = '12D3KooWRsoiNq2d4ov2tY89d3geA81K6yUdef2iWc2kHhPjXGzS';
    const peer2 = '12D3KooWAdgde5325o2s4g3s1q2w3e4r5t6y7u8i9o0p1a2s3d4f';

    const tx1Data = { author: peer1, payload: { to: peer2, amount: 10 } };
    const tx2Data = { author: peer2, payload: { to: peer1, amount: 5 } };
    const tx3Data = { author: peer1, payload: { to: peer1, amount: 2 } };

    const cid1 = await createDummyCid(tx1Data);
    const cid2 = await createDummyCid(tx2Data);
    const cid3 = await createDummyCid(tx3Data);

    // Test 1: Process transactions and check index
    console.log('Test 1: Process transactions and check wallet index');
    await indexStore.processTransaction(cid1, tx1Data);
    await indexStore.processTransaction(cid2, tx2Data);
    await indexStore.processTransaction(cid3, tx3Data);

    const peer1Txs = await indexStore.getTransactionsForWallet(peer1);
    assert.deepStrictEqual(peer1Txs.sort(), [cid1.toString(), cid2.toString(), cid3.toString()].sort(), 'Peer1 should be involved in 3 transactions');

    const peer2Txs = await indexStore.getTransactionsForWallet(peer2);
    assert.deepStrictEqual(peer2Txs.sort(), [cid1.toString(), cid2.toString()].sort(), 'Peer2 should be involved in 2 transactions');
    console.log('  -> PASSED');

    // Test 2: Get transactions for a wallet with no transactions
    console.log('Test 2: Get transactions for an unknown wallet');
    const unknownTxs = await indexStore.getTransactionsForWallet('unknown_peer');
    assert.deepStrictEqual(unknownTxs, [], 'Unknown wallet should have no transactions');
    console.log('  -> PASSED');

    // Test 3: Pinning CIDs
    console.log('Test 3: Pinning and unpinning CIDs');
    await indexStore.pin(cid1);
    await indexStore.pin(cid3);

    let pinned = await indexStore.getPinnedCIDs();
    assert.deepStrictEqual(pinned.sort(), [cid1.toString(), cid3.toString()].sort(), 'Should have 2 pinned CIDs');

    // Pinning an existing CID should not add a duplicate
    await indexStore.pin(cid1);
    pinned = await indexStore.getPinnedCIDs();
    assert.strictEqual(pinned.length, 2, 'Pinning an existing CID should not add a duplicate');

    await indexStore.unpin(cid1);
    pinned = await indexStore.getPinnedCIDs();
    assert.deepStrictEqual(pinned, [cid3.toString()], 'Should have 1 pinned CID after unpinning');

    // Unpinning a non-existent CID should not throw an error
    await indexStore.unpin(cid2);
    pinned = await indexStore.getPinnedCIDs();
    assert.deepStrictEqual(pinned, [cid3.toString()], 'Unpinning a non-pinned CID should not change the list');
    console.log('  -> PASSED');

  } catch (error) {
    console.error('TEST FAILED:', error);
    process.exit(1);
  } finally {
    // Cleanup
    await indexStore.close();
    console.log('Indexstore closed.');
    await fs.rm(testDir, { recursive: true, force: true });
    console.log('Cleaned up temporary directory.');
  }

  console.log('\nAll FsIndexstore tests passed!');
}

runTests();
