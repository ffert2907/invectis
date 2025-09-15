// This file now acts as a proxy to the new P2P implementation.
// This allows us to switch between implementations without changing other files.
export { createNode } from './p2p_new.js';