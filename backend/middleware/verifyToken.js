'use strict';

const { auth } = require('../firebase/adminSdk');


const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token requerido' });
  }
  try {
    req.user = await auth.verifyIdToken(header.split('Bearer ')[1]);
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
  }
};

module.exports = verifyToken;
