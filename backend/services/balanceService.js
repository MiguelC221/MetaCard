'use strict';

const { db, FieldValue } = require('../firebase/adminSdk');
const { sendNotificationToUser, MESSAGES } = require('./fcmService');

const FREEZE_MS = 6 * 30 * 24 * 60 * 60 * 1000; 


function isBalanceFrozen(userData) {
  if (userData.frozenAt) return true;
  if (!userData.lastUsedAt) return false;
  const lastUsed = userData.lastUsedAt.toDate ? userData.lastUsedAt.toDate() : new Date(userData.lastUsedAt);
  return Date.now() - lastUsed.getTime() >= FREEZE_MS;
}


async function checkAndFreezeBalance(userId) {
  const ref = db.collection('users').doc(userId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data();
  if (data.frozenAt || data.balance <= 0) return;

  if (isBalanceFrozen(data)) {
    await ref.update({
      frozenAt: FieldValue.serverTimestamp(),
      frozenBalance: data.balance,
    });
    await sendNotificationToUser(userId, MESSAGES.balanceFrozen.title, MESSAGES.balanceFrozen.body);
    return { frozen: true, amount: data.balance };
  }
  return { frozen: false };
}

module.exports = { isBalanceFrozen, checkAndFreezeBalance };
