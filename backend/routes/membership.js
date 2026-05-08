'use strict';

const router                          = require('express').Router();
const { db }                          = require('../firebase/adminSdk');
const verifyToken                     = require('../middleware/verifyToken');
const { calculateLevel, THRESHOLDS }  = require('../services/membershipService');

router.get('/level', verifyToken, async (req, res) => {
  const userId = req.query.userId || req.user.uid;

  try {
    const snap = await db.collection('users').doc(userId).get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const { totalRecharged = 0, membershipLevel, balance = 0 } = snap.data();
    const calculatedLevel = calculateLevel(totalRecharged);

    return res.json({
      success:          true,
      userId,
      membershipLevel:  membershipLevel || calculatedLevel,
      calculatedLevel,
      totalRecharged,
      balance,
      levels:           THRESHOLDS,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
