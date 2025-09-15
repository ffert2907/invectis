
Due to PeerID inconsistency between node PeerID and Wallet ID we need decoupling the *wallet identity used for transactions* from the *node's network identity*. It’s safer and more flexible than tying critical transaction-authentication to a potentially-ephemeral network layer identity.

* **Primary proposal (recommended):** treat the node PeerID as an *abstracted, rotatable network identity*; require a cryptographic **attestation** signed by the wallet key whenever the node wants to perform any operation that must be linked to the wallet. The wallet PeerID (wallet key) remains the sole authority for transaction signing and verification. This minimizes security risks and supports node rotation, portability, and multiple nodes per wallet.

* **Alternative (if you need stronger binding):** use a persistent P2P identity tied to hardware/secure element (HSM/TPM) or a centralized/consensus-backed registry. I’ll outline this after the primary design.

I'll present the recommended architecture, message formats, verification rules, API specs, storage layout, rotation & revocation strategy, and tests you should add. I'll include short pseudocode for the critical parts.

# 1 — Design goals (restated)

* Wallet signing key is the authoritative identity for transactions and remains unchanged.
* Node PeerID is only a network-layer identity and may change without affecting transaction validity.
* Any operation where the node asserts something on behalf of the wallet (e.g., announcing node address, signing attestation, requesting privileged P2P actions) must be backed by a short-lived **attestation** cryptographically bound to the wallet key.
* Attestations are verifiable by other peers using wallet’s public key and carry anti-replay protections (timestamp, expiry, nonce).
* The system supports node rotation, multi-node per wallet, and secure revocation.

# 2 — High level flow (recommended) : CHOOSEN

1. Wallet file contains:

   * `walletKey` (private signing key — used to sign transactions and produce attestations).
   * Optionally: `node` object with `nodePeerId` and `nodePrivateKey` if you want persistence; but this design allows that to be absent or rotated.

2. On node startup:

   * Node generates (or loads) a libp2p `nodePeerId`.
   * Node requests an **attestation** from the wallet: the wallet signs a JSON attestation that binds the wallet public key to the nodePeerId with a timestamp and expiry.
   * The node uses its libp2p identity for networking AND advertises the attestation to peers when needed.

3. Attestation structure:

   * JSON, canonical encoding (e.g., deterministic canonical JSON or protobuf). Signed by wallet private key.
   * Contains: walletPubKey (or walletPeerId), nodePeerId, issuedAt (ISO8601 / unix), expiresAt, nonce/seq, optional metadata (e.g., capabilities), optional signature algorithm id, and walletNetworkId (optional chain id).

4. Verification by a peer:

   * For any operation where wallet-authorization is required, the receiving peer:

     * Extracts the attestation.
     * Verifies the attestation signature using the wallet's public key (or resolves wallet public key via your chain/registry).
     * Checks `issuedAt <= now <= expiresAt`.
     * Checks the attestation binds `nodePeerId` to `walletPubKey`.
     * Optionally checks `nonce` or a revocation list.

5. Transaction verification remains unchanged:

   * Transactions carry the wallet signature and wallet public key or address that points to wallet on-chain/registry.
   * Validators ignore nodePeerId for signature validation: they only inspect transaction signatures.

# 3 — Attestation format (JSON example)

Use canonical JSON or protobuf. Example canonical JSON fields:

```json
{
  "type": "wallet-node-attestation",
  "walletPeerId": "wallet:QmWalletPubIdOrAddress",
  "walletPubKey": "<base64-or-hex>",
  "nodePeerId": "QmNodePeerId",
  "issuedAt": "2025-09-13T12:00:00Z",
  "expiresAt": "2025-09-13T12:10:00Z",
  "nonce": "random-uuid-v4",
  "capabilities": ["relay","indexing"], 
  "version": "1"
}
```

Wallet then computes `signature = Sign(walletPrivateKey, canonicalize(attestation))` and bundles `{attestation, signature, sigAlgo}`.

# 4 — Protocol usage examples

A. Node advertises its attestation in identify/hello handshake or offers it on-demand via a custom libp2p protocol:

* Protocol name: `/app/attest/1.0.0`
* Request: `GET` — node returns `{attestation, signature, walletPeerId}`
* Peers verify and cache short-lived attestations.

B. Node performs privileged P2P actions (e.g., to request peers to open a persistent connection for wallet services):

* Node sends its attestation with the request. The receiver verifies before performing privileged actions.

C. Wallet-anchored RPCs:

* When node proxies signed wallet RPCs (e.g., broadcasting a tx), the receiver verifies the tx signature (wallet-level) — node attestation is optional or used purely for authorization to accept node requests.

# 5 — Code-level responsibilities & APIs

Below are minimal function signatures and implementation notes.

## Wallet module (wallet.js)

* `createWallet(password?)` — generates wallet key, optionally stores encrypted.
* `loadWallet(path, password?)` — loads wallet, decrypts, returns object:

  ```js
  {
    walletPrivateKey, // object or marshalled bytes
    walletPublicKey,
    walletPeerId, // optional string if you derive peerId from wallet key
    // optional saved node data:
    node?: {
      peerId, privateKey (marshalled)
    }
  }
  ```
* `signAttestation(walletPrivateKey, attestationObject)` — canonicalize + sign → returns `{attestation, signature, sigAlgo}`.

Important: wallet module should expose a *signing-only* API for attestation; do not expose private key bytes all over the runtime. Use an IPC or local RPC/agent if you want stronger separation.

## Node module (p2p.js)

* `startNode({ walletAttestor, loadNodeKey? })`:

  * If `loadNodeKey` present, use it. Else generate ephemeral node key.
  * Create libp2p with that `peerId`.
  * Call `walletAttestor.requestAttestation(nodePeerId)` (RPC into wallet module or call directly if same process).
  * Register `/app/attest/1.0.0` handler to publish the attestation to requesting peers.
  * Optionally, include attestation in multiaddr / identify metadata.

## Verification module

* `verifyAttestation(attestation, signature)`:

  * canonicalize(attestation) → verify signature using `attestation.walletPubKey` or resolved wallet public key from chain/registry.
  * Validate timestamps and nonce / revocation.
  * Return boolean + reason.

## Example pseudocode (attestation creation & verification)

```js
// create attestation (wallet side)
async function createAttestation(walletPrivKey, nodePeerId, ttlSeconds = 600) {
  const now = new Date().toISOString();
  const att = {
    type: 'wallet-node-attestation',
    walletPeerId: deriveWalletPeerId(walletPrivKey),
    walletPubKey: walletPrivKey.publicBytes, // or the on-chain address
    nodePeerId,
    issuedAt: now,
    expiresAt: new Date(Date.now() + ttlSeconds*1000).toISOString(),
    nonce: crypto.randomUUID(),
    version: '1'
  };
  const payload = canonicalize(att);
  const sig = await signWithWalletKey(walletPrivKey, payload);
  return { attestation: att, signature: sig, sigAlgo: 'ed25519' };
}

// verify attestation (peer side)
async function verifyAttestation(attestation, signature) {
  const payload = canonicalize(attestation);
  const walletPubKey = attestation.walletPubKey;
  if (!walletPubKey) throw Error('no pubkey');
  if (!verifySignature(walletPubKey, payload, signature)) return false;
  const now = new Date();
  if (new Date(attestation.issuedAt) > now) return false;
  if (new Date(attestation.expiresAt) < now) return false;
  // optional: check nonce not reused, check revocation
  return true;
}
```

# 6 — Storage & lifecycle

* **Where to store attestations?**

  * Do *not* store attestations long-term; they should be short-lived (e.g., 5–15 minutes) and re-issued upon node restart or rotation.
  * The wallet should store rotation history if desired, but attestations themselves are ephemeral.

* **Where to store node key?**

  * Optional: wallet file may include `node` object for persistent nodePeerId. If present it must be encrypted like wallet private key. If absent, node generates ephemeral key and immediately requests attestation.

# 7 — Rotation strategy

* Node rotates its libp2p key at any time:

  1. Generate new nodePeerId.
  2. Request new attestation signed by wallet (short TTL).
  3. Broadcast new attestation to peers.
* Old attestations expire automatically; maintain short TTL to avoid long-lived attested claims.

# 8 — Revocation strategy

* **On-chain revocation**: if the wallet key is compromised, you can publish a revocation tx (on-chain or in a public registry) listing revoked nodePeerIds and rotation events. Peers consult this registry optionally.
* **Local revocation**: maintain a revocation cache on peers for attestations seen from that wallet.
* If on-chain revocation is expensive or unavailable, include `nonce` sequences in attestations and keep a short TTL. Short TTL reduces the usefulness of stolen attestations.

# 9 — Security considerations & hardening

* **Canonicalization:** Use deterministic canonical JSON or protobuf for attestation payload before signing. This prevents signature verification errors caused by different encodings.
* **Nonces/timestamps:** Always include `issuedAt` and `expiresAt`. Use a `nonce` or a monotonic `seq` if you need strict ordering.
* **Secure storage:** Encrypt wallet private key at rest with a passphrase (KDF: scrypt/argon2 + AES-GCM) and use file permissions `600`.
* **Minimum trust in nodePeerId:** Never rely on nodePeerId for transaction signatures. NodePeerId is only for network addressing and authorization, not for cryptographic transaction validity.
* **DoS:** Attestations are signed; but verifying signatures can be heavy. Use caching and TTLs to reduce overhead.
* **Replay:** Short TTLs + optional per-peer nonce caches mitigate replay attacks.
* **Man-in-the-middle:** Use libp2p transports with encryption (default) so attestation exchange happens over encrypted channels.
* **Attestation scope & capabilities:** Limit what a signed attestation can authorize using `capabilities` field. Don’t give the node unlimited rights just because it has an attestation.

# 10 — Example developer checks & unit tests

Tests to implement:

1. **Attestation creation/verify unit test**

   * Create attestation, verify with correct pubkey (succeeds).
   * Modify payload, verify fails.

2. **Rotation & expiry test**

   * Issue attestation with short TTL; after expiry, verification fails.

3. **Transaction signing independence**

   * Sign a transaction with wallet key; verification should succeed regardless of nodePeerId.

4. **Node startup flows**

   * Start node with ephemeral key, request attestation, ensure attestation present and verified by a mock peer.
   * Start node with persisted node key, request attestation.

5. **Revocation test**

   * Revoke nodePeerId (simulate); verification fails.

# 11 — Alternative architecture (stronger binding)

If you absolutely want the node PeerID to be the authoritative persistent identity, consider:

A. **Hardware-backed PeerID**: store node key in a secure element (HSM, TPM, YubiKey). The libp2p peer id is then strongly bound to hardware and cannot be exported. Wallet signing key can still be separate. This is good for high-security nodes that must prove they are a particular physical host. Cons:

* Less portability (can't move wallet to another machine without hardware), more complex UX.

B. **Centralized registry / PKI**: maintain a registry that maps walletPubKey → authorized nodePeerIds (and their TLS certs). Nodes must fetch a certificate from the PKI proving their nodePeerId is authorized. This gives revocation & auditing but relies on a central authority.

C. **On-chain binding (decentralized registry)**: publish nodePeerId binding transactions on-chain signed by wallet key — a public authoritative binding. Peers consult the blockchain to verify nodePeerId ownership. Pros: decentralized and auditable. Cons: transaction costs, propagation delay, and less suitable for frequent rotation.

# 12 — Which approach to choose?

* If portability and multi-node-per-wallet are important: **recommended attestation approach** above.
* If you must ensure a node identity cannot be moved between hosts: choose **hardware-backed node key**.
* If you must make bindings publicly auditable and persistent: choose **on-chain binding**, but use it sparingly (for long-term bindings) combined with ephemeral attestations for runtime operations.

# 13 — Quick minimal implementation checklist (actionable)

1. Add `signAttestation(walletPrivKey, nodePeerId, ttl)` to wallet API.
2. Add `/app/attest/1.0.0` handler in p2p node that returns attestation + signature.
3. Add `verifyAttestation` helper that peers will use.
4. Ensure transactions are always verified using wallet signature only — audit code paths.
5. Use short TTLs (5–15 minutes) for attestations.
6. Add tests listed above.
7. Add optional on-chain binding or HSM support if required by policy.

# 14 — Example minimal attestation exchange (sequence)

1. Node starts, generates `nodePeerId`.
2. Node calls `wallet.signAttestation(nodePeerId)` → receives `{attestation, signature}`.
3. Node sets `currentAttestation = {attestation, signature}` and serves it on `/app/attest/1.0.0`.
4. Peer A wants to interact with wallet-related services of Node: Peer A requests `/app/attest/1.0.0`, verifies, allows interactions for TTL.
5. Node rotates nodePeerId after TTL or on restart, repeats steps.

# 15 — Final notes

This attestation-based architecture gives you:

* **Security**: wallet private key is the single source of truth for transactions; network identity can change without invalidating transactions.
* **Flexibility**: multiple nodes for same wallet, ephemeral nodes, roaming.
* **Simplicity**: peers verify via signatures — no central authority required.
* **Extensibility**: you can optionally add on-chain binding or hardware-backed keys if stronger guarantees are needed.

