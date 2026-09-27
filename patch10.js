const fs = require('fs');
let f = fs.readFileSync('js/shop-app.js', 'utf8');

const injection = `
            document.getElementById('reg_photo_img').style.display = 'none';
            this.draftBlob = null;
            this.draftPhotoDataUrl = null;
            document.getElementById('reg_photo_text').style.display = 'none';
`;

f = f.replace("document.getElementById('reg_photo_text').style.display = 'none';", injection);
fs.writeFileSync('js/shop-app.js', f);
