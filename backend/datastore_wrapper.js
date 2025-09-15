import { LevelDatastore } from 'datastore-level';

/**
 * A wrapper around LevelDatastore that ensures 'get' operations
 * return a Uint8Array instead of a Buffer. This is to fix a type
 * incompatibility with the Helia stack in this environment.
 */
export class DatastoreWrapper {
    constructor(path) {
        this.store = new LevelDatastore(path);
        console.log(`DatastoreWrapper initialized for path: ${path}`);
    }

    async get(key) {
        const value = await this.store.get(key);
        // Helia/IPFS expects Uint8Array. LevelDB may return Buffer.
        // In modern Node.js, Buffer is a subclass of Uint8Array, but
        // strict checks can fail. This ensures we always return the base type.
        return Uint8Array.from(value);
    }

    put(key, val) {
        return this.store.put(key, val);
    }

    has(key) {
        return this.store.has(key);
    }

    delete(key) {
        return this.store.delete(key);
    }

    batch() {
        return this.store.batch();
    }

    query(q) {
        return this.store.query(q);
    }

    open() {
        return this.store.open();
    }

    close() {
        return this.store.close();
    }
}
