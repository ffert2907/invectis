import { createIndexstore } from './adapters/storage.js'
import { logger } from './config.js'
import { CID } from 'multiformats/cid'
import { Key } from 'interface-datastore'

export class PinManager {
  constructor(datastorePath) {
    this.datastorePath = datastorePath;
    this.datastore = null;
  }

  async open() {
    if (this.datastore) return;
    this.datastore = await createIndexstore(this.datastorePath);
    logger.info(`PinManager: Pin database connection opened at ${this.datastorePath}`);
  }

  async close() {
    if (this.datastore) {
        await this.datastore.close();
        logger.info('PinManager: Pin database closed.');
    }
  }

  async pin(cid) {
    const key = new Key(`/pins/${cid.toString()}`);
    await this.datastore.put(key, new Uint8Array());
  }

  async unpin(cid) {
    const key = new Key(`/pins/${cid.toString()}`);
    if (await this.datastore.has(key)) {
        await this.datastore.delete(key);
    }
  }

  async isPinned(cid) {
    return this.datastore.has(new Key(`/pins/${cid.toString()}`));
  }

  async getAllPins() {
    const pins = [];
    if (!this.datastore) return pins;
    for await (const { key } of this.datastore.query({ prefix: '/pins/' })) {
      const cidString = key.toString().split('/').pop();
      if (cidString) {
        pins.push(CID.parse(cidString));
      }
    }
    return pins;
  }
}

export class GarbageCollector {
  constructor({ blockstore, heliaJson, pinManager }) {
    this.blockstore = blockstore;
    this.heliaJson = heliaJson;
    this.pinManager = pinManager;
  }

  async findAllAncestors(startingCids) {
    const ancestors = new Set();
    const queue = [...startingCids];
    const visited = new Set(startingCids.map(c => c.toString()));

    while (queue.length > 0) {
      const cid = queue.shift();
      if (!cid) continue;
      ancestors.add(cid.toString());

      try {
        const node = await this.heliaJson.get(cid);
        if (node && typeof node === 'object') {
            for (const key in node) {
                if (CID.isCID(node[key])) {
                    const parentCidString = node[key].toString();
                    if (!visited.has(parentCidString)) {
                        visited.add(parentCidString);
                        queue.push(node[key]);
                    }
                }
            }
        }
      } catch (err) {
        logger.warn(`GC: Could not find block ${cid.toString()} during ancestor traversal.`);
      }
    }
    return ancestors;
  }

  async run(dagHeads = []) {
    logger.info('GC: Starting garbage collection process...');
    const pinnedCids = await this.pinManager.getAllPins();
    const rootCids = [...dagHeads, ...pinnedCids];
    logger.info(`GC: Found ${dagHeads.length} DAG head(s) and ${pinnedCids.length} pinned item(s).`);
    const protectedCids = await this.findAllAncestors(rootCids);
    logger.info(`GC: Total of ${protectedCids.size} CIDs are protected.`);

    let deletedCount = 0;
    for await (const { cid } of this.blockstore.getAll()) {
      if (!protectedCids.has(cid.toString())) {
        try {
            await this.blockstore.delete(cid);
            deletedCount++;
        } catch (err) {
            logger.error(`GC: Failed to delete block ${cid.toString()}:`, err);
        }
      }
    }
    logger.info(`GC: Garbage collection finished. Deleted ${deletedCount} block(s).`);
    return deletedCount;
  }
}
