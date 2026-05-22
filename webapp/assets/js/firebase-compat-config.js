// webapp/assets/js/firebase-compat-config.js
// Configuración centralizada de Firebase (SDK Compat)
// Usado por: login.html, buyer.html, account.html

const firebaseConfig = {
  apiKey:            "AIzaSyB5IzAXms4cbjOst4ER9FufMgWCj00NnDA",
  authDomain:        "metacard-2026f.firebaseapp.com",
  projectId:         "metacard-2026f",
  storageBucket:     "metacard-2026f.firebasestorage.app",
  messagingSenderId: "713521444873",
  appId:             "1:713521444873:web:261ebc5117cb9a779e20d8",
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();
const BACKEND_URL = window.location.origin;
