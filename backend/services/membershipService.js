'use strict';

const LEVELS = ['vital', 'activo', 'saludPlus', 'elite'];

const THRESHOLDS = {
  vital:     { min: 0,       label: 'Vital'   },
  activo:    { min: 150000,  label: 'Activo'  },
  saludPlus: { min: 400000,  label: 'Salud+'  },
  elite:     { min: 800000,  label: 'Elite'   },
};

/**
 * @param {number} totalRecharged
 * @returns {'vital'|'activo'|'saludPlus'|'elite'}
 */
function calculateLevel(totalRecharged) {
  if (totalRecharged >= 800000) return 'elite';
  if (totalRecharged >= 400000) return 'saludPlus';
  if (totalRecharged >= 150000) return 'activo';
  return 'vital';
}


function upgradeLevel(currentLevel, newLevel) {
  const ci = LEVELS.indexOf(currentLevel ?? 'vital');
  const ni = LEVELS.indexOf(newLevel);
  return ni > ci ? newLevel : (currentLevel ?? 'vital');
}

module.exports = { calculateLevel, upgradeLevel, LEVELS, THRESHOLDS };
