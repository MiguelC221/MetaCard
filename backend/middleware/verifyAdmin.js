'use strict';

const { db } = require('../firebase/adminSdk');

const verifyAdmin = async (req, res, next) => {
  try {
    const snap = await db.collection('users').doc(req.user.uid).get();
    if (!snap.exists || snap.data().role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Acceso restringido a administradores' });
    }
    req.adminData = snap.data();
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Error verificando permisos', detail: err.message });
  }
};

module.exports = verifyAdmin;
