'use strict';

const router            = require('express').Router();
const { db, FieldValue } = require('../firebase/adminSdk');
const verifyToken       = require('../middleware/verifyToken');
const { sendNotificationToUser } = require('../services/fcmService');

/* ─── helpers ─────────────────────────────────────────────────────────── */
async function assertRole(uid, ...roles) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return false;
  return roles.includes(snap.data().role);
}

/* ─── POST / — seller crea producto ────────────────────────────────────── */
router.post('/', verifyToken, async (req, res) => {
  const { name, description, price, stock, type, imageUrl } = req.body;

  if (!await assertRole(req.uid, 'seller', 'admin'))
    return res.status(403).json({ success: false, error: 'Solo vendedores pueden publicar productos' });

  if (!name || !description || price == null || stock == null || !type)
    return res.status(400).json({ success: false, error: 'Faltan campos obligatorios' });

  if (!['product', 'service', 'cinema'].includes(type))
    return res.status(400).json({ success: false, error: 'Tipo inválido: usa "product", "service" o "cinema"' });

  const priceNum = Number(price);
  const stockNum = Number(stock);
  if (!Number.isFinite(priceNum) || priceNum <= 0)
    return res.status(400).json({ success: false, error: 'El precio debe ser un número positivo' });
  if (!Number.isFinite(stockNum) || stockNum < 0)
    return res.status(400).json({ success: false, error: 'El stock debe ser un número no negativo' });

  try {
    const sellerSnap = await db.collection('users').doc(req.uid).get();
    const sellerName = sellerSnap.data()?.name || 'Vendedor';

    const ref = db.collection('products').doc();
    await ref.set({
      sellerId:    req.uid,
      sellerName,
      name:        name.trim(),
      description: description.trim(),
      price:       priceNum,
      stock:       stockNum,
      type,
      imageUrl:    imageUrl || null,
      status:      'pending',
      rejectionReason: null,
      createdAt:   FieldValue.serverTimestamp(),
      approvedAt:  null,
      approvedBy:  null,
    });

    return res.json({ success: true, productId: ref.id });
  } catch (err) {
    console.error('[products/create]', err);
    return res.status(500).json({ success: false, error: 'Error interno', detail: err.message });
  }
});

/* ─── GET /approved — catálogo público (sin auth requerida) ─────────── */
router.get('/approved', async (req, res) => {
  try {
    const snap = await db.collection('products')
      .where('status', '==', 'approved')
      .limit(100)
      .get();
    const products = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return res.json({ success: true, products });
  } catch (err) {
    console.error('[products/approved]', err);
    return res.status(500).json({ success: false, error: 'Error interno', detail: err.message });
  }
});

/* ─── GET /mine — productos del seller autenticado ───────────────────── */
router.get('/mine', verifyToken, async (req, res) => {
  if (!await assertRole(req.uid, 'seller', 'admin'))
    return res.status(403).json({ success: false, error: 'Solo vendedores' });

  try {
    const snap = await db.collection('products')
      .where('sellerId', '==', req.uid)
      .limit(100)
      .get();
    const products = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return res.json({ success: true, products });
  } catch (err) {
    console.error('[products/mine]', err);
    return res.status(500).json({ success: false, error: 'Error interno', detail: err.message });
  }
});

/* ─── GET /all — admin ve todos ─────────────────────────────────────── */
router.get('/all', verifyToken, async (req, res) => {
  if (!await assertRole(req.uid, 'admin'))
    return res.status(403).json({ success: false, error: 'Solo administradores' });

  try {
    const snap = await db.collection('products').limit(200).get();
    const products = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return res.json({ success: true, products });
  } catch (err) {
    console.error('[products/all]', err);
    return res.status(500).json({ success: false, error: 'Error interno', detail: err.message });
  }
});

/* ─── PUT /:id/approve — admin aprueba ──────────────────────────────── */
router.put('/:id/approve', verifyToken, async (req, res) => {
  if (!await assertRole(req.uid, 'admin'))
    return res.status(403).json({ success: false, error: 'Solo administradores' });

  try {
    const ref  = db.collection('products').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Producto no encontrado' });

    await ref.update({
      status:     'approved',
      approvedAt: FieldValue.serverTimestamp(),
      approvedBy: req.uid,
      rejectionReason: null,
    });

    // Notificar al vendedor
    const { sellerId, name } = snap.data();
    sendNotificationToUser(sellerId, '✅ Producto aprobado', `Tu producto "${name}" ya está visible en el WebMarket.`, { type: 'product_approved', productId: req.params.id }).catch(console.error);

    return res.json({ success: true });
  } catch (err) {
    console.error('[products/approve]', err);
    return res.status(500).json({ success: false, error: 'Error interno', detail: err.message });
  }
});

/* ─── PUT /:id/reject — admin rechaza ───────────────────────────────── */
router.put('/:id/reject', verifyToken, async (req, res) => {
  if (!await assertRole(req.uid, 'admin'))
    return res.status(403).json({ success: false, error: 'Solo administradores' });

  const { reason } = req.body;
  if (!reason) return res.status(400).json({ success: false, error: 'Indica el motivo del rechazo' });

  try {
    const ref  = db.collection('products').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Producto no encontrado' });

    await ref.update({ status: 'rejected', rejectionReason: reason });

    // Notificar al vendedor
    const { sellerId, name } = snap.data();
    sendNotificationToUser(sellerId, '❌ Producto rechazado', `Tu producto "${name}" fue rechazado: ${reason}`, { type: 'product_rejected', productId: req.params.id }).catch(console.error);

    return res.json({ success: true });
  } catch (err) {
    console.error('[products/reject]', err);
    return res.status(500).json({ success: false, error: 'Error interno', detail: err.message });
  }
});

/* ─── DELETE /:id — seller elimina su propio producto pendiente/rechazado */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const ref  = db.collection('products').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Producto no encontrado' });

    const data = snap.data();
    const isAdmin  = await assertRole(req.uid, 'admin');
    const isOwner  = data.sellerId === req.uid;

    if (!isOwner && !isAdmin)
      return res.status(403).json({ success: false, error: 'Sin permisos para eliminar este producto' });

    if (data.status === 'approved' && !isAdmin)
      return res.status(403).json({ success: false, error: 'No puedes eliminar un producto ya aprobado' });

    await ref.delete();
    return res.json({ success: true });
  } catch (err) {
    console.error('[products/delete]', err);
    return res.status(500).json({ success: false, error: 'Error interno', detail: err.message });
  }
});

module.exports = router;
