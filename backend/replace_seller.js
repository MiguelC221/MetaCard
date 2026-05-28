const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../webapp');
const cssDir = path.join(__dirname, '../webapp/assets/css');

function replaceInFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // UI Text
    content = content.replace(/Vendedor/g, 'Proveedor');
    content = content.replace(/vendedor/g, 'proveedor');
    content = content.replace(/vendedores/g, 'proveedores');
    content = content.replace(/Vendedores/g, 'Proveedores');
    
    // Variables & HTML elements
    content = content.replace(/sellerName/g, 'providerName');
    content = content.replace(/sellerId/g, 'providerId');
    content = content.replace(/sellerHistoryList/g, 'providerHistoryList');
    content = content.replace(/sellerBalanceDisplay/g, 'providerBalanceDisplay');
    content = content.replace(/sellerNameDisplay/g, 'providerNameDisplay');
    content = content.replace(/sellerData/g, 'providerData');
    content = content.replace(/sellerSection/g, 'providerSection');
    content = content.replace(/prodModalSeller/g, 'prodModalProvider');
    
    // File references
    content = content.replace(/seller\.html/g, 'provider.html');
    
    // Roles
    content = content.replace(/'seller'/g, "'proveedor'");
    content = content.replace(/"seller"/g, '"proveedor"');
    content = content.replace(/role-seller/g, 'role-proveedor');
    content = content.replace(/role === 'seller'/g, "role === 'proveedor'");
    content = content.replace(/role === "seller"/g, 'role === "proveedor"');
    
    // Other seller instances inside JS
    // Be careful not to replace `proveedor` if we just did it.
    // For general `seller` in variable names if any are left
    content = content.replace(/seller/g, 'provider');
    content = content.replace(/Seller/g, 'Provider');
    
    // Fix any double replacements
    content = content.replace(/role-provider/g, 'role-proveedor');
    content = content.replace(/role === 'provider'/g, "role === 'proveedor'");
    content = content.replace(/role === "provider"/g, 'role === "proveedor"');
    content = content.replace(/'provider'/g, "'proveedor'"); // In case it replaced role string
    
    // Let's be more specific for role maps
    // "proveedor": "provider.html" (because earlier provider replaced seller)
    // Actually we replaced 'seller' with 'proveedor' first, then 'seller' with 'provider', so:
    // "proveedor" is fine.
    
    fs.writeFileSync(filePath, content, 'utf8');
}

const files = [
    path.join(dir, 'provider.html'),
    path.join(dir, 'market.html'),
    path.join(dir, 'admin.html'),
    path.join(dir, 'account.html'),
    path.join(dir, 'login.html'),
    path.join(dir, 'index.html'),
    path.join(dir, 'buyer.html'),
    path.join(cssDir, 'styles.css')
];

files.forEach(f => {
    if (fs.existsSync(f)) {
        replaceInFile(f);
        console.log('Updated', f);
    }
});
