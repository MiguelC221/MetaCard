'use strict';

const router                            = require('express').Router();
const { db, FieldValue }                = require('../firebase/adminSdk');
const verifyToken                       = require('../middleware/verifyToken');
const { isBalanceFrozen }               = require('../services/balanceService');
const { calculateCashback }             = require('../services/cashbackService');
const { addTransactionToBatch }         = require('../services/transactionService');
const { sendNotificationToUser, MESSAGES } = require('../services/fcmService');

const LOW_BALANCE = Number(process.env.LOW_BALANCE_THRESHOLD) || 10000;


router.post('/process', verifyToken, async (req, res) => {
  const { cardUid, amount, sellerId } = req.body;

  // ── Validación básica ────────────────────────────────────────────────────
  if (!cardUid || !amount || !sellerId) {
    return res.status(400).json({ success: false, error: 'cardUid, amount y sellerId son requeridos' });
  }
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ success: false, error: 'El monto debe ser un número positivo' });
  }

  try {
    const cardSnap = await db.collection('cards').doc(cardUid).get();
    if (!cardSnap.exists) {
      return res.status(404).json({ success: false, error: 'Tarjeta no encontrada' });
    }
    const card = cardSnap.data();
    if (card.status !== 'active') {
      return res.status(403).json({ success: false, error: 'Tarjeta bloqueada o inactiva' });
    }

    const buyerSnap = await db.collection('users').doc(card.userId).get();
    if (!buyerSnap.exists) {
      return res.status(404).json({ success: false, error: 'Usuario comprador no encontrado' });
    }
    const buyer = buyerSnap.data();

    if (isBalanceFrozen(buyer)) {
      return res.status(403).json({ success: false, error: 'El saldo del comprador está congelado por inactividad' });
    }
    if ((buyer.balance || 0) < amountNum) {
      return res.status(402).json({ success: false, error: 'Saldo insuficiente', balance: buyer.balance || 0 });
    }

    const sellerSnap = await db.collection('users').doc(sellerId).get();
    if (!sellerSnap.exists) {
      return res.status(404).json({ success: false, error: 'Vendedor no encontrado' });
    }

    const cashback       = calculateCashback(amountNum);
    const balanceBefore  = buyer.balance || 0;
    const balanceAfter   = balanceBefore - amountNum + cashback;
    const buyerId        = card.userId;
    const batch = db.batch();

    batch.update(db.collection('users').doc(buyerId), {
      balance:     FieldValue.increment(-amountNum + cashback),
      lastUsedAt:  FieldValue.serverTimestamp(),
      frozenAt:    null,
    });

    batch.update(db.collection('users').doc(sellerId), {
      balance: FieldValue.increment(amountNum),
    });

    const paymentTxId = addTransactionToBatch(batch, {
      type:          'payment',
      cardUid,
      buyerId,
      sellerId,
      amount:        amountNum,
      balanceBefore,
      balanceAfter,
      cashbackAmount: cashback,
      description:   `Pago $${amountNum.toLocaleString('es-CO')} — cashback $${cashback.toLocaleString('es-CO')}`,
    });

    addTransactionToBatch(batch, {
      type:          'cashback',
      cardUid,
      buyerId,
      sellerId,
      amount:        cashback,
      balanceBefore: balanceBefore - amountNum,
      balanceAfter,
      description:   `Cashback 10% por pago de $${amountNum.toLocaleString('es-CO')}`,
    });

    await batch.commit();

    const { title, body } = MESSAGES.paymentSuccess(amountNum);
    sendNotificationToUser(buyerId, title, body, { type: 'payment', txId: paymentTxId }).catch(console.error);

    if (balanceAfter < LOW_BALANCE) {
      const lb = MESSAGES.lowBalance(balanceAfter);
      sendNotificationToUser(buyerId, lb.title, lb.body).catch(console.error);
    }

    return res.json({
      success:        true,
      transactionId:  paymentTxId,
      newBalance:     balanceAfter,
      cashbackApplied: cashback,
    });

  } catch (err) {
    console.error('[payments/process]', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor', detail: err.message });
  }
});

module.exports = router;
