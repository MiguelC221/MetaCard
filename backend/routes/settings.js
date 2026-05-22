'use strict';

const express      = require('express');
const router       = express.Router();
const verifyToken  = require('../middleware/verifyToken');
const verifyAdmin  = require('../middleware/verifyAdmin');
const { db }       = require('../firebase/adminSdk');

// ── GET /settings/cinema2x1 — obtener días de promo 2×1 ─────────────────────
router.get('/cinema2x1', verifyToken, async (req, res) => {
  try {
    const snap = await db.collection('settings').doc('cinema2x1').get();
    if (!snap.exists) {
      return res.json({ success: true, promoDays: [4] }); // default jueves
    }
    res.json({ success: true, promoDays: snap.data().promoDays || [4] });
  } catch (err) {
    console.error('[settings/cinema2x1 GET]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /settings/cinema2x1 — guardar días de promo 2×1 (solo admin) ───────
router.post('/cinema2x1', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { promoDays } = req.body;
    if (!Array.isArray(promoDays)) {
      return res.status(400).json({ success: false, error: 'promoDays debe ser un arreglo' });
    }
    await db.collection('settings').doc('cinema2x1').set(
      { promoDays, updatedAt: new Date() },
      { merge: true }
    );
    res.json({ success: true, message: 'Configuración 2×1 actualizada' });
  } catch (err) {
    console.error('[settings/cinema2x1 POST]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
