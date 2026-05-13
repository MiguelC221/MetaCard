'use strict';

const { auth, db } = require('../firebase/adminSdk');

const verifyAdmin = async (req, res, next) => {
  try {
    // Primero verificar token
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token requerido' });
    }

    const token = header.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;
    req.uid = decodedToken.uid;

    // Luego verificar que sea admin
    const snap = await db.collection('users').doc(decodedToken.uid).get();
    if (!snap.exists || snap.data().role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Acceso restringido a administradores' });
    }
    req.adminData = snap.data();
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token inválido o acceso denegado', detail: err.message });
  }
};

module.exports = verifyAdmin;
