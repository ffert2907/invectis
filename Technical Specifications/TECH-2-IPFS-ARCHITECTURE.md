# - PERSISTENT STORAGE DAG

Build a truly **peer-to-peer (P2P) distributed storage** where mobile devices themselves (plus some optional lightweight servers for discovery/bootstrapping) collectively hold the full ledger — no central authoritative storage. 

# 1 — Analysis of your requirement (is it correct / feasible?)

Short answer: **you can design a mostly P2P distributed ledger using mobile devices as peers**, with server nodes only for bootstrap/rendezvous. But there are significant practical constraints and design trade-offs you must accept:

## What makes it feasible

* libp2p + Helia/IPLD support peer-to-peer block exchange (Bitswap), DHT discovery, and pubsub-style announcements. Those primitives enable decentralized distribution of DAG blocks and heads.
* Mobile devices can run lightweight storage adapters (SQLite/IndexedDB) and participate in block exchange, caching, and storage of CIDs.
* Short-lived attestations signed by wallet keys make mobile peers capable of proving identity/authorization without central authority.
* CAR export/import remains the universal interchange format between peers.

## Important constraints & risks (why it’s not as simple as “just P2P”)

1. **Connectivity & NAT/Firewalls** — Mobile devices frequently sit behind restrictive NATs and have intermittent networks. Without server relays, peer-to-peer connections (TCP or WebRTC) may fail. libp2p supports relay/circuit but it requires relay nodes (these are lightweight servers). So you cannot be *100%* serverless for connectivity unless you rely on browser WebRTC mesh or platform-specific APIS (rare).
   → Practical compromise: minimal relay nodes for NAT traversal (not for storage).

2. **Availability & Persistence** — Mobile devices are offline, battery-limited, and users can uninstall or clear caches. Relying on them to store the *complete* ledger risks data loss and lower availability.
   → Mitigation: replication factor, incentives, and replication policies (some peers store full history, others store partial).

3. **Storage limits & quotas** — Mobile devices have limited free storage and users may not want the full ledger taking up space.
   → Mitigation: selective replication (per-wallet caching), tiered replication (full nodes vs light peers), configurable retention and pruning.

4. **Churn and consistency** — High peer churn increases overhead for replication and synchronization. DAG and Merkle-based heads are immutable, but selecting canonical head(s) in a fully decentralized setting with multiple simultaneous updates requires a conflict-resolution strategy (CRDTs, Lattice, or on-chain arbitration).
   → Mitigation: deterministic rules (nonce, timestamp, weights), or use a consensus layer for critical ordering.

5. **Incentives & trust** — In a fully P2P environment, what incentivizes peers to store others’ data? Without incentive, peers may not cooperate. You may accept weak incentives (social, reputation) or integrate token/credit systems.
   → Mitigation: reputational scoring, optional micropayments, or rely on willing volunteers / servers.

6. **Security & privacy** — Data replicated across many phones increases exposure surface. Sensitive payloads must be encrypted for intended recipients; public ledger data is fine to replicate widely.
   → Mitigation: field-level encryption; store only metadata widely.

## Conclusion of analysis

* The requirement is **technically valid** and aligns with P2P/IPFS philosophy. But a practical and robust deployment must accept and design around connectivity, availability, storage limits, churn, and incentives.
* Best realistic approach: **peer-first** architecture where mobile devices participate fully in P2P storage (replication + exchange), but **you keep a small set of lightweight server relays/bootstrap nodes** that are explicitly *not authoritative storage* — they exist only for NAT traversal, announcements, and optionally to hold extra replicas for availability. This fulfills your desire to avoid central storage while keeping the system resilient.

---

# 2 — specifications (detailed)

Below is a specification and implementation plan for a **peer-first decentralized ledger** that runs across mobile devices and servers used only for bootstrap/rendezvous. It incorporates the earlier Helia/IPLD, attestations, storage API, mobile adapters and extends them for full P2P operation.

## Overview & components

1. **Peer Node (mobile or desktop)**

   * Runs a local storage adapter (blockstore + index). On desktop, this can be full Helia; on mobile, a mobile blockstore (SQLite / IndexedDB / RocksDB) implementing the same BlockstoreAdapter API.
   * Participates in libp2p: supports transports available on platform (TCP for desktop, WebRTC or WebTransport for browser, possible native TCP for some mobile builds).
   * Implements Bitswap-like replication for IPLD blocks (use Helia or compatible Blocks API).
   * Hosts attestation service (`/app/attest/1.0.0`) to prove wallet ownership for actions.
   * Maintains local replication policy (which CIDs to keep).

2. **Bootstrap / Rendezvous Nodes (light servers)**

   * Minimal servers that provide: bootstrap multiaddrs, circuit relay service (libp2p relay for NAT traversal), and optionally pubsub forwarder or push gateway. They DO NOT serve as authoritative storage or single-source ledger. They may keep some extra replica copies to improve availability (optional).
   * Should be stateless, or at least store a rolling cache of announced heads; not required to store full ledger permanently.

3. **Replication Protocols & Discovery**

   * **Discovery**: DHT (Kademlia) where workable; fallback to bootstrap list and rendezvous over relay nodes.
   * **Announcements**: head announcements via pubsub (if available), plus `/app/head/1.0.0` request/response.
   * **Block exchange**: Bitswap or an equivalent block-exchange API; peers request CIDs they don’t have.
   * **Anti-entropy**: Periodic gossip/anti-entropy to repair missing blocks.

4. **Data Model**

   * Transactions are IPLD nodes (dag-cbor), as before.
   * Ledger roots (blocks) are root nodes pointing to tx CIDs. Heads are CIDs that indicate canonical root(s).
   * Optional CRDT-based metadata or sequence numbers used for conflict resolution.

5. **Replication & Persistence Policies**

   * **Replication Factor (RF)**: Configurable target number of replicas per CID (e.g., RF = 3). The system attempts to spread copies across peers.
   * **Retention Policy**: Each peer declares storage capacity and retention preferences (e.g., `retain: {wallets: ["own"], ttlDays: 30, pinned: [CIDs...]}`).
   * **Role-based replication**:

     * *Full peers* (optional): willing to store entire ledger or longer history (desktop servers and some mobile volunteers).
     * *Partial peers*: store only wallet-related txs and recent heads.
     * *Transient peers*: short-term caches only.
   * **Pinning / incentives**: peers can pin specific CIDs; pin metadata can be advertised to requesters.

6. **Incentivization (optional, recommended)**

   * Reputation/credit system for nodes that store and serve blocks. Optionally integrate micropayments to pay nodes for storing or serving data. (Spec leave as extension).

7. **Privacy & Encryption**

   * Public transaction metadata can be stored unencrypted.
   * Sensitive `payload` fields must be encrypted to intended recipients (e.g., wallet public key-based encryption or symmetric per-recipient key).
   * Peers only replicate encrypted blobs unless explicitly authorized and decrypted.

8. **Conflict Handling & Canonical Head Selection**

   * Deterministic rules: highest `height` then lowest lexicographic CID, or wallet nonce precedence for wallet-scoped sequences.
   * Optional consensus layer: if final ordering is critical, provide an optional chain-of-record (on-chain or consensus service) which serves as arbitration.

---

## Protocol details & behaviors

### A. Peer startup and bootstrap

1. Peer loads wallet and local storage adapters.
2. Generate or load `nodePeerId` (can be persistent or rotated).
3. Connect to bootstrap nodes (list of multiaddrs) for DHT/bootstrap and circuit relay.
4. Announce presence: publish a small `presence` message with `nodePeerId`, capabilities, and retention policy. Optionally, sign with attestation.
5. Subscribe to PubSub `heads` topic or use `/app/head/1.0.0` to request offers.

### B. Announcing new head (when a peer creates a block)

1. Peer creates block IPLD node and puts into its blockstore.
2. Peer updates local head pointer and signs an announcement: `{headCid, walletPeerId, attestationSig, issuedAt, ttl}`.
3. Broadcast announcement via PubSub `/app/head/1.0.0` or best-effort via bootstrap nodes (HTTP push or to relay).
4. Peers receiving announcement:

   * Verify attestation and signature.
   * If not in possession of `headCid` or its linked CIDs, they request via Bitswap or gateway (pull).
   * Decide whether to store or forward based on retention policy.

### C. Block retrieval & repair

* When a peer needs a CID, it:

  * Checks local blockstore; if missing, queries DHT or asks connected peers for providers for that CID.
  * Attempts Bitswap request.
  * If Bitswap fails and a bootstrap gateway exists, request CAR or block from gateway.
* Periodic anti-entropy job:

  * For pinned heads or for own wallet history, check peers for missing block fragments and request them.

### D. Storage & quota negotiation

* Peers advertise storage capacities and willingness to accept storage (a simple signed `offer`).
* When the replication algorithm needs to place replicas, it selects peers with available capacity, diversity (different network regions), and higher reputation.
* Replica placement is cooperative (no global authority): a peer that wants its data replicated will attempt to find peers that accept the data and push CARs.

### E. Revocation & rotation

* If a wallet is compromised, publish a revocation attestation (signed and broadcast) that instructs peers to drop attestations and possibly delete private data.
* Key rotation: re-issue attestation for new nodePeerId; old attestations expire.

---

## Storage & index specifics (peer-first)

### Blockstore & indexing

* Use the same IPLD CBOR for txs and block nodes.
* Local blockstore is platform-specific adapter (FS/LevelDB/SQlite/IndexedDB).
* Index includes:

  * `tx:CID -> metadata`
  * `wallet:<address> -> [CID]` (compact list or paginated)
  * `pinned:CIDs`
  * `providers:CIDs -> [peerId]` (optional cache)

### Pinning & garbage collection

* Each peer runs local GC per retention policy:

  * Never GC pinned items (local pins).
  * For non-pinned data, GC when disk usage exceeds threshold.
  * Before GC, attempt to re-replicate to other peers using provider cache (if replication factor is below target).

### Replication factor maintenance

* A background process checks replication counts (using provider caches/DHT) and requests replication when below `RF`.

---

## Security & privacy details

### Attestation & authorization

* Wallet signs attestations for node identity; these are used to authorize actions.
* Push/pull operations use attestation to prove the origin of announced head or request.

### Encryption

* Sensitive fields encrypted with recipients’ public keys. Use an Envelope scheme:

  * `payloadEncrypted = encrypt(symKey, payload)`
  * `symKeyEncrypted = encrypt(recipientPubKey, symKey)`
  * Store both in the tx node.

### Access control

* For privileged requests (e.g., asking a peer to store a private payload), require wallet-signed authorization plus ephemeral proofs.

### DOS & spam protection

* Use rate-limiting at peer-level and reputation heuristics.
* Refuse to store large unsolicited payloads unless properly priced or trusted.

---

## APIs and interfaces (revised for P2P)

Keep the StorageAPI but add P2P-oriented methods:

```ts
interface P2PStorageAPI {
  // Blockstore & IPLD
  putTransaction(tx: object): Promise<CID>;
  getTransaction(cid: CID|string): Promise<object|null>;
  listTransactionsByWallet(walletAddr: string, opts?: ListOpts): AsyncIterable<{cid, tx}>;
  createBlockFromPending(pendingCids: CID[]): Promise<CID>;
  getHead(): Promise<CID|null>;
  setHead(cid: CID): Promise<void>;

  // Network / replication
  announceHead(headCid: CID, attestation: Attestation): Promise<void>;
  requestCID(cid: CID, peers?: PeerId[]): Promise<void>; // ensures local availability
  findProviders(cid: CID): Promise<PeerId[]>;
  provideCID(cid: CID): Promise<void>; // announce to DHT that you have this CID

  // Storage management
  pin(cid: CID, opts?: {reason?:string}): Promise<void>;
  unpin(cid: CID): Promise<void>;
  setRetentionPolicy(policy: RetentionPolicy): Promise<void>;

  // Diagnostics & peers
  getPeers(): Promise<PeerInfo[]>;
  getProvidersForCID(cid: CID): Promise<PeerInfo[]>;

  // Backup & CAR
  exportCAR(rootCid: CID, outPath: string): Promise<void>;
  importCAR(input: string|Uint8Array): Promise<void>;
}
```

---

## Discovery & connectivity components (summary)

* **Bootstrap list** (static): used only to find initial peers.
* **Rendezvous/relay servers**: provide circuit relay and presence caching; not authoritative storage.
* **DHT (Kademlia)**: discover providers for CIDs (if privacy permits).
* **PubSub**: announce heads. Mobile may rely on relay servers for PubSub forwarding.
* **Direct peer handshake**: `identify`, `attest` and `capabilities` exchange.

---

## Testing plan (local and distributed)

### Local test topologies

* **2-full nodes (desktop)** – baseline as before.
* **Full node + 1 mobile light emulator** – simulate mobile adapter (SQLite).
* **2 mobile-only nodes (emulators)** – both use SQLite adapters and connect via local relay; simulate churn and offline periods.
* **Scale tests** – run many small instances on a single machine (docker or Node child processes) to simulate RF and churn.

### Key tests

* Replication under churn: nodes join/leave frequently and verify replication factor maintained.
* Offline create + sync: mobile creates tx offline, comes online, pushes to peers, other peers receive tx.
* NAT traversal: test circuit relay fallback when direct connections fail.
* Privacy tests: verify encrypted payloads only readable by intended recipients.
* GC and re-replication: delete local copies and verify other peers re-replicate when RF drops.
* Attack simulations: spam large payloads, replay attestations, revoke keys.

---

## Operational recommendations & best practices

1. **Keep server relays minimal and redundant** — multiple lightweight relays for availability.
2. **Encourage volunteer full nodes** — designate desktops, cloud nodes, or trusted parties to host full history for availability.
3. **Provide user controls** for mobile: cache depth, storage quotas, and backup to cloud for full history.
4. **Telemetry & monitoring** — for relays only (not for private user data), monitor availability and replication health.
5. **Reputation & incentives** — design optional incentives for peers that store data (credits, reputation, or payments).
6. **Policy for sensitive data** — by default, encrypt sensitive fields, and only replicate encrypted blobs.

---

## Implementation roadmap (practical phases)

### Phase 0 — Foundation & adapters

* Finalize BlockstoreAdapter and IndexAdapter for mobile and desktop (FS, level, sqlite, idb).
* Implement KeyStoreAdapter for each platform.

### Phase 1 — P2P core & replication primitives

* Implement libp2p setup per platform (with circuit relay).
* Implement CID provide/find + Bitswap get/put flow.
* Implement head announcement protocol.

### Phase 2 — Retention, replication factor, pinning

* Implement replication manager that enforces RF using provider discovery.
* Implement pinning and GC.

### Phase 3 — Privacy, attestation, encrypted payloads

* Implement attestation signing and verification flows.
* Implement encryption schema for payloads.

### Phase 4 — Testing & robustification

* Run scale tests and churn tests on many emulated clients.
* Implement rate-limiting, spam defenses, and reputation heuristics.

### Phase 5 — Optional incentives & marketplace

* Add micropayment layer or credit system for paid storage.

---

## Concrete configuration recommendations

* Default RF = 3 (configurable).
* Default attestation TTL = 10 minutes for network announcements.
* Default retention on mobile: last 30 days or last 1000 txs per wallet (user configurable).
* Enable optional full-node mode on desktop with unlimited retention.


