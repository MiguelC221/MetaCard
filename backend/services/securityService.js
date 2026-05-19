'use strict';

const { db, FieldValue } = require('../firebase/adminSdk');
const { sendNotificationToUser } = require('./fcmService');

/**
 * Registra una alerta de seguridad por fallos de pago, movimientos inusuales, etc.
 * @param {Object} params
 * @param {string} params.userId - ID del usuario afectado
 * @param {string} params.type - Tipo de alerta ('payment_error', 'invalid_pin', 'blocked_card_attempt', 'unusual_movement')
 * @param {string} params.description - Descripción detallada
 * @param {Object} [params.metadata] - Datos adicionales de contexto
 * @param {boolean} [params.notifyUser=false] - Si es true, envía un push al usuario
 */
async function logSecurityAlert({ userId, type, description, metadata = {}, notifyUser = false }) {
  try {
    const alertRef = db.collection('securityAlerts').doc();
    await alertRef.set({
      userId,
      type,
      description,
      metadata,
      status: 'unread',
      createdAt: FieldValue.serverTimestamp(),
    });

    if (notifyUser) {
      await sendNotificationToUser(
        userId,
        'Alerta de Seguridad ⚠️',
        description,
        { type: 'security_alert', alertId: alertRef.id }
      );
    }
    
    return alertRef.id;
  } catch (error) {
    console.error('[SecurityService] Error registrando alerta:', error);
  }
}

module.exports = { logSecurityAlert };
