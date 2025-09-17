import { FsKeyStore } from '../src/implementations/fs/fs-keystore.js';
import assert from 'assert';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

async function runTests() {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keystore-test-'));
  console.log(`Running tests in temporary directory: ${testDir}`);

  const keyStore = new FsKeyStore(testDir);

  try {
    // Test 1: Save and load a key
    console.log('Test 1: Save and load a key');
    const walletData = { privateKey: 'test-key', version: '1.0' };
    await keyStore.save('my_wallet', walletData);
    const loadedData = await keyStore.load('my_wallet');
    assert.deepStrictEqual(loadedData, walletData, 'Loaded data should match saved data');
    console.log('  -> PASSED');

    // Test 2: Load a non-existent key
    console.log('Test 2: Load a non-existent key');
    const nonExistent = await keyStore.load('non_existent_wallet');
    assert.strictEqual(nonExistent, null, 'Loading a non-existent key should return null');
    console.log('  -> PASSED');

    // Test 3: Save, remove, and then load a key
    console.log('Test 3: Save, remove, and then load a key');
    const tempData = { data: 'to be removed' };
    await keyStore.save('temp_wallet', tempData);
    let loadedTemp = await keyStore.load('temp_wallet');
    assert.deepStrictEqual(loadedTemp, tempData, 'Data should exist before removal');

    await keyStore.remove('temp_wallet');
    loadedTemp = await keyStore.load('temp_wallet');
    assert.strictEqual(loadedTemp, null, 'Data should not exist after removal');
    console.log('  -> PASSED');

    // Test 4: Overwriting a key
    console.log('Test 4: Overwriting a key');
    const initialData = { value: 1 };
    const updatedData = { value: 2 };
    await keyStore.save('overwrite_test', initialData);
    await keyStore.save('overwrite_test', updatedData);
    const finalData = await keyStore.load('overwrite_test');
    assert.deepStrictEqual(finalData, updatedData, 'Data should be overwritten with the latest save');
    console.log('  -> PASSED');

  } catch (error) {
    console.error('TEST FAILED:', error);
    process.exit(1);
  } finally {
    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
    console.log('Cleaned up temporary directory.');
  }

  console.log('\nAll FsKeyStore tests passed!');
}

runTests();
