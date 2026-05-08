'use strict';

const { db, FieldValue } = require('../firebase/adminSdk');

/**
 * @param {FirebaseFirestore.WriteBatch} batch
 * @param {Object} txData
 * @returns {string}
 */
function addTransactionToBatch(batch, txData) {
  const ref = db.collection('transactions').doc();
  batch.set(ref, {
    ...txData,
    status:    'completed',
    timestamp: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

async function createTransaction(txData) {
  const ref = db.collection('transactions').doc();
  await ref.set({
    ...txData,
    status:    'completed',
    timestamp: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

module.exports = { addTransactionToBatch, createTransaction };
