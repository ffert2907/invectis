import { CID } from 'multiformats/cid';

/**
 * Retrieves all transactions for a specific peerId using the index.
 * @param {string} peerId - The peerId string of the user whose transactions are being retrieved.
 * @param {object} appContext - The shared application context.
 * @returns {Promise<Array<object>>} - A promise that resolves to an array of transactions.
 */
export async function getTransactions(peerId, appContext) {
  if (!appContext.indexStore || !appContext.j) {
    throw new Error("Index store or Helia instance not available in appContext.");
  }

  const txCids = await appContext.indexStore.getTransactionsForWallet(peerId);
  const transactions = [];

  for (const cidString of txCids) {
    try {
      const cid = CID.parse(cidString);
      const transaction = await appContext.j.get(cid);
      if (transaction) {
        transactions.push({ id: cidString, ...transaction });
      }
    } catch (error) {
      console.error(`Error retrieving transaction for CID ${cidString}:`, error);
    }
  }

  // Sort transactions by timestamp, descending
  return transactions.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Calculates the balance for a specific peerId by processing their transactions.
 * @param {string} peerId - The peerId string of the user whose balance is being calculated.
 * @param {object} appContext - The shared application context.
 * @returns {Promise<number>} - The calculated balance.
 */
export async function calculateBalance(peerId, appContext) {
  const transactions = await getTransactions(peerId, appContext);
  let balance = 0;

  for (const transaction of transactions) {
    switch (transaction.type) {
      case 'GENESIS':
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
  }

  return balance;
}

/**
 * Calculates the next nonce for a user based on their transaction history.
 * @param {string} peerId - The peerId string of the user.
 * @param {object} appContext - The shared application context.
 * @returns {Promise<number>} - The calculated nonce.
 */
export async function getNonce(peerId, appContext) {
  const transactions = await getTransactions(peerId, appContext);
  let nonce = 0;

  for (const transaction of transactions) {
    if (transaction.author === peerId) {
      if (transaction.type === 'PAYMENT' || transaction.type === 'VECTOR_TRANSACTION') {
        nonce++;
      }
    }
  }

  return nonce;
}

/**
 * Calculates the sum of transactions for a specific peerId in the last 24 hours.
 * @param {string} peerId - The peerId string of the user.
 * @param {object} appContext - The shared application context.
 * @returns {Promise<number>} - The calculated sum of transactions.
 */
export async function calculateDailyTransactionSum(peerId, appContext) {
  const transactions = await getTransactions(peerId, appContext);
  let sum = 0;
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

  for (const transaction of transactions) {
    if (transaction.timestamp < twentyFourHoursAgo) {
      continue;
    }

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
  }

  return sum;
}

/**
 * A wrapper function to get the balance of a wallet.
 * @param {string} peerId - The peerId string of the user.
 * @param {object} appContext - The shared application context.
 * @returns {Promise<number>} - The calculated balance.
 */
export async function getWalletBalance(peerId, appContext) {
    return calculateBalance(peerId, appContext);
}

/**
 * Checks if a user has received a daily bonus in the last 24 hours.
 * @param {string} peerId - The peerId string of the user.
 * @param {object} appContext - The shared application context.
 * @returns {Promise<boolean>} - True if a bonus was received, false otherwise.
 */
export async function hasReceivedBonusToday(peerId, appContext) {
  const transactions = await getTransactions(peerId, appContext);
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

  for (const transaction of transactions) {
    if (transaction.timestamp < twentyFourHoursAgo) {
      continue; // Optimization: transactions are sorted, so we can break early
    }
    if (transaction.type === 'SETDAILYBONUS' && transaction.author === peerId) {
      return true;
    }
  }

  return false;
}
