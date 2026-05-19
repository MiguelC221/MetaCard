'use strict';

const router = require('express').Router();
const verifyToken = require('../middleware/verifyToken');
const { issueCinemaTicket, CINEMA_PROVIDERS } = require('../services/cineService');

/**
 * POST /api/cine/buy-ticket
 * Endpoint para comprar boletas de cine aprovechando el convenio.
 * En un flujo real, aquí primero se descontaría el saldo del usuario usando el balanceService
 * antes de emitir los boletos.
 */
router.post('/buy-ticket', verifyToken, async (req, res) => {
  const { providerName, movieTitle, quantity } = req.body;

  if (!providerName || !movieTitle || !quantity) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros: providerName, movieTitle, quantity' });
  }

  if (!CINEMA_PROVIDERS.includes(providerName)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Proveedor de cine no válido. Aliados actuales: ' + CINEMA_PROVIDERS.join(', ') 
    });
  }

  try {
    // 1. Aquí se podría integrar la lógica de restar el saldo del MetaCard del usuario
    // (Omitido para mantener la funcionalidad centrada en la emisión del ticket)
    
    // 2. Llamar al servicio de cine para emitir los boletos digitales
    const ticketResult = await issueCinemaTicket(req.uid, providerName, movieTitle, Number(quantity));

    return res.json(ticketResult);

  } catch (error) {
    console.error('[cine/buy-ticket]', error);
    return res.status(500).json({ success: false, error: 'Error procesando la compra de boletos', detail: error.message });
  }
});

module.exports = router;
