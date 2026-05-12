'use strict';

const express     = require('express');
const router      = express.Router();
const bcrypt      = require('bcryptjs');
const admin       = require('firebase-admin');
const db          = admin.firestore();
const verifyToken = require('../middleware/verifyToken');

/* ─── POST /register — registro inicial de usuario ───────────────────── */
router.post('/register', async (req, res) => {
  try {
    const { uid, name, email, identification, referral } = req.body;

    if (!uid || !email)
      return res.status(400).json({ success: false, error: 'Faltan datos obligatorios' });

    const userRef  = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (userSnap.exists)
      return res.json({ success: true, message: 'Usuario ya existía' });

    // Código de referido único
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Generar PIN privado de 6 dígitos
    const privateCodePlain = String(Math.floor(100000 + Math.random() * 900000));
    const privateCodeHash  = await bcrypt.hash(privateCodePlain, 10);

    const userData = {
      name:                   name || '',
      email,
      identification:         identification || '',
      role:                   'buyer',
      balance:                10000,
      frozenBalance:          0,
      totalRecharged:         0,
      membershipLevel:        'vital',
      referralCode,
      referredBy:             referral || null,
      weeklyBonusLastClaimed: null,
      fcmToken:               null,
      lastUsedAt:             null,
      frozenAt:               null,
      privateCodeHash,
      privateCodeCreatedAt:   admin.firestore.FieldValue.serverTimestamp(),
      createdAt:              admin.firestore.FieldValue.serverTimestamp(),
    };

    await userRef.set(userData);

    // Retornamos el PIN en texto plano UNA SOLA VEZ (no se guarda en Firestore)
    return res.json({
      success:          true,
      message:          'Usuario registrado correctamente',
      userData,
      privateCodePlain,
    });
  } catch (err) {
    console.error('[users/register]', err);
    return res.status(500).json({ success: false, error: 'Error interno al registrar usuario' });
  }
});

/* ─── POST /regenerate-pin — usuario regenera su código privado ──────── */
router.post('/regenerate-pin', verifyToken, async (req, res) => {
  try {
    const userRef  = db.collection('users').doc(req.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists)
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const newPin     = String(Math.floor(100000 + Math.random() * 900000));
    const newPinHash = await bcrypt.hash(newPin, 10);

    await userRef.update({
      privateCodeHash:      newPinHash,
      privateCodeCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, privateCodePlain: newPin });
  } catch (err) {
    console.error('[users/regenerate-pin]', err);
    return res.status(500).json({ success: false, error: 'Error interno', detail: err.message });
  }
});

module.exports = router;
