'use strict';

const { db } = require('../firebase/adminSdk');

const MESSAGES = {
  paymentSuccess:    (amount)  => ({ title: 'Pago procesado ✓',         body: `Tu pago de $${fmt(amount)} fue procesado exitosamente` }),
  rechargeApproved:  (amount)  => ({ title: 'Recarga acreditada ✓',      body: `Tu recarga de $${fmt(amount)} fue acreditada` }),
  rechargeRejected:  (reason)  => ({ title: 'Recarga rechazada',          body: `Solicitud rechazada: ${reason}` }),
  cardBlocked:                    { title: 'Tarjeta bloqueada',           body: 'Tu tarjeta MetaCard ha sido bloqueada' },
  cardUnblocked:                  { title: 'Tarjeta activa nuevamente',   body: 'Tu tarjeta MetaCard está activa de nuevo' },
  bonusCredit:       (amount)  => ({ title: '¡Bono acreditado! 🎉',      body: `Recibiste un bono de $${fmt(amount)}` }),
  referralBonus:                  { title: 'Bono por referido 🤝',        body: 'Tu amigo hizo su primera compra. ¡+$20.000 en tu cuenta!' },
  balanceFrozen:                  { title: 'Saldo congelado ❄️',          body: 'Tu saldo fue congelado por 6 meses de inactividad' },
  lowBalance:        (balance) => ({ title: 'Saldo bajo ⚠️',             body: `Tu saldo es $${fmt(balance)}. Recarga pronto.` }),
  welcomeBonus:                   { title: '¡Bienvenido a MetaCard! 🎉', body: 'Recibiste un bono de bienvenida de $10.000' },
};

function fmt(n) {
  return Number(n).toLocaleString('es-CO');
}

/**
 * @param {string} userId
 * @param {string} title
 * @param {string} body
 * @param {Object} [data]
 */
async function sendNotificationToUser(userId, title, body, data = {}) {
  try {
    const snap = await db.collection('users').doc(userId).get();
    if (!snap.exists) return { success: false, error: 'Usuario no encontrado' };
    const token = snap.data().fcmToken;
    if (!token) return { success: false, error: 'Sin token FCM' };
    return await _send(token, title, body, data);
  } catch (err) {
    console.error('[FCM] sendNotificationToUser error:', err.message);
    return { success: false, error: err.message };
  }
}

async function sendNotificationToToken(token, title, body, data = {}) {
  return _send(token, title, body, data);
}

async function _send(token, title, body, data) {
  const { messaging } = require('../firebase/adminSdk');
  try {
    const msgId = await messaging.send({
      token,
      notification: { title, body },
      data: { ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])), ts: Date.now().toString() },
      android: { priority: 'high', notification: { channelId: 'metacard_channel', sound: 'default' } },
    });
    return { success: true, messageId: msgId };
  } catch (err) {
    console.error('[FCM] send error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendNotificationToUser, sendNotificationToToken, MESSAGES };
