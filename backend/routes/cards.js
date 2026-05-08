'use strict';

const router                               = require('express').Router();
const { db, FieldValue }                   = require('../firebase/adminSdk');
const verifyToken                          = require('../middleware/verifyToken');
const { sendNotificationToUser, MESSAGES } = require('../services/fcmService');


router.post('/link', verifyToken, async (req, res) => {
  const { cardUid, targetUserId } = req.body;
  if (!cardUid) return res.status(400).json({ success: false, error: 'cardUid es requerido' });

  try {
    const cardRef = db.collection('cards').doc(cardUid);
    const cardSnap = await cardRef.get();

    if (cardSnap.exists) {
      return res.status(400).json({ success: false, error: 'Esta tarjeta ya está registrada.' });
    }

    let uidToLink = req.user.uid;

    if (targetUserId && targetUserId !== req.user.uid) {
      const userSnap = await db.collection('users').doc(req.user.uid).get();
      if (!userSnap.exists || userSnap.data().role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Solo administradores pueden vincular tarjetas a otros usuarios' });
      }
      uidToLink = targetUserId;
    }

    // Solo se permite una tarjeta activa por usuario a la vez
    const existingCards = await db.collection('cards').where('userId', '==', uidToLink).where('status', '==', 'active').get();
    if (!existingCards.empty) {
      return res.status(400).json({ success: false, error: 'El usuario ya tiene una tarjeta activa.' });
    }

    await cardRef.set({
      userId: uidToLink,
      status: 'active',
      registeredAt: FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, message: 'Tarjeta vinculada exitosamente' });
  } catch (err) {
    console.error('[cards/link]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});


router.post('/block', verifyToken, async (req, res) => {
  const { cardUid, action } = req.body;

  if (!cardUid || !['block', 'unblock'].includes(action)) {
    return res.status(400).json({ success: false, error: 'cardUid y action ("block"|"unblock") son requeridos' });
  }

  try {
    const cardRef  = db.collection('cards').doc(cardUid);
    const cardSnap = await cardRef.get();
    if (!cardSnap.exists) return res.status(404).json({ success: false, error: 'Tarjeta no encontrada' });

    const card   = cardSnap.data();
    const isOwner = card.userId === req.user.uid;

    // Verificar permisos: admin o dueño
    const userSnap = await db.collection('users').doc(req.user.uid).get();
    const isAdmin  = userSnap.exists && userSnap.data().role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, error: 'No tienes permisos para esta acción' });
    }

    const newStatus = action === 'block' ? 'blocked' : 'active';
    const updateData = {
      status: newStatus,
      ...(action === 'block'
        ? { blockedAt: FieldValue.serverTimestamp(), blockedBy: req.user.uid }
        : { unblockedAt: FieldValue.serverTimestamp() }),
    };

    await cardRef.update(updateData);

    const msg = action === 'block' ? MESSAGES.cardBlocked : MESSAGES.cardUnblocked;
    sendNotificationToUser(card.userId, msg.title, msg.body).catch(console.error);

    return res.json({ success: true, newStatus });

  } catch (err) {
    console.error('[cards/block]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
