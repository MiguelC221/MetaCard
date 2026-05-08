'use strict';

const CASHBACK_RATE = 0.10;

/**
 * @param {number} amount - Monto del pago en COP
 * @returns {number}
 */
function calculateCashback(amount) {
  return Math.floor(amount * CASHBACK_RATE);
}

module.exports = { calculateCashback, CASHBACK_RATE };
