import { CID } from 'multiformats/cid';

/**
 * Traverses the transaction DAG to calculate the balance for a specific peerId.
 * @param {string} peerId - The peerId string of the user whose balance is being calculated.
 * @param {Array<CID>} dagHeads - An array of CIDs representing the current heads of the DAG.
 * @param {object} heliaInstance - The Helia/JSON instance for retrieving transactions.
 * @returns {Promise<number>} - The calculated balance.
 */
export async function calculateBalance(peerId, dagHeads, heliaInstance) {
  let balance = 0;
  const visited = new Set();
  const queue = [...dagHeads]; // Start with the current heads

  while (queue.length > 0) {
    const cid = queue.shift();
    const cidString = cid.toString();

    if (visited.has(cidString)) {
      continue;
    }
    visited.add(cidString);

    try {
      const transaction = await heliaInstance.get(cid);
      if (!transaction) continue;

      // Process transaction based on its type
      switch (transaction.type) {
        case 'GENESIS':
          // Genesis transactions only credit the recipient.
          if (transaction.payload.to === peerId) {
            balance += transaction.payload.amount;
          }
          break;
        case 'PAYMENT':
          if (transaction.author === peerId) {
            balance -= transaction.payload.amount;
          }
          if (transaction.payload.to === peerId) {
            balance += transaction.payload.amount;
          }
          break;
        case 'VECTOR_TRANSACTION':
          if (transaction.author === peerId) {
            balance -= transaction.payload.totalTime;
          }
          if (transaction.payload.to === peerId) {
            balance += transaction.payload.totalTime;
          }
          break;
        case 'SETDAILYBONUS':
          if (transaction.author === peerId) {
            balance += transaction.payload.bonus;
          }
          break;
      }

      if (transaction.parents && transaction.parents.length > 0) {
        for (const parentCidString of transaction.parents) {
          if (!visited.has(parentCidString)) {
            queue.push(CID.parse(parentCidString));
          }
        }
      }
    } catch (error) {
      console.error(`Error processing transaction with CID ${cidString}:`, error);
    }
  }

  return balance;
}

/**
 * Traverses the transaction DAG to calculate the next nonce for a user.
 * @param {string} peerId - The peerId string of the user.
 * @param {Array<CID>} dagHeads - An array of CIDs representing the current heads of the DAG.
 * @param {object} heliaInstance - The Helia/JSON instance for retrieving transactions.
 * @returns {Promise<number>} - The calculated nonce.
 */
export async function getNonce(peerId, dagHeads, heliaInstance) {
  let nonce = 0;
  const visited = new Set();
  const queue = [...dagHeads];

  while (queue.length > 0) {
    const cid = queue.shift();
    const cidString = cid.toString();

    if (visited.has(cidString)) {
      continue;
    }
    visited.add(cidString);

    try {
      const transaction = await heliaInstance.get(cid);
      if (!transaction) continue;

      if (transaction.author === peerId) {
        if (transaction.type === 'PAYMENT' || transaction.type === 'VECTOR_TRANSACTION') {
          nonce++;
        }
      }

      if (transaction.parents && transaction.parents.length > 0) {
        for (const parentCidString of transaction.parents) {
          if (!visited.has(parentCidString)) {
            queue.push(CID.parse(parentCidString));
          }
        }
      }
    } catch (error) {
      console.error(`Error processing transaction with CID ${cidString} for nonce calculation:`, error);
    }
  }

  return nonce;
}

/**
 * Traverses the transaction DAG to calculate the sum of transactions for a specific peerId in the last 24 hours.
 * @param {string} peerId - The peerId string of the user.
 * @param {Array<CID>} dagHeads - An array of CIDs representing the current heads of the DAG.
 * @param {object} heliaInstance - The Helia/JSON instance for retrieving transactions.
 * @returns {Promise<number>} - The calculated sum of transactions.
 */
export async function calculateDailyTransactionSum(peerId, dagHeads, heliaInstance) {
  let sum = 0;
  const visited = new Set();
  const queue = [...dagHeads];
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

  while (queue.length > 0) {
    const cid = queue.shift();
    const cidString = cid.toString();

    if (visited.has(cidString)) {
      continue;
    }
    visited.add(cidString);

    try {
      const transaction = await heliaInstance.get(cid);
      if (!transaction || transaction.timestamp < twentyFourHoursAgo) {
        continue;
      }

      // Process transaction based on its type
      switch (transaction.type) {
        case 'PAYMENT':
          if (transaction.author === peerId) {
            sum -= transaction.payload.amount;
          }
          if (transaction.payload.to === peerId) {
            sum += transaction.payload.amount;
          }
          break;
        case 'VECTOR_TRANSACTION':
          if (transaction.author === peerId) {
            sum -= transaction.payload.totalTime;
          }
          if (transaction.payload.to === peerId) {
            sum += transaction.payload.totalTime;
          }
          break;
      }

      if (transaction.parents && transaction.parents.length > 0) {
        for (const parentCidString of transaction.parents) {
          if (!visited.has(parentCidString)) {
            queue.push(CID.parse(parentCidString));
          }
        }
      }
    } catch (error) {
      console.error(`Error processing transaction with CID ${cidString}:`, error);
    }
  }

  return sum;
}

/**
 * A wrapper function to get the balance of a wallet.
 * @param {string} peerId - The peerId string of the user.
 * @param {Array<CID>} dagHeads - An array of CIDs representing the current heads of the DAG.
 * @param {object} heliaInstance - The Helia/JSON instance for retrieving transactions.
 * @returns {Promise<number>} - The calculated balance.
 */
export async function getWalletBalance(peerId, dagHeads, heliaInstance) {
    return calculateBalance(peerId, dagHeads, heliaInstance);
}

/**
 * Traverses the transaction DAG to check if a user has received a daily bonus in the last 24 hours.
 * @param {string} peerId - The peerId string of the user.
 * @param {Array<CID>} dagHeads - An array of CIDs representing the current heads of the DAG.
 * @param {object} heliaInstance - The Helia/JSON instance for retrieving transactions.
 * @returns {Promise<boolean>} - True if a bonus was received, false otherwise.
 */
export async function hasReceivedBonusToday(peerId, dagHeads, heliaInstance) {
  const visited = new Set();
  const queue = [...dagHeads];
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

  while (queue.length > 0) {
    const cid = queue.shift();
    const cidString = cid.toString();

    if (visited.has(cidString)) {
      continue;
    }
    visited.add(cidString);

    try {
      const transaction = await heliaInstance.get(cid);
      if (!transaction || transaction.timestamp < twentyFourHoursAgo) {
        continue;
      }

      if (transaction.type === 'SETDAILYBONUS' && transaction.author === peerId) {
        return true; // Found a bonus transaction from the user in the last 24 hours
      }

      if (transaction.parents && transaction.parents.length > 0) {
        for (const parentCidString of transaction.parents) {
          if (!visited.has(parentCidString)) {
            queue.push(CID.parse(parentCidString));
          }
        }
      }
    } catch (error) {
      console.error(`Error processing transaction with CID ${cidString} for bonus check:`, error);
    }
  }

  return false; // No bonus transaction found
}

