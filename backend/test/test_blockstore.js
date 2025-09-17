import { FsBlockstore } from '../src/implementations/fs/fs-blockstore.js';
import assert from 'assert';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { CID } from 'multiformats/cid';
import * as hasher from 'multiformats/hashes/sha2';
import * as codec from '@ipld/dag-cbor';
import { TextEncoder } from 'util';

async function runTests() {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blockstore-test-'));
  console.log(`Running tests in temporary directory: ${testDir}`);

  const blockstore = new FsBlockstore(testDir);

  // Helper to create a dummy CID
  const createDummyCid = async (data) => {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const hash = await hasher.sha256.digest(bytes);
    return CID.create(1, codec.code, hash);
  };

  try {
    await blockstore.open();
    console.log('Blockstore opened.');

    // Test 1: Put and get a block
    console.log('Test 1: Put and get a block');
    const data1 = { hello: 'world' };
    const cid1 = await createDummyCid(data1);
    const block1 = new TextEncoder().encode(JSON.stringify(data1));
    await blockstore.put(cid1, block1);

    const retrievedBlock1 = await blockstore.get(cid1);
    // Compare as hex strings for a reliable binary comparison
    assert.strictEqual(retrievedBlock1.toString('hex'), Buffer.from(block1).toString('hex'), 'Retrieved block should match the original block');
    console.log('  -> PASSED');

    // Test 2: Check if a block exists with has()
    console.log('Test 2: Check for existing and non-existing blocks');
    const hasCid1 = await blockstore.has(cid1);
    assert.strictEqual(hasCid1, true, 'has() should return true for an existing block');

    const nonExistentCid = await createDummyCid({ some: 'other data' });
    const hasNonExistent = await blockstore.has(nonExistentCid);
    assert.strictEqual(hasNonExistent, false, 'has() should return false for a non-existing block');
    console.log('  -> PASSED');

    // Test 3: Delete a block
    console.log('Test 3: Delete a block');
    await blockstore.delete(cid1);
    const hasCid1AfterDelete = await blockstore.has(cid1);
    assert.strictEqual(hasCid1AfterDelete, false, 'has() should return false after a block is deleted');

    // Test that get() throws an error for a deleted block
    await assert.rejects(
      async () => {
        await blockstore.get(cid1);
      },
      (err) => {
        // datastore-level throws an error with a specific code
        return err.code === 'ERR_NOT_FOUND';
      },
      'get() should throw an error for a deleted block'
    );
    console.log('  -> PASSED');

  } catch (error) {
    console.error('TEST FAILED:', error);
    process.exit(1);
  } finally {
    // Cleanup
    await blockstore.close();
    console.log('Blockstore closed.');
    await fs.rm(testDir, { recursive: true, force: true });
    console.log('Cleaned up temporary directory.');
  }

  console.log('\nAll FsBlockstore tests passed!');
}

runTests();
