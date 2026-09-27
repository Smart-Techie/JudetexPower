const fs = require('fs');
let f = fs.readFileSync('js/shop-db.js', 'utf8');
f = f.replace(
    "console.error('[Storage Error] createSignedUrl securely failed:', error.message);",
    "console.error('[Storage Error] createSignedUrl securely failed:', error.message, 'Filename:', filename);"
);
f = f.replace(
    "const { data, error } = await supabase.storage.from('customer-photos').createSignedUrl(filename, 3600);",
    "console.log('[DEBUG] Generating signed URL for:', filename);\n        const { data, error } = await supabase.storage.from('customer-photos').createSignedUrl(filename, 3600);\n        console.log('[DEBUG] Signed URL response:', { data, error });"
);
fs.writeFileSync('js/shop-db.js', f);
