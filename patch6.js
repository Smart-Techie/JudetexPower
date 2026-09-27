const fs = require('fs');
let f = fs.readFileSync('js/shop-db.js', 'utf8');
f = f.replace(
    /if \(error\) \{\s*console\.error\('\[Storage Error\] createSignedUrl securely failed:', error\.message, 'Filename:', filename\);\s*return null; \/\/ Strict rule: Do not fallback\s*\}/g,
    `if (error) {
            console.error('[Storage Error] createSignedUrl securely failed:', error.message, 'Filename:', filename);
            console.log('[DEBUG] Attempting native Blob download bypass...');
            const dl = await supabase.storage.from('customer-photos').download(filename);
            if (dl.data) {
                console.log('[DEBUG] Blob successfully downloaded natively! Bypassing signed URL.');
                return URL.createObjectURL(dl.data);
            }
            console.error('[DEBUG] Native download also failed:', dl.error);
            return null; 
        }`
);
fs.writeFileSync('js/shop-db.js', f);
