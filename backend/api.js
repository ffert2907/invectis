/**
 * This file contains functions to format backend data for the frontend.
 */

/**
 * Takes a structured DAG transaction node and its CID and flattens it
 * into a single-level object for easier consumption by a UI.
 *
 * @param {import('multiformats/cid').CID} cid - The Content ID of the transaction.
 * @param {object} transactionNode - The raw transaction object from the blockstore.
 * @returns {object} A flattened transaction object.
 */
export function formatTransactionForFrontend(cid, transactionNode) {
  // Combine the top-level metadata with the nested payload properties
  const formattedTransaction = {
    cid: cid.toString(),
    parents: transactionNode.parents,
    author: transactionNode.author,
    timestamp: transactionNode.timestamp,
    type: transactionNode.type,
    ...transactionNode.payload // Spread the payload properties into the top level
  };

  return formattedTransaction;
}
