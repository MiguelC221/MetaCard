require('dotenv').config();
const { db, FieldValue } = require('./firebase/adminSdk');

async function migrateDatabase() {
    console.log('Iniciando migración de vendedor (seller) a proveedor...');

    try {
        // 1. Migrar usuarios con rol 'seller'
        console.log('--- Migrando Usuarios ---');
        const usersSnapshot = await db.collection('users').where('role', '==', 'seller').get();
        let usersCount = 0;
        
        for (const doc of usersSnapshot.docs) {
            await doc.ref.update({
                role: 'proveedor' // Cambio al nuevo rol
            });
            usersCount++;
        }
        console.log(`✅ Usuarios actualizados: ${usersCount}`);

        // 2. Migrar productos
        console.log('--- Migrando Productos ---');
        const productsSnapshot = await db.collection('products').get(); // Traemos todos para revisar los campos
        let productsCount = 0;

        for (const doc of productsSnapshot.docs) {
            const data = doc.data();
            if (data.sellerId || data.sellerName) {
                const updateData = {};
                if (data.sellerId) {
                    updateData.providerId = data.sellerId;
                    updateData.sellerId = FieldValue.delete();
                }
                if (data.sellerName) {
                    updateData.providerName = data.sellerName;
                    updateData.sellerName = FieldValue.delete();
                }
                await doc.ref.update(updateData);
                productsCount++;
            }
        }
        console.log(`✅ Productos actualizados: ${productsCount}`);

        // 3. Migrar transacciones
        console.log('--- Migrando Transacciones ---');
        const txSnapshot = await db.collection('transactions').get();
        let txCount = 0;

        for (const doc of txSnapshot.docs) {
            const data = doc.data();
            if (data.sellerId) {
                const updateData = {
                    providerId: data.sellerId,
                    sellerId: FieldValue.delete()
                };
                await doc.ref.update(updateData);
                txCount++;
            }
        }
        console.log(`✅ Transacciones actualizadas: ${txCount}`);

        console.log('🎉 Migración completada exitosamente.');

    } catch (error) {
        console.error('❌ Error durante la migración:', error);
    }
}

migrateDatabase();
