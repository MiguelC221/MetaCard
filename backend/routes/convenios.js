'use strict';

const router      = require('express').Router();
const { db, FieldValue } = require('../firebase/adminSdk');
const verifyAdmin = require('../middleware/verifyAdmin');

const DEFAULT_DISCOUNT = Number(process.env.CONVENIO_DEFAULT_DISCOUNT) || 10; // 10%

/* ─── GET / — listar todos los convenios ──────────────────────────────── */
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const snap = await db.collection('convenios').get();
    const convenios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return res.json({ success: true, convenios });
  } catch (err) {
    console.error('[convenios/GET]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ─── POST / — crear nuevo convenio ──────────────────────────────────── */
router.post('/', verifyAdmin, async (req, res) => {
  const { companyName, emailDomain, contactEmail, contactPhone, discountProducts, discountServices, description } = req.body;

  if (!companyName || !emailDomain || !contactEmail) {
    return res.status(400).json({ success: false, error: 'Faltan datos obligatorios' });
  }

  try {
    const normalizedDomain = emailDomain.toLowerCase().trim();
    
    // Verificar que no exista ya un convenio con ese dominio
    const existing = await db.collection('convenios')
      .where('emailDomain', '==', normalizedDomain)
      .limit(1)
      .get();

    if (!existing.empty) {
      return res.status(409).json({ success: false, error: 'Ya existe un convenio para este dominio' });
    }

    const convenioData = {
      companyName: companyName.trim(),
      emailDomain: normalizedDomain,
      contactEmail: contactEmail.toLowerCase().trim(),
      contactPhone: contactPhone || '',
      discountProducts: Math.min(Math.max(discountProducts || DEFAULT_DISCOUNT, 0), 100),
      discountServices: Math.min(Math.max(discountServices || DEFAULT_DISCOUNT, 0), 100),
      description: description || '',
      status: 'active',
      employees: [],
      totalEmployees: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('convenios').add(convenioData);

    return res.json({
      success: true,
      message: 'Convenio creado correctamente',
      convenioId: docRef.id,
      convenio: { id: docRef.id, ...convenioData },
    });
  } catch (err) {
    console.error('[convenios/POST]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ─── PUT /:id — actualizar convenio ──────────────────────────────────── */
router.put('/:id', verifyAdmin, async (req, res) => {
  const { companyName, contactEmail, contactPhone, discountProducts, discountServices, status, description } = req.body;

  try {
    const convenioRef = db.collection('convenios').doc(req.params.id);
    const convenioSnap = await convenioRef.get();

    if (!convenioSnap.exists) {
      return res.status(404).json({ success: false, error: 'Convenio no encontrado' });
    }

    const updates = {};
    if (companyName) updates.companyName = companyName.trim();
    if (contactEmail) updates.contactEmail = contactEmail.toLowerCase().trim();
    if (contactPhone !== undefined) updates.contactPhone = contactPhone;
    if (discountProducts !== undefined) updates.discountProducts = Math.min(Math.max(discountProducts, 0), 100);
    if (discountServices !== undefined) updates.discountServices = Math.min(Math.max(discountServices, 0), 100);
    if (status) updates.status = status;
    if (description !== undefined) updates.description = description;
    updates.updatedAt = FieldValue.serverTimestamp();

    await convenioRef.update(updates);

    return res.json({
      success: true,
      message: 'Convenio actualizado correctamente',
      convenio: { id: req.params.id, ...updates },
    });
  } catch (err) {
    console.error('[convenios/PUT]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ─── DELETE /:id — eliminar convenio ────────────────────────────────── */
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const convenioRef = db.collection('convenios').doc(req.params.id);
    const convenioSnap = await convenioRef.get();

    if (!convenioSnap.exists) {
      return res.status(404).json({ success: false, error: 'Convenio no encontrado' });
    }

    await convenioRef.delete();

    return res.json({ success: true, message: 'Convenio eliminado correctamente' });
  } catch (err) {
    console.error('[convenios/DELETE]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ─── GET /:id/discount — obtener descuento para usuario ────────────── */
router.get('/:id/discount', async (req, res) => {
  const { email, productType = 'product' } = req.query;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email requerido' });
  }

  try {
    const convenioRef = db.collection('convenios').doc(req.params.id);
    const convenioSnap = await convenioRef.get();

    if (!convenioSnap.exists) {
      return res.status(404).json({ success: false, error: 'Convenio no encontrado' });
    }

    const convenio = convenioSnap.data();
    const userEmail = email.toLowerCase().trim();
    const emailDomain = userEmail.split('@')[1];

    // Verificar que el email tenga el dominio correcto y que el convenio esté activo
    if (convenio.status !== 'active' || emailDomain !== convenio.emailDomain) {
      return res.json({ success: false, discountPercentage: 0 });
    }

    // Seleccionar descuento según tipo de producto
    const discountPercentage = productType === 'service' 
      ? (convenio.discountServices || 0)
      : (convenio.discountProducts || 0);

    return res.json({
      success: true,
      discountPercentage,
      companyName: convenio.companyName,
      convenioId: req.params.id,
      productType,
    });
  } catch (err) {
    console.error('[convenios/GET discount]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ─── POST /:id/employees — registrar empleado nuevo ──────────────────── */
router.post('/:id/employees', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email requerido' });
  }

  try {
    const convenioRef = db.collection('convenios').doc(req.params.id);
    const convenioSnap = await convenioRef.get();

    if (!convenioSnap.exists) {
      return res.status(404).json({ success: false, error: 'Convenio no encontrado' });
    }

    const convenio = convenioSnap.data();
    const normalizedEmail = email.toLowerCase().trim();
    const emailDomain = normalizedEmail.split('@')[1];

    // Verificar que el email tenga el dominio correcto
    if (emailDomain !== convenio.emailDomain) {
      return res.status(400).json({ 
        success: false, 
        error: `El email debe ser del dominio ${convenio.emailDomain}` 
      });
    }

    // Verificar que el empleado no esté ya registrado
    if (convenio.employees?.some(emp => emp.email === normalizedEmail)) {
      return res.status(409).json({ success: false, error: 'Este empleado ya está registrado' });
    }

    const newEmployee = {
      email: normalizedEmail,
      registeredAt: new Date(),
      active: true,
    };

    await convenioRef.update({
      employees: FieldValue.arrayUnion(newEmployee),
      totalEmployees: (convenio.employees?.length || 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return res.json({
      success: true,
      message: 'Empleado registrado correctamente',
      employee: newEmployee,
    });
  } catch (err) {
    console.error('[convenios/POST employees]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
