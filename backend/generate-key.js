import { keys } from '@libp2p/crypto';
import { Buffer } from 'buffer';

async function generateKey() {
  const privateKey = await keys.generateKeyPair('Ed25519');
  const marshalledKey = keys.privateKeyToProtobuf(privateKey);
  console.log(Buffer.from(marshalledKey).toString('base64'));
}

generateKey();
