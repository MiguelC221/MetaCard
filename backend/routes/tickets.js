'use strict';

const router             = require('express').Router();
const { db, FieldValue } = require('../firebase/adminSdk');
const verifyToken        = require('../middleware/verifyToken');
const { sendNotificationToUser } = require('../services/fcmService');

async function assertAdmin(uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists && snap.data().role === 'admin';
}

/* ─── POST /:id/respond — admin responde a un ticket ────────────────── */
router.post('/:id/respond', verifyToken, async (req, res) => {
  if (!await assertAdmin(req.uid))
    return res.status(403).json({ success: false, error: 'Solo administradores pueden responder tickets' });

  const { response } = req.body;
  if (!response || !response.trim())
    return res.status(400).json({ success: false, error: 'La respuesta no puede estar vacía' });

  try {
    const ref  = db.collection('tickets').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists)
      return res.status(404).json({ success: false, error: 'Ticket no encontrado' });

    const ticket = snap.data();
    if (ticket.status === 'closed')
      return res.status(400).json({ success: false, error: 'El ticket ya está cerrado' });

    await ref.update({
      adminResponse:  response.trim(),
      respondedAt:    FieldValue.serverTimestamp(),
      respondedBy:    req.uid,
      status:         'inProgress',
    });

    // Notificar al usuario
    sendNotificationToUser(
      ticket.userId,
      '📬 Respuesta a tu ticket',
      `Tu ticket "${ticket.subject}" ha sido respondido por el equipo de soporte.`,
      { type: 'ticket_response', ticketId: req.params.id }
    ).catch(console.error);

    return res.json({ success: true });
  } catch (err) {
    console.error('[tickets/respond]', err);
    return res.status(500).json({ success: false, error: 'Error interno', detail: err.message });
  }
});

/* ─── POST /:id/close — admin cierra un ticket ───────────────────────── */
router.post('/:id/close', verifyToken, async (req, res) => {
  if (!await assertAdmin(req.uid))
    return res.status(403).json({ success: false, error: 'Solo administradores' });

  try {
    const ref  = db.collection('tickets').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists)
      return res.status(404).json({ success: false, error: 'Ticket no encontrado' });

    await ref.update({
      status:     'closed',
      resolvedAt: FieldValue.serverTimestamp(),
      resolvedBy: req.uid,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[tickets/close]', err);
    return res.status(500).json({ success: false, error: 'Error interno', detail: err.message });
  }
});

module.exports = router;
