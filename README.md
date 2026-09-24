# JudeTex Power - Web Application

A professional, production-ready frontend for a Power Bank Rental Business operating in a local market setting.

## Technology Stack
- HTML5
- CSS3 (Vanilla)
- Vanilla JavaScript
- **No** modern reactive frameworks, **No** Python needed for execution.

## Project Structure
```
/
├── index.html                   # Main landing page
├── README.md                    # Project documentation
├── css/
│   ├── styles.css               # Core styling, variables, components
│   └── responsive.css           # Media queries and mobile layout adjusters
├── js/
│   ├── app.js                   # Global UI logic (e.g. Nav menu)
│   ├── utils.js                 # Shared utilities (localstorage, formatters)
│   ├── mock-data.js             # Initializing mock datasets for sandbox testing
│   ├── customer.js              # Customer application flow logic
│   └── admin.js                 # Admin dashboard routing and interaction logic
├── pages/
│   ├── admin-dashboard.html     # SPA layout for staff operations
│   ├── admin-login.html         # Staff Authentication
│   ├── confirmation.html        # Rental Request Success page
│   ├── customer-details.html    # Customer Data Form + Camera upload
│   ├── how-it-works.html        # Instructional visual process
│   ├── payment.html             # Payment Info & Receipt upload
│   ├── power-banks.html         # Interactive real-time Power Bank Inventory
│   └── track-rental.html        # Live rental status tracking by Reference UUID
└── assets/
    ├── images/
    └── icons/
```

## How to Run Locally

Since this is a clean Vanilla HTML/JS frontend without build tools:

1. Open the project folder.
2. Open `index.html` directly in your web browser. 
3. *Alternative:* If you have Python installed, you can optionally run `python -m http.server` for a quick local network server.
4. *Alternative:* Use VSCode "Live Server" extension.

The application relies on `LocalStorage` to mock a database and pass state between pages! Ensure you are not running it in incognito/strict-privacy mode that drops LocalStorage upon navigation.

## Future Supabase Integration

Once ready, Supabase can be easily integrated by:
1. Including the Supabase JS SDK via CDN in the `<head>` of the html files.
2. Replacing the `Storage.get` and `Storage.set` wrappers in `js/utils.js` and individual components with asynchronous `supabase.from('tableName').select(...)` or `.insert(...)`.
3. Updating the 'Photo Upload' and 'Receipt Upload' logic in the `fileInput.addEventListener` to use `supabase.storage.from('bucket').upload(...)` to get public URLs rather than storing heavy Base64 strings.
4. Using Supabase Auth on the `pages/admin-login.html` instead of the simulated delay.

## Design Aesthetic
The application implements a striking blue `(#0F3D8C)` and energetic orange `(#FF6B00)` branding scheme to communicate trust and fast service.

Responsive from 320px devices to 4K monitors.
