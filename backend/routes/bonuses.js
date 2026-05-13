'use strict';

const router                               = require('express').Router();
const { db, FieldValue }                   = require('../firebase/adminSdk');
const verifyToken                          = require('../middleware/verifyToken');
const { addTransactionToBatch }            = require('../services/transactionService');
const { sendNotificationToUser, MESSAGES } = require('../services/fcmService');

const WEEKLY_BONUS   = Number(process.env.WEEKLY_BONUS_AMOUNT)   || 500;
const REFERRAL_BONUS = Number(process.env.REFERRAL_BONUS_AMOUNT) || 20000;
const MAX_REFERRALS  = Number(process.env.MAX_REFERRALS)         || 5;
const MS_7_DAYS      = 7 * 24 * 60 * 60 * 1000;

router.post('/weekly', verifyToken, async (req, res) => {
  const userId = req.body.userId || req.user.uid;

  try {
    const userRef  = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const user     = userSnap.data();
    const lastClaim = user.weeklyBonusLastClaimed?.toDate?.() ?? null;
    const now       = Date.now();

    if (lastClaim && (now - lastClaim.getTime()) < MS_7_DAYS) {
      const nextAvailable = new Date(lastClaim.getTime() + MS_7_DAYS);
      return res.status(429).json({
        success: false,
        error:   'Bono semanal ya reclamado',
        nextAvailable: nextAvailable.toISOString(),
      });
    }

    const batch = db.batch();
    batch.update(userRef, {
      balance:               FieldValue.increment(WEEKLY_BONUS),
      weeklyBonusLastClaimed: FieldValue.serverTimestamp(),
    });
    addTransactionToBatch(batch, {
      type:        'bonus',
      buyerId:     userId,
      amount:      WEEKLY_BONUS,
      description: 'Bono semanal por uso de la app',
    });
    await batch.commit();

    const { title, body } = MESSAGES.bonusCredit(WEEKLY_BONUS);
    sendNotificationToUser(userId, title, body).catch(console.error);

    return res.json({ success: true, bonusAmount: WEEKLY_BONUS });

  } catch (err) {
    console.error('[bonuses/weekly]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/referral', verifyToken, async (req, res) => {
  const { referrerId, newBuyerId } = req.body;
  if (!referrerId || !newBuyerId) {
    return res.status(400).json({ success: false, error: 'referrerId y newBuyerId son requeridos' });
  }

  try {
    const referralRef  = db.collection('referrals').doc(referrerId);
    const referralSnap = await referralRef.get();
    const referralData = referralSnap.exists ? referralSnap.data() : { count: 0, referredUsers: [] };

    if (referralData.count >= MAX_REFERRALS) {
      return res.status(400).json({ success: false, error: `Límite de ${MAX_REFERRALS} referidos alcanzado` });
    }

    const alreadyReferred = referralData.referredUsers?.some(u => u.userId === newBuyerId);
    if (alreadyReferred) {
      return res.status(409).json({ success: false, error: 'Este usuario ya fue referido' });
    }

    const userRef = db.collection('users').doc(referrerId);
    const batch   = db.batch();

    batch.update(userRef, { balance: FieldValue.increment(REFERRAL_BONUS) });

    batch.set(referralRef, {
      count: FieldValue.increment(1),
      referredUsers: FieldValue.arrayUnion({
        userId:          newBuyerId,
        firstPurchaseAt: new Date(),
        bonusPaid:       true,
      }),
    }, { merge: true });

    addTransactionToBatch(batch, {
      type:        'referral',
      buyerId:     referrerId,
      amount:      REFERRAL_BONUS,
      description: `Bono referido por usuario ${newBuyerId}`,
    });

    await batch.commit();

    sendNotificationToUser(referrerId, MESSAGES.referralBonus.title, MESSAGES.referralBonus.body).catch(console.error);

    return res.json({ success: true, bonusAmount: REFERRAL_BONUS });

  } catch (err) {
    console.error('[bonuses/referral]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
