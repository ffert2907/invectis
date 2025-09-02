// get function list
// inspection script to check available exports
import * as peerIdFactory from '@libp2p/peer-id-factory';
import * as peerId from '@libp2p/peer-id';
import * as ckeys from '@libp2p/crypto/keys';
import * as ed25519 from '@noble/curves/ed25519.js'

console.log('@libp2p/peer-id-factory exports:', Object.keys(peerIdFactory));
console.log('@libp2p/peer-id exports:', Object.keys(peerId));
console.log('@libp2p/crypto/keys:', Object.keys(ckeys));
console.log('@noble/curves/ed25519:', Object.keys(ed25519));

/*
@libp2p/peer-id-factory exports: [
  'createEd25519PeerId',
  'createFromJSON',
  'createFromPrivKey',
  'createFromProtobuf',
  'createFromPubKey',
  'createRSAPeerId',
  'createSecp256k1PeerId',
  'exportToProtobuf'
]
@libp2p/peer-id exports: [
  'peerIdFromCID',
  'peerIdFromMultihash',
  'peerIdFromPrivateKey',
  'peerIdFromPublicKey',
  'peerIdFromString'
]
@libp2p/crypto/keys: [
  'generateEphemeralKeyPair',
  'generateKeyPair',
  'generateKeyPairFromSeed',
  'keyStretcher',
  'privateKeyFromCryptoKeyPair',
  'privateKeyFromProtobuf',
  'privateKeyFromRaw',
  'privateKeyToCryptoKeyPair',
  'privateKeyToProtobuf',
  'publicKeyFromMultihash',
  'publicKeyFromProtobuf',
  'publicKeyFromRaw',
  'publicKeyToProtobuf'
]
@noble/curves/ed25519: [
  'ED25519_TORSION_SUBGROUP',
  'ed25519',
  'ed25519_hasher',
  'ed25519ctx',
  'ed25519ph',
  'ristretto255',
  'ristretto255_hasher',
  'ristretto255_oprf',
  'x25519'
]

*/
