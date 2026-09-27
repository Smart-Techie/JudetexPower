const fs = require('fs');
let content = fs.readFileSync('js/shop-app.js', 'utf8');

// Replace both instances where blob is cached:
// 1. captureCamera
content = content.replace(
    /this\.draftBlob = blob;/g,
    "this.draftBlob = new File([blob], 'capture.jpg', { type: 'image/jpeg' });"
);

// 2. captureRetakeCamera
content = content.replace(
    /this\.retakeBlob = blob;/g,
    "this.retakeBlob = new File([blob], 'capture.jpg', { type: 'image/jpeg' });"
);

fs.writeFileSync('js/shop-app.js', content);
