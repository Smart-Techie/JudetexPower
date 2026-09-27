const fs = require('fs');
let content = fs.readFileSync('js/shop-app.js', 'utf8');

const injection = `
        // ORPHAN CLEANUP SCRIPT (One-time injection to clear broken strings)
        const ghosts = ['1790515656037_j0coq.jpg', '1790541269247_h8r3rp.jpg', '1790541696847_5j9vpt.jpg'];
        data.forEach(async (c) => {
            if (c.photo_url && ghosts.includes(c.photo_url)) {
                console.log('[Orphan Cleaned] Name:', c.full_name, 'ID:', c.id, 'GhostPath:', c.photo_url);
                await app.DB.updateCustomerPhoto(c.id, null);
            }
        });
`;

content = content.replace("this._allCustomers = data;", "this._allCustomers = data;\n" + injection);
fs.writeFileSync('js/shop-app.js', content);
