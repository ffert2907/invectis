import { logger } from './config.js';
import { CID } from 'multiformats/cid';

const DEFAULT_REPLICATION_FACTOR = 3;
const DEFAULT_CHECK_INTERVAL = 60 * 1000; // 1 minute
const DEFAULT_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

export class ReplicationManager {
  /**
   * @param {import('helia').Helia} helia - The Helia instance, which includes libp2p and pin management.
   * @param {object} [options]
   * @param {number} [options.replicationFactor=3] - The target number of replicas for each pinned CID.
   * @param {number} [options.checkInterval=60000] - The interval in ms to check replication status.
   * @param {number} [options.ttl=2592000000] - The time-to-live for pinned items in ms.
   */
  constructor(helia, options = {}) {
    this.helia = helia;
    this.libp2p = helia.libp2p; // For convenience
    this.pinManager = helia.pins; // Assuming the pin manager is at helia.pins
    this.targetReplicationFactor = options.replicationFactor || DEFAULT_REPLICATION_FACTOR;
    this.checkInterval = options.checkInterval || DEFAULT_CHECK_INTERVAL;
    this.ttl = options.ttl || DEFAULT_TTL;

    /** @private */
    this.pinnedCids = new Map();
    /** @private */
    this.intervalHandle = null;

    logger.info('ReplicationManager: Initialized.');
  }

  /**
   * Starts the periodic replication and garbage collection tasks.
   */
  start() {
    if (this.intervalHandle) {
      logger.warn('ReplicationManager: Already started.');
      return;
    }
    this.intervalHandle = setInterval(() => {
      this._checkReplication();
      this._garbageCollect();
    }, this.checkInterval);
    logger.info(`ReplicationManager: Started with a check interval of ${this.checkInterval}ms.`);
  }

  /**
   * Stops the periodic tasks.
   */
  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info('ReplicationManager: Stopped.');
    }
  }

  /**
   * Pins a CID to be tracked for replication.
   * @param {CID | string} cid - The CID to pin.
   */
  pin(cid) {
    const cidString = cid.toString();
    if (this.pinnedCids.has(cidString)) {
      // Refresh the timestamp if it's already pinned
      const existing = this.pinnedCids.get(cidString);
      existing.pinnedAt = Date.now();
      logger.debug(`ReplicationManager: Refreshed pin for ${cidString}`);
    } else {
      this.pinnedCids.set(cidString, {
        cid: CID.parse(cidString),
        pinnedAt: Date.now(),
      });
      logger.info(`ReplicationManager: Pinned new CID: ${cidString}`);
    }
  }

  /**
   * Unpins a CID, making it eligible for garbage collection.
   * @param {CID | string} cid - The CID to unpin.
   */
  unpin(cid) {
    const cidString = cid.toString();
    if (this.pinnedCids.delete(cidString)) {
      logger.info(`ReplicationManager: Unpinned CID: ${cidString}`);
    }
  }

  /**
   * @private
   * Periodically checks the replication factor of pinned CIDs.
   */
  async _checkReplication() {
    logger.info(`ReplicationManager: Starting replication check...`);

    // This aligns with the user's error. We use the now-verified `ls()` method.
    const pinnedCids = [];
    if (this.pinManager) {
      for await (const pin of this.pinManager.ls()) {
        pinnedCids.push(pin.cid);
      }
    }

    if (pinnedCids.length === 0) {
      return;
    }
    logger.info(`ReplicationManager: Checking replication for ${pinnedCids.length} pinned CIDs...`);

    for (const cid of pinnedCids) {
      try {
        const providers = [];
        for await (const provider of this.libp2p.contentRouting.findProviders(cid, { timeout: 10000 })) {
          providers.push(provider);
        }

        const currentReplication = providers.length;
        logger.info(`ReplicationManager: CID ${cid.toString()} has ${currentReplication} providers.`);

        if (currentReplication < this.targetReplicationFactor) {
          logger.warn(`ReplicationManager: Replication factor for ${cid.toString()} is ${currentReplication}, which is below the target of ${this.targetReplicationFactor}. Re-providing...`);
          try {
            // Re-announce this node as a provider for the content
            await this.libp2p.contentRouting.provide(cid);
            logger.info(`ReplicationManager: Successfully re-provided CID ${cid.toString()} to the network.`);
          } catch (err) {
            logger.error(`ReplicationManager: Failed to re-provide CID ${cid.toString()}:`, err);
          }
        }
      } catch (error) {
        logger.error(`ReplicationManager: Error finding providers for ${cid.toString()}:`, error);
      }
    }
  }

  /**
   * @private
   * Periodically removes old pins based on the TTL.
   * Note: This only unpins the CID from this manager's tracking list.
   * It does not automatically trigger a garbage collection on the underlying blockstore.
   * A separate, more sophisticated GC process on the blockstore would be needed
   * to actually remove the data, which would check against all pins (local, replication, etc.).
   */
  _garbageCollect() {
    logger.info('ReplicationManager: Running garbage collection...');
    const now = Date.now();
    for (const [cidString, pinInfo] of this.pinnedCids.entries()) {
      if (now - pinInfo.pinnedAt > this.ttl) {
        logger.info(`ReplicationManager: TTL expired for ${cidString}. Unpinning.`);
        this.unpin(cidString);
      }
    }
  }
}
