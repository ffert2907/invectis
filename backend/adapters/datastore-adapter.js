import { MemoryDatastore } from 'datastore-core';
import { LevelDatastore } from 'datastore-level';
import { logger } from '../config.js';

/**
 * Creates a datastore instance based on the provided configuration.
 * This acts as a factory to abstract away the specific datastore implementation.
 *
 * @param {object} config - The configuration object for the datastore.
 * @param {string} config.type - The type of datastore to create ('memory' or 'leveldb').
 * @param {string} [config.path] - The path for the datastore, required for 'leveldb'.
 * @returns {import('datastore-core').Datastore} A datastore instance.
 */
export function createDatastore(config) {
  switch (config.type) {
    case 'leveldb':
      if (!config.path) {
        throw new Error("A 'path' is required for the LevelDB datastore.");
      }
      logger.info(`💾 Using LevelDB datastore at: ${config.path}`);
      return new LevelDatastore(config.path);

    case 'memory':
    default:
      logger.info('🧠 Using in-memory datastore. Data will not be persisted.');
      return new MemoryDatastore();
  }
}
