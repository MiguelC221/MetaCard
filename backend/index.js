'use strict';

require('dotenv').config();
require('./firebase/adminSdk'); // inicializa Admin SDK al arrancar

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const rechargesRouter     = require('./routes/recharges');
const paymentsRouter      = require('./routes/payments');
const cardsRouter         = require('./routes/cards');
const bonusesRouter       = require('./routes/bonuses');
const notificationsRouter = require('./routes/notifications');
const membershipRouter    = require('./routes/membership');

const app = express();

// ── Webapp estática (antes de helmet para no bloquear CDN de Firebase) ───────
const webappPath = path.join(__dirname, '../webapp');
app.use(express.static(webappPath));

// ── Seguridad (CSP desactivado en demo; Firebase CDN lo requiere) ────────────
app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : '*';

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate limiting: 100 req / 15 min por IP ──────────────────────────────────
app.use(rateLimit({
  windowMs:  15 * 60 * 1000,
  max:       100,
  message:   { success: false, error: 'Demasiadas solicitudes. Intenta en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders:   false,
}));

app.use(express.json({ limit: '1mb' }));

const usersRouter = require('./routes/users');

// ── Rutas API ────────────────────────────────────────────────────────────────
app.use('/users',         usersRouter);
app.use('/recharges',     rechargesRouter);
app.use('/payments',      paymentsRouter);
app.use('/cards',         cardsRouter);
app.use('/bonuses',       bonusesRouter);
app.use('/notify',        notificationsRouter);
app.use('/membership',    membershipRouter);

// ── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'MetaCard API', timestamp: new Date().toISOString() });
});

// ── SPA fallback: rutas de navegación van a la webapp ───────────────────────
app.get(['/', '/login', '/buyer', '/admin', '/seller'], (_req, res) => {
  res.sendFile(path.join(webappPath, 'index.html'));
});

// ── 404 API ──────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint no encontrado' });
});

// ── Error handler global ────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR GLOBAL]', err);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

// ── Iniciar servidor ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 MetaCard corriendo en http://localhost:${PORT}`);
  console.log(`   Webapp:   http://localhost:${PORT}/login.html`);
  console.log(`   API:      http://localhost:${PORT}/health`);
  console.log(`   Firebase: ${process.env.FIREBASE_PROJECT_ID}`);
});
