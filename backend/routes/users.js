'use strict';

const express     = require('express');
const router      = express.Router();
const bcrypt      = require('bcryptjs');
const admin       = require('firebase-admin');
const db          = admin.firestore();
const verifyToken = require('../middleware/verifyToken');
const { addTransactionToBatch } = require('../services/transactionService');
const { sendNotificationToUser, MESSAGES } = require('../services/fcmService');

const REFERRAL_BONUS_NEW_USER = Number(process.env.REFERRAL_BONUS_NEW_USER) || 10000;
const REFERRAL_BONUS_REFERRER  = Number(process.env.REFERRAL_BONUS_REFERRER)  || 20000;
const MAX_REFERRALS            = Number(process.env.MAX_REFERRALS)            || 5;

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

    let initialBalance = 10000;

    // Si tiene código de referido, validar y aplicar bonos automáticos
    let referrerId = null;
    if (referral) {
      // Buscar el usuario que tiene ese código de referido
      const referrerSnap = await db.collection('users')
        .where('referralCode', '==', referral.toUpperCase())
        .limit(1)
        .get();

      if (referrerSnap.empty) {
        return res.status(400).json({ success: false, error: 'Código de referido inválido' });
      }

      referrerId = referrerSnap.docs[0].id;
      const referrerData = referrerSnap.docs[0].data();

      // Verificar que no sea el mismo usuario
      if (referrerId === uid) {
        return res.status(400).json({ success: false, error: 'No puedes usar tu propio código de referido' });
      }

      // Verificar el límite de referidos
      const referralRef = db.collection('referrals').doc(referrerId);
      const referralSnap = await referralRef.get();
      const referralData = referralSnap.exists ? referralSnap.data() : { count: 0, referredUsers: [] };

      if (referralData.count >= MAX_REFERRALS) {
        return res.status(400).json({ success: false, error: 'Este usuario ha alcanzado el límite de referidos' });
      }

      // Verificar que no sea un usuario ya referido
      const alreadyReferred = referralData.referredUsers?.some(u => u.userId === uid);
      if (alreadyReferred) {
        return res.status(409).json({ success: false, error: 'Este usuario ya fue referido' });
      }

      // Aplicar bonificación al nuevo usuario
      initialBalance += REFERRAL_BONUS_NEW_USER;
    }

    const userData = {
      name:                   name || '',
      email,
      identification:         identification || '',
      role:                   'buyer',
      balance:                initialBalance,
      frozenBalance:          0,
      totalRecharged:         0,
      membershipLevel:        'vital',
      referralCode,
      referredBy:             referrerId || null,
      weeklyBonusLastClaimed: null,
      fcmToken:               null,
      lastUsedAt:             null,
      frozenAt:               null,
      privateCodeHash,
      privateCodeCreatedAt:   admin.firestore.FieldValue.serverTimestamp(),
      createdAt:              admin.firestore.FieldValue.serverTimestamp(),
    };

    // Verificar si el correo pertenece a un convenio activo
    let convenioRef = null;
    let convenioData = null;
    const emailDomain = email.split('@')[1]?.toLowerCase().trim();
    if (emailDomain) {
      const convenioSnap = await db.collection('convenios')
        .where('emailDomain', '==', emailDomain)
        .where('status', '==', 'active')
        .limit(1)
        .get();

      if (!convenioSnap.empty) {
        convenioData = convenioSnap.docs[0].data();
        convenioRef = db.collection('convenios').doc(convenioSnap.docs[0].id);
      }
    }

    if (referrerId || convenioRef) {
      const batch = db.batch();

      // 1. Crear usuario con balance incrementado (si aplica)
      batch.set(userRef, userData);

      // 2. Lógica de referido
      if (referrerId) {
        const referrerRef2 = db.collection('users').doc(referrerId);
        batch.update(referrerRef2, {
          balance: admin.firestore.FieldValue.increment(REFERRAL_BONUS_REFERRER)
        });

        const referralRef2 = db.collection('referrals').doc(referrerId);
        batch.set(referralRef2, {
          count: admin.firestore.FieldValue.increment(1),
          referredUsers: admin.firestore.FieldValue.arrayUnion({
            userId: uid,
            registeredAt: new Date(),
            bonusPaid: true,
          }),
        }, { merge: true });

        addTransactionToBatch(batch, {
          type: 'referral',
          buyerId: uid,
          amount: REFERRAL_BONUS_NEW_USER,
          description: `Bono por registrarse con código de referido`,
        });

        addTransactionToBatch(batch, {
          type: 'referral',
          buyerId: referrerId,
          amount: REFERRAL_BONUS_REFERRER,
          description: `Bono por referir a nuevo usuario ${uid}`,
        });
      }

      // 3. Lógica de convenio (Registrar empleado)
      if (convenioRef) {
        const newEmployee = {
          email: email.toLowerCase().trim(),
          registeredAt: new Date(),
          active: true,
        };
        batch.update(convenioRef, {
          employees: admin.firestore.FieldValue.arrayUnion(newEmployee),
          totalEmployees: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();

      // Enviar notificaciones de referido
      if (referrerId) {
        sendNotificationToUser(uid, 'Bono de referido 🤝', `¡Bienvenido! +$${REFERRAL_BONUS_NEW_USER.toLocaleString('es-CO')} por registrarte`).catch(console.error);
        sendNotificationToUser(referrerId, MESSAGES.referralBonus.title, MESSAGES.referralBonus.body).catch(console.error);
      }

    } else {
      // Sin referidor y sin convenio, solo crear el usuario
      await userRef.set(userData);
    }

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
