// webapp/assets/js/firebase-config.js

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth }       from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getStorage }    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

// ─── Configuración Firebase (ya completada con los valores reales) ────────────
const firebaseConfig = {
  apiKey:            "AIzaSyB5IzAXms4cbjOst4ER9FufMgWCj00NnDA",
  authDomain:        "metacard-2026f.firebaseapp.com",
  projectId:         "metacard-2026f",
  storageBucket:     "metacard-2026f.firebasestorage.app",
  messagingSenderId: "713521444873",
  appId:             "1:713521444873:web:261ebc5117cb9a779e20d8",
};

// URL del backend — mismo origen cuando lo sirve Express
export const BACKEND_URL = window.location.origin;

const app = initializeApp(firebaseConfig);

export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);

// FCM solo en contextos que lo soportan (requiere Service Worker)
let _messaging = null;
export function getMessagingIfAvailable() {
  return _messaging;
}
try {
  const { getMessaging } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js');
  _messaging = getMessaging(app);
} catch (_) {
  console.warn('[MetaCard] FCM no disponible en este contexto.');
}
