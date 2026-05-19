'use strict';

const { db, FieldValue } = require('../firebase/adminSdk');
const { sendNotificationToUser } = require('./fcmService');

/**
 * Servicio de integración básica con empresas de cine aliadas
 * (Ej: Cinemark, Cine Colombia, Royal Films).
 */

const CINEMA_PROVIDERS = ['Cinemark', 'Cine Colombia', 'Royal Films'];

/**
 * Emite un boleto digital conectándose (simuladamente) a la API del cine aliado.
 * @param {string} userId - ID del usuario comprador
 * @param {string} providerName - Nombre del cine (Ej: 'Cine Colombia')
 * @param {string} movieTitle - Título de la película
 * @param {number} quantity - Cantidad de boletas
 * @param {Array} seats - Asientos seleccionados
 * @returns {Promise<Object>} Resultado con el código de reserva
 */
async function issueCinemaTicket(userId, providerName, movieTitle, quantity, seats = []) {
  if (!CINEMA_PROVIDERS.includes(providerName)) {
    throw new Error(`Proveedor de cine no soportado: ${providerName}`);
  }

  console.log(`[CineService] Solicitando ${quantity} boletos a la API de ${providerName} para la película "${movieTitle}"...`);

  // Simulamos el tiempo de respuesta de la API externa del cine aliado (ej. webhook o REST)
  await new Promise(resolve => setTimeout(resolve, 600));

  // Generamos un código de reserva aleatorio (simulando la respuesta del proveedor)
  const prefix = providerName.substring(0, 3).toUpperCase();
  const randomCode = Math.floor(1000000 + Math.random() * 9000000);
  const ticketCode = `${prefix}-${randomCode}`;
  
  // Podríamos generar un enlace que luego se convierta en un QR en el frontend
  const qrData = `https://${providerName.toLowerCase().replace(/\s/g, '')}.com/verify/${ticketCode}`;

  // 1. Guardar la reserva del cine en nuestra base de datos (historial)
  const reservationRef = db.collection('cinemaReservations').doc();
  await reservationRef.set({
    userId,
    provider: providerName,
    movie: movieTitle,
    quantity,
    seats,
    ticketCode,
    qrData,
    status: 'confirmed',
    createdAt: FieldValue.serverTimestamp(),
  });

  // 2. Notificar al usuario que sus boletas están listas
  const seatsMsg = seats.length > 0 ? ` Sillas: ${seats.join(', ')}.` : '';
  await sendNotificationToUser(
    userId,
    `🍿 Boletos de ${providerName} listos`,
    `Tu código para "${movieTitle}" es ${ticketCode}.${seatsMsg} ¡Disfruta la función!`,
    { type: 'cinema_ticket', ticketCode }
  ).catch(err => console.error('[CineService] Error enviando push:', err));

  return {
    success: true,
    provider: providerName,
    movie: movieTitle,
    ticketCode,
    qrData,
    quantity,
    seats,
    message: `Boletos emitidos correctamente por ${providerName}`,
  };
}

module.exports = { issueCinemaTicket, CINEMA_PROVIDERS };
