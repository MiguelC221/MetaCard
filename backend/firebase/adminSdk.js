'use strict';

const admin = require('firebase-admin');

let rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
const cleanKey = rawKey.replace(/^["']|["'],?$/g, '').replace(/\\n/g, '\n');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      privateKey:  cleanKey,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
    storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
  });
}

const db        = admin.firestore();
const auth      = admin.auth();
const storage   = admin.storage();
const messaging = admin.messaging();
const FieldValue = admin.firestore.FieldValue;

module.exports = { admin, db, auth, storage, messaging, FieldValue };
