'use strict';

const router                      = require('express').Router();
const bcrypt                      = require('bcryptjs');
const { db, FieldValue }          = require('../firebase/adminSdk');
const verifyToken                 = require('../middleware/verifyToken');
const { isBalanceFrozen }         = require('../services/balanceService');
const { addTransactionToBatch }   = require('../services/transactionService');
const { sendNotificationToUser }  = require('../services/fcmService');
const { logSecurityAlert }        = require('../services/securityService');
const { issueCinemaTicket }       = require('../services/cineService');

const LOW_BALANCE = Number(process.env.LOW_BALANCE_THRESHOLD) || 10000;

/* ─── POST /purchase — compra en el market con cardId + privateCode ──── */
router.post('/purchase', verifyToken, async (req, res) => {
  const { cardId, privateCode, productId, quantity = 1, selectedSeats, applyThursday2x1 } = req.body;

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
    if (card.status !== 'active') {
      await logSecurityAlert({ userId: card.userId, type: 'blocked_card_attempt', description: `Intento de compra en market con tarjeta inactiva (${cardId})`, metadata: { productId, quantity }, notifyUser: true });
      return res.status(403).json({ success: false, error: 'Tarjeta bloqueada o inactiva' });
    }

    /* ── 2. Verificar que la tarjeta pertenece al usuario autenticado ─ */
    if (card.userId !== req.uid) {
      await logSecurityAlert({ userId: req.uid, type: 'unusual_movement', description: `Intento de usar tarjeta de otro usuario (${cardId})`, metadata: { cardOwner: card.userId, productId } });
      return res.status(403).json({ success: false, error: 'Esta tarjeta no te pertenece' });
    }

    /* ── 3. Obtener comprador ──────────────────────────────────────── */
    const buyerSnap = await db.collection('users').doc(req.uid).get();
    if (!buyerSnap.exists)
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const buyer = buyerSnap.data();

    /* ── 4. Verificar PIN (privateCode) ───────────────────────────── */
    if (!buyer.privateCodeHash)
      return res.status(400).json({ success: false, error: 'No tienes un código privado configurado. Contacta soporte.' });

    const pinOk = await bcrypt.compare(String(privateCode), buyer.privateCodeHash);
    if (!pinOk) {
      await logSecurityAlert({ userId: req.uid, type: 'invalid_pin', description: `Intento de compra con PIN incorrecto`, metadata: { productId } });
      return res.status(401).json({ success: false, error: 'Código privado incorrecto' });
    }

    /* ── 5. Verificar balance y congelamiento ─────────────────────── */
    if (isBalanceFrozen(buyer)) {
      await logSecurityAlert({ userId: req.uid, type: 'frozen_balance_attempt', description: `Intento de compra en market con saldo congelado`, metadata: { productId } });
      return res.status(403).json({ success: false, error: 'Tu saldo está congelado por inactividad' });
    }

    /* ── 6. Obtener producto ──────────────────────────────────────── */
    const productRef  = db.collection('products').doc(productId);
    const productSnap = await productRef.get();
    if (!productSnap.exists)
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });

    const product = productSnap.data();
    if (product.status !== 'approved')
      return res.status(400).json({ success: false, error: 'El producto no está disponible' });

    /* ── 7. Verificar stock o sillas ──────────────────────────────── */
    if (product.type === 'product') {
      if (product.stock < qty)
        return res.status(400).json({ success: false, error: `Stock insuficiente. Disponible: ${product.stock}` });
    } else if (product.type === 'cinema') {
      if (!selectedSeats || selectedSeats.length === 0)
        return res.status(400).json({ success: false, error: 'Debes seleccionar al menos una silla' });
      if (selectedSeats.length !== qty)
        return res.status(400).json({ success: false, error: 'La cantidad de sillas no coincide' });
      
      const reserved = product.reservedSeats || [];
      const overlaps = selectedSeats.filter(s => reserved.includes(s));
      if (overlaps.length > 0)
        return res.status(400).json({ success: false, error: `Las sillas ${overlaps.join(', ')} ya están ocupadas` });
    }

    let totalAmount = product.price * qty;
    let discountApplied = 0;
    let discountPercentage = 0;
    let convenioId = null;
    let thursday2x1Applied = false;

    /* ── 7.5 Jueves 2×1 en cine ────────────────────────────────────── */
    if (product.type === 'cinema' && applyThursday2x1) {
      // Verify server-side that today is a promo day
      const today = new Date();
      // Use Colombia timezone (UTC-5) for consistency
      const colombiaOffset = -5 * 60; // minutes
      const utcMinutes = today.getUTCHours() * 60 + today.getUTCMinutes();
      const colombiaDate = new Date(today.getTime() + (colombiaOffset * 60 * 1000));
      const dayOfWeek = colombiaDate.getUTCDay(); // 0=Sun, 4=Thu
      
      // Load config from Firestore
      let promoDays = [4]; // Default Thursday
      try {
        const settingsSnap = await db.collection('settings').doc('cinema2x1').get();
        if (settingsSnap.exists) {
          promoDays = settingsSnap.data().promoDays || [4];
        }
      } catch (err) {
        console.error('[Market] Error fetching cinema promo days:', err);
      }
      
      if (promoDays.includes(dayOfWeek)) {
        // Thursday 2x1: only charge for half the tickets (ceil to handle odd numbers)
        const paidSeats = Math.ceil(qty / 2);
        const freeSeats = qty - paidSeats;
        const thursday2x1Discount = product.price * freeSeats;
        totalAmount = totalAmount - thursday2x1Discount;
        discountApplied += thursday2x1Discount;
        thursday2x1Applied = true;
        console.log(`[Market] Jueves 2x1 aplicado: ${qty} boletas, pagando ${paidSeats}, gratis ${freeSeats}. Descuento: $${thursday2x1Discount}`);
      }
    }

    /* ── 7.6 Verificar descuento por convenio ─────────────────────── */
    const userEmail = buyer.email?.toLowerCase() || '';
    const emailDomain = userEmail.split('@')[1];
    
    if (emailDomain) {
      const conveniosSnap = await db.collection('convenios')
        .where('emailDomain', '==', emailDomain)
        .where('status', '==', 'active')
        .limit(1)
        .get();

      if (!conveniosSnap.empty) {
        const convenio = conveniosSnap.docs[0].data();
        // Seleccionar descuento según tipo de producto
        const isService = product.type === 'service';
        discountPercentage = isService 
          ? (convenio.discountServices || 0)
          : (convenio.discountProducts || 0);
        const convenioDiscount = Math.round(totalAmount * (discountPercentage / 100));
        discountApplied += convenioDiscount;
        totalAmount = totalAmount - convenioDiscount;
        convenioId = conveniosSnap.docs[0].id;
      }
    }

    if ((buyer.balance || 0) < totalAmount) {
      await logSecurityAlert({ userId: req.uid, type: 'insufficient_funds', description: `Intento de compra fallido por saldo insuficiente ($${totalAmount})`, metadata: { amount: totalAmount, balance: buyer.balance || 0, productId } });
      return res.status(402).json({ success: false, error: 'Saldo insuficiente', balance: buyer.balance || 0 });
    }

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
    } else if (product.type === 'cinema') {
      batch.update(productRef, { reservedSeats: FieldValue.arrayUnion(...selectedSeats) });
    }

    /* ── 9. Emisión de boletos de cine (si aplica) ────────────────── */
    let cinemaTicket = null;
    if (product.type === 'cinema') {
      const provider = product.cinemaProvider || 'Cine Colombia';
      cinemaTicket = await issueCinemaTicket(req.uid, provider, product.name, qty, selectedSeats).catch(e => {
        console.error('[CineService] Error emitiendo boleto:', e);
        return null;
      });
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
      originalPrice: product.price * qty,
      discountApplied,
      discountPercentage,
      amount:        totalAmount,
      cardId:        cardId.toUpperCase(),
      convenioId,
      balanceBefore,
      balanceAfter,
      description:   `Compra: ${product.name} x${qty}${thursday2x1Applied ? ' (2×1 Cine)' : ''}${discountPercentage > 0 ? ` (DESC: ${discountPercentage}%)` : ''}`,
      selectedSeats: selectedSeats || [],
      ...(cinemaTicket && { cinemaTicket })
    });

    await batch.commit();

    /* ── 10. Notificaciones ────────────────────────────────────────── */
    sendNotificationToUser(req.uid, '🛒 Compra exitosa', `Compraste "${product.name}" por $${totalAmount.toLocaleString('es-CO')}.`, { type: 'market_purchase', txId }).catch(console.error);
    sendNotificationToUser(product.sellerId, '💰 Nueva venta', `Vendiste "${product.name}" x${qty} por $${totalAmount.toLocaleString('es-CO')}.`, { type: 'market_sale', txId }).catch(console.error);

    if (balanceAfter < LOW_BALANCE) {
      sendNotificationToUser(req.uid, '⚠️ Saldo bajo', `Tu saldo es $${balanceAfter.toLocaleString('es-CO')}.`).catch(console.error);
    }

    return res.json({
      success:              true,
      transactionId:        txId,
      newBalance:           balanceAfter,
      productName:          product.name,
      originalAmount:       product.price * qty,
      discountApplied,
      discountPercentage,
      finalAmount:          totalAmount,
      ...(discountApplied > 0 && { discountMessage: thursday2x1Applied 
        ? `¡Día de Cine 2×1 aplicado! ${Math.floor(qty/2)} boleta(s) gratis. Ahorro: $${(product.price * Math.floor(qty/2)).toLocaleString('es-CO')}${discountPercentage > 0 ? ` + convenio ${discountPercentage}%` : ''}`
        : `¡Descuento por convenio aplicado! -$${discountApplied.toLocaleString('es-CO')}` }),
      ...(cinemaTicket && { cinemaTicket })
    });

  } catch (err) {
    console.error('[market/purchase]', err);
    return res.status(500).json({ success: false, error: 'Error interno', detail: err.message });
  }
});

module.exports = router;
