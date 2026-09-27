const fs = require('fs');

let f = fs.readFileSync('pages/shop-dashboard.html', 'utf8');

// Remove the UPLOAD button and the hidden file input
f = f.replace(
    /<button class="btn btn-outline flex-1" id="btn_upload_photo".*?<\/button>\s*<input type="file" id="reg_photo_file".*?onchange="app.handlePhotoUpload\(event\)".*?>/s,
    ''
);

fs.writeFileSync('pages/shop-dashboard.html', f);
