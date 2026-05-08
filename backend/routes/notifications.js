'use strict';

const router      = require('express').Router();
const { db }      = require('../firebase/adminSdk');
const verifyToken = require('../middleware/verifyToken');
const verifyAdmin = require('../middleware/verifyAdmin');
const { sendNotificationToUser } = require('../services/fcmService');

router.post('/', verifyToken, verifyAdmin, async (req, res) => {
  const { userId, title, body, data } = req.body;

  if (!userId || !title || !body) {
    return res.status(400).json({ success: false, error: 'userId, title y body son requeridos' });
  }

  try {
    const result = await sendNotificationToUser(userId, title, body, data || {});
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
