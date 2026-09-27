const fs = require('fs');
let f = fs.readFileSync('js/shop-db.js', 'utf8');
f = f.replace(
    "return { success: true, path: data.path };",
    "// DEBUG: IMMEDIATELY verify existence\n    const verify = await supabase.storage.from('customer-photos').createSignedUrl(data.path, 60);\n    console.log('[DEBUG] Immediate Verification after Upload:', verify);\n    return { success: true, path: data.path };"
);
fs.writeFileSync('js/shop-db.js', f);
