/**
 * This file contains ledger-querying logic. It uses the LedgerManager for
 * efficient, indexed lookups, replacing the previous full DAG traversals.
 */

/**
 * Calculates the balance for a specific peer by iterating over their indexed transactions.
 * @param {string} peerId - The peerId string of the user.
 * @param {import('./ledgerManager.js').LedgerManager} ledgerManager - The ledger manager instance.
 * @returns {Promise<number>} - The calculated balance.
 */
export async function calculateBalance(peerId, ledgerManager) {
  let balance = 0;
  const transactions = await ledgerManager.getTransactionsForWallet(peerId);

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
 * Calculates the next nonce for a user based on their indexed transaction history.
 * @param {string} peerId - The peerId string of the user.
 * @param {import('./ledgerManager.js').LedgerManager} ledgerManager - The ledger manager instance.
 * @returns {Promise<number>} - The calculated nonce.
 */
export async function getNonce(peerId, ledgerManager) {
  let nonce = 0;
  const transactions = await ledgerManager.getTransactionsForWallet(peerId);

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
 * @param {import('./ledgerManager.js').LedgerManager} ledgerManager - The ledger manager instance.
 * @returns {Promise<number>} - The calculated sum of transactions.
 */
export async function calculateDailyTransactionSum(peerId, ledgerManager) {
  let sum = 0;
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  const transactions = await ledgerManager.getTransactionsForWallet(peerId);

  for (const transaction of transactions) {
    if (new Date(transaction.timestamp).getTime() < twentyFourHoursAgo) {
      continue; // Skip transactions older than 24 hours
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
 * @param {import('./ledgerManager.js').LedgerManager} ledgerManager - The ledger manager instance.
 * @returns {Promise<number>} - The calculated balance.
 */
export async function getWalletBalance(peerId, ledgerManager) {
    return calculateBalance(peerId, ledgerManager);
}

/**
 * Checks if a user has received a daily bonus in the last 24 hours using the index.
 * @param {string} peerId - The peerId string of the user.
 * @param {import('./ledgerManager.js').LedgerManager} ledgerManager - The ledger manager instance.
 * @returns {Promise<boolean>} - True if a bonus was received, false otherwise.
 */
export async function hasReceivedBonusToday(peerId, ledgerManager) {
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  const transactions = await ledgerManager.getTransactionsForWallet(peerId);

  for (const transaction of transactions) {
    if (new Date(transaction.timestamp).getTime() < twentyFourHoursAgo) {
      // Since transactions are sorted by date, we can stop early.
      break;
    }
    if (transaction.type === 'SETDAILYBONUS' && transaction.author === peerId) {
      return true;
    }
  }

  return false;
}

/**
 * Retrieves all transactions for a specific peerId using the LedgerManager's indexed method.
 * @param {string} peerId - The peerId string of the user.
 * @param {import('./ledgerManager.js').LedgerManager} ledgerManager - The ledger manager instance.
 * @returns {Promise<Array<object>>} - A promise that resolves to an array of transactions.
 */
export async function getTransactions(peerId, ledgerManager) {
  return ledgerManager.getTransactionsForWallet(peerId);
}
