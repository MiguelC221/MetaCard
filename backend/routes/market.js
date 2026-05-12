'use strict';

const router                      = require('express').Router();
const bcrypt                      = require('bcryptjs');
const { db, FieldValue }          = require('../firebase/adminSdk');
const verifyToken                 = require('../middleware/verifyToken');
const { isBalanceFrozen }         = require('../services/balanceService');
const { addTransactionToBatch }   = require('../services/transactionService');
const { sendNotificationToUser }  = require('../services/fcmService');

const LOW_BALANCE = Number(process.env.LOW_BALANCE_THRESHOLD) || 10000;

/* ─── POST /purchase — compra en el market con cardId + privateCode ──── */
router.post('/purchase', verifyToken, async (req, res) => {
  const { cardId, privateCode, productId, quantity = 1 } = req.body;

  if (!cardId || !privateCode || !productId)
    return res.status(400).json({ success: false, error: 'cardId, privateCode y productId son requeridos' });

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0)
    return res.status(400).json({ success: false, error: 'La cantidad debe ser un entero positivo' });

  try {
    /* ── 1. Buscar tarjeta ─────────────────────────────────────────── */
    const cardSnap = await db.collection('cards').doc(cardId.toUpperCase()).get();
    if (!cardSnap.exists)
      return res.status(404).json({ success: false, error: 'Tarjeta no encontrada' });

    const card = cardSnap.data();
    if (card.status !== 'active')
      return res.status(403).json({ success: false, error: 'Tarjeta bloqueada o inactiva' });

    /* ── 2. Verificar que la tarjeta pertenece al usuario autenticado ─ */
    if (card.userId !== req.uid)
      return res.status(403).json({ success: false, error: 'Esta tarjeta no te pertenece' });

    /* ── 3. Obtener comprador ──────────────────────────────────────── */
    const buyerSnap = await db.collection('users').doc(req.uid).get();
    if (!buyerSnap.exists)
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const buyer = buyerSnap.data();

    /* ── 4. Verificar PIN (privateCode) ───────────────────────────── */
    if (!buyer.privateCodeHash)
      return res.status(400).json({ success: false, error: 'No tienes un código privado configurado. Contacta soporte.' });

    const pinOk = await bcrypt.compare(String(privateCode), buyer.privateCodeHash);
    if (!pinOk)
      return res.status(401).json({ success: false, error: 'Código privado incorrecto' });

    /* ── 5. Verificar balance y congelamiento ─────────────────────── */
    if (isBalanceFrozen(buyer))
      return res.status(403).json({ success: false, error: 'Tu saldo está congelado por inactividad' });

    /* ── 6. Obtener producto ──────────────────────────────────────── */
    const productRef  = db.collection('products').doc(productId);
    const productSnap = await productRef.get();
    if (!productSnap.exists)
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });

    const product = productSnap.data();
    if (product.status !== 'approved')
      return res.status(400).json({ success: false, error: 'El producto no está disponible' });

    /* ── 7. Verificar stock (solo si tiene límite) ────────────────── */
    if (product.type === 'product') {
      if (product.stock < qty)
        return res.status(400).json({ success: false, error: `Stock insuficiente. Disponible: ${product.stock}` });
    }

    const totalAmount = product.price * qty;

    if ((buyer.balance || 0) < totalAmount)
      return res.status(402).json({ success: false, error: 'Saldo insuficiente', balance: buyer.balance || 0 });

    /* ── 8. Batch: descontar buyer, acreditar seller, decrementar stock */
    const balanceBefore = buyer.balance || 0;
    const balanceAfter  = balanceBefore - totalAmount;
    const batch = db.batch();

    // Actualizar comprador
    batch.update(db.collection('users').doc(req.uid), {
      balance:    FieldValue.increment(-totalAmount),
      lastUsedAt: FieldValue.serverTimestamp(),
      frozenAt:   null,
    });

    // Actualizar vendedor
    batch.update(db.collection('users').doc(product.sellerId), {
      balance: FieldValue.increment(totalAmount),
    });

    // Decrementar stock si es producto físico
    if (product.type === 'product') {
      batch.update(productRef, { stock: FieldValue.increment(-qty) });
    }

    // Crear transacción
    const txId = addTransactionToBatch(batch, {
      type:          'market_purchase',
      buyerId:       req.uid,
      sellerId:      product.sellerId,
      productId,
      productName:   product.name,
      productType:   product.type,
      quantity:      qty,
      amount:        totalAmount,
      cardId:        cardId.toUpperCase(),
      balanceBefore,
      balanceAfter,
      description:   `Compra: ${product.name} x${qty}`,
    });

    await batch.commit();

    /* ── 9. Notificaciones ────────────────────────────────────────── */
    sendNotificationToUser(req.uid, '🛒 Compra exitosa', `Compraste "${product.name}" por $${totalAmount.toLocaleString('es-CO')}.`, { type: 'market_purchase', txId }).catch(console.error);
    sendNotificationToUser(product.sellerId, '💰 Nueva venta', `Vendiste "${product.name}" x${qty} por $${totalAmount.toLocaleString('es-CO')}.`, { type: 'market_sale', txId }).catch(console.error);

    if (balanceAfter < LOW_BALANCE) {
      sendNotificationToUser(req.uid, '⚠️ Saldo bajo', `Tu saldo es $${balanceAfter.toLocaleString('es-CO')}.`).catch(console.error);
    }

    return res.json({
      success:       true,
      transactionId: txId,
      newBalance:    balanceAfter,
      productName:   product.name,
      amount:        totalAmount,
    });

  } catch (err) {
    console.error('[market/purchase]', err);
    return res.status(500).json({ success: false, error: 'Error interno', detail: err.message });
  }
});

module.exports = router;
