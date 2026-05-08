const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const db = admin.firestore();

router.post('/register', async (req, res) => {
  try {
    const { uid, name, email, identification, referral } = req.body;

    if (!uid || !email) {
      return res.status(400).json({ success: false, error: 'Faltan datos obligatorios' });
    }

    // Verificar si ya existe
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    
    if (userSnap.exists) {
      return res.json({ success: true, message: 'Usuario ya existía' });
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const userData = {
      name: name || '',
      email,
      identification: identification || '',
      role: 'buyer',
      balance: 10000, 
      frozenBalance: 0,
      totalRecharged: 0,
      membershipLevel: 'vital',
      referralCode: code,
      referredBy: referral || null,
      weeklyBonusLastClaimed: null,
      fcmToken: null,
      lastUsedAt: null,
      frozenAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await userRef.set(userData);

    res.json({ success: true, message: 'Usuario registrado correctamente', userData });
  } catch (error) {
    console.error('Error en /users/register:', error);
    res.status(500).json({ success: false, error: 'Error interno al registrar usuario' });
  }
});

module.exports = router;
