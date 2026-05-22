'use strict';

const router                               = require('express').Router();
const { db, FieldValue }                   = require('../firebase/adminSdk');
const verifyToken                          = require('../middleware/verifyToken');
const verifyAdmin                          = require('../middleware/verifyAdmin');
const { calculateLevel, upgradeLevel }     = require('../services/membershipService');
const { addTransactionToBatch }            = require('../services/transactionService');
const { sendNotificationToUser, MESSAGES } = require('../services/fcmService');

const LARGE_THRESHOLD = Number(process.env.LARGE_RECHARGE_THRESHOLD) || 100000;
const LARGE_BONUS     = Number(process.env.LARGE_RECHARGE_BONUS)     || 30000;

router.post('/request', verifyToken, async (req, res) => {
  const { amount, method } = req.body;
  if (!amount || !method) {
    return res.status(400).json({ success: false, error: 'amount y method son requeridos' });
  }

  try {
    const newReq = {
      userId: req.user.uid,
      amount: Number(amount),
      method,
      status: 'pending',
      requestedAt: FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('rechargeRequests').add(newReq);

    return res.json({ success: true, requestId: docRef.id });
  } catch (err) {
    console.error('[recharges/request]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/approve', verifyToken, verifyAdmin, async (req, res) => {
  const { rechargeRequestId } = req.body;
  if (!rechargeRequestId) {
    return res.status(400).json({ success: false, error: 'rechargeRequestId requerido' });
  }

  try {
    const reqRef  = db.collection('rechargeRequests').doc(rechargeRequestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });

    const request = reqSnap.data();
    if (request.status !== 'pending') {
      return res.status(409).json({ success: false, error: `La solicitud ya está en estado: ${request.status}` });
    }

    const { userId, amount } = request;
    const userRef  = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const user            = userSnap.data();
    const newTotal        = (user.totalRecharged || 0) + amount;
    const calculatedLevel = calculateLevel(newTotal);
    const newLevel        = upgradeLevel(user.membershipLevel, calculatedLevel);
    const bonusApplied    = amount >= LARGE_THRESHOLD;
    const bonusAmount     = bonusApplied ? LARGE_BONUS : 0;
    const totalCredit     = amount + bonusAmount;

    const batch = db.batch();

    batch.update(reqRef, {
      status:      'approved',
      approvedAt:  FieldValue.serverTimestamp(),
      approvedBy:  req.user.uid,
      bonusApplied,
    });

    batch.update(userRef, {
      balance:         FieldValue.increment(totalCredit),
      totalRecharged:  FieldValue.increment(amount),
      membershipLevel: newLevel,
    });

    addTransactionToBatch(batch, {
      type:        'recharge',
      buyerId:     userId,
      amount,
      description: `Recarga aprobada $${amount.toLocaleString('es-CO')}`,
    });

    if (bonusApplied) {
      addTransactionToBatch(batch, {
        type:        'bonus',
        buyerId:     userId,
        amount:      bonusAmount,
        description: `Bono gran recarga $${bonusAmount.toLocaleString('es-CO')}`,
      });
    }

    await batch.commit();

    const { title, body } = MESSAGES.rechargeApproved(totalCredit);
    sendNotificationToUser(userId, title, body).catch(console.error);

    return res.json({
      success:           true,
      newBalance:        (user.balance || 0) + totalCredit,
      newMembershipLevel: newLevel,
      bonusApplied,
      bonusAmount,
    });

  } catch (err) {
    console.error('[recharges/approve]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/reject', verifyToken, verifyAdmin, async (req, res) => {
  const { rechargeRequestId, reason } = req.body;
  if (!rechargeRequestId || !reason) {
    return res.status(400).json({ success: false, error: 'rechargeRequestId y reason son requeridos' });
  }

  try {
    const reqRef  = db.collection('rechargeRequests').doc(rechargeRequestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
    if (reqSnap.data().status !== 'pending') {
      return res.status(409).json({ success: false, error: 'La solicitud ya fue procesada' });
    }

    await reqRef.update({
      status:          'rejected',
      rejectionReason: reason,
      rejectedAt:      FieldValue.serverTimestamp(),
      rejectedBy:      req.user.uid,
    });

    const { title, body } = MESSAGES.rechargeRejected(reason);
    sendNotificationToUser(reqSnap.data().userId, title, body).catch(console.error);

    return res.json({ success: true });

  } catch (err) {
    console.error('[recharges/reject]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
