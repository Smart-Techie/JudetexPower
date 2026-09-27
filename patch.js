const fs = require('fs');
let content = fs.readFileSync('js/shop-app.js', 'utf8');
content = content.replace(/onerror="this\.onerror=null; this\.outerHTML='[^']*'"/g, 'onerror="app.handleImageError(this)"');
fs.writeFileSync('js/shop-app.js', content);
