const fs = require('fs');
let f = fs.readFileSync('js/shop-db.js', 'utf8');
f = f.replace(
    "const { error } = await supabase.from('customers').update({ photo_url: path }).eq('id', custId);",
    "const { data, error } = await supabase.from('customers').update({ photo_url: path }).eq('id', custId).select();\n    console.log('[DEBUG] Update Customer:', { data, error });"
);
fs.writeFileSync('js/shop-db.js', f);
