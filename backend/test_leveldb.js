import { LevelDatastore } from 'datastore-level';
import { Key } from 'interface-datastore';
import { strict as assert } from 'assert';
import { rm } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runLevelDBTest() {
    console.log("--- Running Standalone LevelDB Persistence Test ---");
    const dbPath = path.join(__dirname, 'data', 'level_test_db');
    const testKey = new Key('/test/hello');
    const testValue = new TextEncoder().encode('world');

    try {
        // Cleanup before test
        await rm(dbPath, { force: true, recursive: true });
        console.log(`Cleaned directory: ${dbPath}`);

        // --- First Run: Write data ---
        console.log("Opening datastore for writing...");
        const ds1 = new LevelDatastore(dbPath);
        await ds1.open();

        console.log(`Putting value for key: ${testKey.toString()}`);
        await ds1.put(testKey, testValue);

        console.log("Closing datastore...");
        await ds1.close();
        console.log("Write cycle complete.");

        // --- Second Run: Read data ---
        console.log("\nReopening datastore for reading...");
        const ds2 = new LevelDatastore(dbPath);
        await ds2.open();

        console.log(`Getting value for key: ${testKey.toString()}`);
        const retrievedValue = await ds2.get(testKey);

        console.log("Closing datastore...");
        await ds2.close();
        console.log("Read cycle complete.");

        // --- Verification ---
        console.log("\nVerifying data...");
        assert.deepStrictEqual(retrievedValue, testValue, "Retrieved value does not match original value!");

        console.log("--- ✅ Standalone LevelDB Persistence Test PASSED ---");

    } catch (error) {
        console.error("--- ❌ Standalone LevelDB Persistence Test FAILED ---");
        console.error(error);
        process.exit(1);
    } finally {
        // Final cleanup
        await rm(dbPath, { force: true, recursive: true });
    }
}

runLevelDBTest();
