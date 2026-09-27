import './shop-db.js';

class ShopApp {
    constructor() {
        this.DB = null;
        this.currentView = 'dashboard';

        // global state
        this.draftPhotoDataUrl = null;
        this.draftCustomer = null;
        this.rentalsData = [];
        this.overdueData = [];

        // Viewer event binding
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closePhotoViewer(e, true);
        });

        this.init();
    }

    async init() {
        this.showLoading(true);
        // wait for db injection
        while (!window.ShopDB) {
            await new Promise(r => setTimeout(r, 50));
        }
        this.DB = window.ShopDB;

        const profile = await this.DB.getAdminProfile();
        if (!profile) {
            window.location.href = 'admin-login.html';
            return;
        }

        document.getElementById('adminName').innerText = profile.full_name || 'Staff';

        // Setup daily overdue cron (in app check for simplicity)
        await this.DB.markRentalsOverdue();

        await this.loadDashboardData();
        this.setView('dashboard');

        this.showLoading(false);
    }

    showLoading(show) {
        document.getElementById('loading').style.display = show ? 'flex' : 'none';
    }

    viewPhoto(src, event) {
        if (event) event.stopPropagation();
        if (!src || src.includes('unavailable')) return;

        const modal = document.getElementById('photoViewerModal');
        const img = document.getElementById('photoViewerImg');
        img.src = src;
        modal.style.display = 'flex';
    }

    closePhotoViewer(event, force = false) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        const modal = document.getElementById('photoViewerModal');
        if (force || event.target === modal) {
            modal.style.display = 'none';
            document.getElementById('photoViewerImg').src = '';
        }
    }

    setView(viewName) {
        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${viewName}`).classList.add('active');

        document.querySelectorAll('.sidebar-link[data-view]').forEach(l => l.classList.remove('active'));
        const activeLink = document.querySelector(`.sidebar-link[data-view="${viewName}"]`);
        if (activeLink) activeLink.classList.add('active');

        document.getElementById('pageTitle').innerText = viewName.charAt(0).toUpperCase() + viewName.slice(1);

        if (window.innerWidth <= 1024) document.getElementById('sidebar').classList.remove('open');
        this.currentView = viewName;

        // load necessary
        if (viewName === 'customers') this.searchCustomersList();
        if (viewName === 'inventory') this.loadInventory();
        if (viewName === 'history') this.loadHistory();
        if (viewName === 'dashboard') this.loadDashboardData();
        if (viewName === 'rented' || viewName === 'overdue') this.loadRentedData();
    }

    async loadDashboardData() {
        const stats = await this.DB.getDashboardStats();
        document.getElementById('dash_avail').innerText = stats.availablePBs;
        document.getElementById('dash_rented').innerText = stats.rented;
        document.getElementById('dash_overdue').innerText = stats.overdue;
        document.getElementById('dash_customers').innerText = stats.totalCustomers;
        document.getElementById('dash_revenue').innerText = `₦${stats.revenue.toLocaleString()}`;

        document.getElementById('nav_rented_badge').innerText = stats.rented;
        document.getElementById('nav_overdue_badge').innerText = stats.overdue;
        document.getElementById('nav_overdue_badge').style.display = stats.overdue > 0 ? 'inline' : 'none';
    }

    /* ──────────────────────────────────────────────────────────
       REGISTER CUSTOMER
    ────────────────────────────────────────────────────────── */
    showRegister() {
        this.setView('register');
        document.getElementById('reg_name').value = '';
        document.getElementById('reg_phone').value = '';
        document.getElementById('reg_line').value = '';
        document.getElementById('reg_notes').value = '';
        this.draftPhotoDataUrl = null;
        document.getElementById('reg_photo_img').style.display = 'none';
        document.getElementById('reg_photo_text').style.display = 'block';
    }

    // CAMERA 
    async openCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            const video = document.getElementById('reg_video');
            video.srcObject = stream;
            video.style.display = 'block';
            video.play(); // Explicitly start stream logic

            document.getElementById('reg_photo_text').style.display = 'none';
            document.getElementById('btn_open_camera').style.display = 'none';
            document.getElementById('btn_capture_photo').style.display = 'block';
        } catch (e) {
            alert('Camera not accessible.');
        }
    }

    captureCamera() {
        const video = document.getElementById('reg_video');
        const canvas = document.getElementById('reg_canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        this.draftPhotoDataUrl = canvas.toDataURL('image/jpeg');

        video.srcObject.getTracks().forEach(t => t.stop());
        video.style.display = 'none';

        const img = document.getElementById('reg_photo_img');
        img.src = this.draftPhotoDataUrl;
        img.style.display = 'block';

        document.getElementById('btn_open_camera').style.display = 'block';
        document.getElementById('btn_open_camera').innerText = '📷 RETAKE';
        document.getElementById('btn_capture_photo').style.display = 'none';
    }

    handlePhotoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            this.draftPhotoDataUrl = evt.target.result;
            const img = document.getElementById('reg_photo_img');
            img.src = this.draftPhotoDataUrl;
            img.style.display = 'block';
            document.getElementById('reg_photo_text').style.display = 'none';
        };
        reader.readAsDataURL(file);
    }

    async saveCustomer() {
        if (this.isSubmitting) return;

        if (!this.draftPhotoDataUrl) {
            showToast('Photo is REQUIRED to register customer', 'error');
            return;
        }

        const name = document.getElementById('reg_name').value.trim();
        const phone = document.getElementById('reg_phone').value.trim();
        const line = document.getElementById('reg_line').value.trim();
        const notes = document.getElementById('reg_notes').value.trim();

        if (!name || !phone || !line) {
            showToast('Name, Phone and Line are required', 'error');
            return;
        }

        const saveBtn = document.getElementById('btn_save_customer');

        try {
            this.isSubmitting = true;
            if (saveBtn) {
                saveBtn.innerText = 'REGISTERING...';
                saveBtn.disabled = true;
                saveBtn.style.opacity = '0.7';
            }
            this.showLoading(true);

            // create binary from dataurl
            const res = await fetch(this.draftPhotoDataUrl);
            const blob = await res.blob();

            const uploadRes = await this.DB.uploadPhoto(blob);
            if (!uploadRes.success) {
                this.showLoading(false);
                showToast('Photo upload failed: ' + uploadRes.error, 'error');
                document.getElementById('reg_photo_text').innerHTML = `<span style="color:var(--danger); font-weight:bold; font-size:12px; text-transform:uppercase;">Upload Failed</span><br><br><span style="font-size:11px; font-weight:600;">${uploadRes.error}</span><br><br><span style="text-decoration:underline; font-weight:600; cursor:pointer;" onclick="app.captureCamera()">RETRY PHOTO UPLOAD</span>`;
                document.getElementById('reg_photo_text').style.display = 'block';
                document.getElementById('reg_photo_img').style.display = 'none';
                return;
            }

            const regRes = await this.DB.registerCustomer({
                full_name: name,
                phone: phone,
                market_line: line,
                notes: notes,
                photo_url: uploadRes.path
            });

            this.showLoading(false);

            if (regRes.success) {
                showToast('Customer Profile Created!');
                this.showCustomerProfile(regRes.customer.id);
            } else if (regRes.exists) {
                alert(`Duplicate Blocked:\n\nA customer already exists with the normalized phone: ${phone}.\n\nSending you to their valid profile now.`);
                this.showCustomerProfile(regRes.customer.id);
            } else {
                showToast('Registration failed: ' + regRes.error, 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Unexpected error occurred', 'error');
        } finally {
            this.isSubmitting = false;
            this.showLoading(false);
            if (saveBtn) {
                saveBtn.innerText = 'REGISTER CUSTOMER';
                saveBtn.disabled = false;
                saveBtn.style.opacity = '1';
            }
        }
    }

    /* ──────────────────────────────────────────────────────────
       CUSTOMER PROFILE & DIRECTORY
    ────────────────────────────────────────────────────────── */
    async loadCustomersList() {
        await this.searchCustomersList(true);
    }

    async searchCustomersList(isFullReload = false) {
        if (this._isLoadingCustomers) return;
        this._isLoadingCustomers = true;

        const query = document.getElementById('custSearch')?.value || '';
        const grid = document.getElementById('customersGrid');

        if (isFullReload) {
            grid.innerHTML = '<div style="text-align:center; grid-column:1/-1; padding:40px; color:var(--text-light); font-size:16px;">Loading customers...</div>';
        }

        try {
            const res = await this.DB.searchCustomers(query);

            if (!res.success) {
                grid.innerHTML = `<div style="text-align:center; grid-column:1/-1; padding:40px; color:var(--danger); font-size:16px;">Unable to load customers. Please try again.<br><small style="opacity:0.7">${res.error}</small></div>`;
                return;
            }

            grid.innerHTML = '';
            const list = res.data;

            if (list.length === 0) {
                grid.innerHTML = '<div style="text-align:center; grid-column:1/-1; padding:40px; color:var(--text-light); font-size:18px;">No customers registered yet.</div>';
                return;
            }

            for (let c of list) {
                let photoUrl = null;
                try {
                    photoUrl = c.photo_url ? await this.DB.getPhotoUrl(c.photo_url) : null;
                } catch (err) {
                    console.error('[Customers] Photo mapping failed loosely:', err);
                }

                let photoHtml = photoUrl
                    ? `<img src="${photoUrl}" onclick="app.viewPhoto(this.src, event)" onerror="this.onerror=null; this.outerHTML='<div style=\\'width:60px; height:60px; border-radius:50%; background:#ffeeee; border:2px solid var(--danger); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:var(--danger); text-align:center; line-height:1.2;\\'>Photo<br>unavailable</div>'" style="width:60px; height:60px; border-radius:50%; object-fit:cover; border:2px solid var(--border); cursor:pointer;">`
                    : `<div style="width:60px; height:60px; border-radius:50%; background:#ffeeee; border:2px solid var(--danger); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:var(--danger); text-align:center; line-height:1.2;">Photo<br>unavailable</div>`;

                const statusBadge = c.active_status === 'OVERDUE' ? '<span class="badge badge-danger">OVERDUE</span>'
                    : c.active_status === 'RENTED' ? '<span class="badge badge-success">RENTED</span>'
                        : '<span class="badge" style="background:#eee;color:#666;">NO ACTIVE RENTAL</span>';

                grid.innerHTML += `
                    <div class="card card-clickable flex" style="padding:16px; flex-direction:column;" onclick="app.showCustomerProfile('${c.id}')">
                        <div class="flex items-center gap-3 w-full mb-3">
                            ${photoHtml}
                            <div style="flex: 1;">
                                <div style="font-weight:700; font-size:16px;">${c.full_name} ${c.is_active === false ? '<span style="color:var(--danger); font-size:12px;">[ARCHIVED]</span>' : ''}</div>
                                <div style="font-size:13px; color:var(--text-light);">${c.phone} | ${c.market_line}</div>
                        </div>
                    </div>
                    <div class="flex items-center justify-between w-full" style="border-top:1px solid var(--border); padding-top:12px;">
                        <div>
                            <div style="font-size:11px; text-transform:uppercase; color:var(--text-light); font-weight:700;">Status</div>
                            ${statusBadge}
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:11px; text-transform:uppercase; color:var(--text-light); font-weight:700;">Previous Rentals</div>
                            <div style="font-size:14px; font-weight:700; color:var(--primary);">${c.rental_count}</div>
                        </div>
                    </div>
                    <button class="btn btn-outline w-full mt-3" style="padding:6px; font-size:12px;">VIEW PROFILE / HISTORY</button>
                </div>
            `;
            }
        } finally {
            this._isLoadingCustomers = false;
        }
    }

    async showCustomerProfile(id) {
        this.showLoading(true);
        const data = await this.DB.getCustomerDetails(id);
        this.showLoading(false);
        if (!data) {
            showToast('Failed to load profile', 'error');
            return;
        }

        const { customer, rentals } = data;
        let photoUrl = customer.photo_url ? await this.DB.getPhotoUrl(customer.photo_url) : null;
        let photoHtml = photoUrl
            ? `<img src="${photoUrl}" onclick="app.viewPhoto(this.src, event)" onerror="this.onerror=null; this.outerHTML='<div style=\\'width:160px; height:160px; border-radius:50%; background:#ffeeee; border:4px solid var(--danger); margin:0 auto 16px; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:700; color:var(--danger); text-align:center;\\'>Photo<br>unavailable</div>'" style="width:160px; height:160px; border-radius:50%; object-fit:cover; border:4px solid var(--border); margin:0 auto 16px; cursor:pointer;">`
            : `<div style="width:160px; height:160px; border-radius:50%; background:#ffeeee; border:4px solid var(--danger); margin:0 auto 16px; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:700; color:var(--danger); text-align:center;">Photo<br>unavailable</div>`;

        const activeRental = rentals.find(r => r.status === 'RENTED' || r.status === 'OVERDUE');
        const activeLabel = activeRental ? `
            <div style="background:var(--bg-secondary); padding:16px; border-radius:8px; margin-top:16px; border-left:4px solid var(--primary);">
                <div style="font-size:12px; font-weight:700; color:var(--text-light);">CURRENT RENTAL</div>
                <div style="font-weight:700; font-size:16px; color:var(--primary); margin:4px 0;">${activeRental.power_banks.power_bank_number}</div>
                <div style="font-size:13px; color:var(--text-light);">Since ${new Date(activeRental.rented_at).toLocaleString()}</div>
                <div style="margin-top:10px;">
                    <span class="badge ${activeRental.status === 'OVERDUE' ? 'badge-danger' : 'badge-success'}">${activeRental.status}</span>
                </div>
            </div>
        ` : `
            <div style="background:var(--bg-secondary); padding:16px; border-radius:8px; margin-top:16px;">
                <div style="font-size:12px; font-weight:700; color:var(--text-light);">CURRENT RENTAL</div>
                <div style="font-weight:700; color:var(--text-dark);">NONE</div>
            </div>
        `;

        let historyHtml = rentals.map(r => `
            <tr>
                <td>${new Date(r.rented_at).toLocaleDateString()}</td>
                <td style="font-weight:600; color:var(--primary);">${r.power_banks.power_bank_number}</td>
                <td>₦${r.amount}</td>
                <td><span class="badge ${r.status === 'OVERDUE' ? 'badge-danger' : (r.status === 'RETURNED' ? 'badge-primary' : 'badge-success')}">${r.status}</span></td>
            </tr>
        `).join('');

        const profileHtml = `
            <div class="grid grid-cols-2 gap-4 mb-4" style="grid-template-columns: 1fr 2fr;">
                <div class="card text-center" style="padding:32px;">
                    ${photoHtml}
                    <h2 style="font-size:24px; margin-bottom:8px;">${customer.full_name}</h2>
                    <p style="color:var(--text-light); font-size:16px; margin-bottom:4px;">${customer.phone}</p>
                    <p style="color:var(--text-light); font-size:16px;">${customer.market_line}</p>
                    ${activeLabel}
                    <button class="btn btn-primary w-full mt-4" onclick="app.showNewRental('${customer.id}', '${escape(customer.full_name)}')">
                        + NEW RENTAL
                    </button>
                    ${customer.is_active === false
                ? `<button class="btn btn-outline w-full mt-3" style="color:var(--success); border-color:var(--success);" onclick="app.reactivateCustomer('${customer.id}', '${escape(customer.full_name)}')">
                                ✅ REACTIVATE CUSTOMER
                           </button>`
                : `<button class="btn btn-outline w-full mt-3" style="color:var(--danger); border-color:var(--danger);" onclick="app.deleteCustomerPrompt('${customer.id}', '${escape(customer.full_name)}', ${rentals.length}, ${activeRental ? 'true' : 'false'})">
                                🗑 ${rentals.length > 0 ? 'DEACTIVATE CUSTOMER' : 'DELETE CUSTOMER'}
                           </button>`
            }
                </div>
                
                <div class="card" style="padding:32px;">
                    <h3 class="mb-4">RENTAL HISTORY <span style="float:right; font-size:16px; font-weight:400; color:var(--text-light);">Total: ${rentals.length}</span></h3>
                    <div style="max-height: 400px; overflow-y:auto; border:1px solid var(--border); border-radius:8px;">
                        <table class="data-table" style="margin:0; width:100%;">
                            <thead style="position:sticky; top:0; background:white;">
                                <tr><th>Date</th><th>Power Bank</th><th>Amount</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                ${historyHtml || '<tr><td colspan="4" class="text-center text-light">No rentals yet</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('profileContainer').innerHTML = profileHtml;
        this.setView('profile');
    }

    async deleteCustomerPrompt(id, nameEscaped, totalRentals, hasActiveRental) {
        if (hasActiveRental) {
            alert('This customer currently has an active rental. Return the power bank before deactivating this customer.');
            return;
        }

        const name = unescape(nameEscaped);

        if (totalRentals > 0) {
            if (confirm(`Are you sure you want to deactivate ${name}?\n\nBecause they have rental history, they cannot be permanently deleted, but they will be hidden from new rentals.`)) {
                this.showLoading(true);

                // Add explicit timeout to prevent infinite Loading state
                const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ success: false, error: 'Request timed out' }), 10000));
                const res = await Promise.race([this.DB.archiveCustomer(id, false), timeoutPromise]);

                this.showLoading(false);

                if (res.success) {
                    showToast(name + ' deactivated successfully.');
                    this.setView('customers');
                } else {
                    alert('Failed to deactivate customer: ' + res.error);
                }
            }
            return;
        }

        if (confirm(`Are you absolutely sure you want to delete ${name}?\n\nThis action cannot be undone.`)) {
            this.showLoading(true);

            // Add explicit timeout
            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ success: false, error: 'Request timed out' }), 10000));
            const res = await Promise.race([this.DB.deleteCustomer(id), timeoutPromise]);

            this.showLoading(false);

            if (res.success) {
                showToast(name + ' deleted successfully.');
                this.setView('customers');
                this.loadDashboardData();
            } else {
                alert('Failed to delete customer: ' + res.error);
            }
        }
    }

    async reactivateCustomer(id, nameEscaped) {
        const name = unescape(nameEscaped);
        this.showLoading(true);
        const res = await this.DB.archiveCustomer(id, true);
        this.showLoading(false);
        if (res.success) {
            showToast(name + ' reactivated.');
            this.setView('customers');
        } else {
            alert('Failed to reactivate: ' + res.error);
        }
    }

    /* ──────────────────────────────────────────────────────────
       NEW RENTAL WORKFLOW
    ────────────────────────────────────────────────────────── */
    showNewRentalSearch() {
        this.setView('new-rental-search');
        document.getElementById('rentalSearchCust').value = '';
        this.searchRentalCustomer();
    }

    async searchRentalCustomer() {
        const query = document.getElementById('rentalSearchCust').value || '';
        const res = await this.DB.searchCustomers(query);
        const grid = document.getElementById('rentalCustResultList');
        grid.innerHTML = '';

        if (!res.success) {
            grid.innerHTML = '<div style="color:var(--danger);">Error loading lookup results.</div>';
            return;
        }

        const list = res.data;
        if (list.length === 0) {
            grid.innerHTML = '<div style="color:var(--text-light);">No customer match found.</div>';
            return;
        }

        for (let c of list) {
            let photoUrl = c.photo_url ? await this.DB.getPhotoUrl(c.photo_url) : null;
            let photoHtml = photoUrl
                ? `<img src="${photoUrl}" onclick="app.viewPhoto(this.src, event)" onerror="this.onerror=null; this.outerHTML='<div style=\\'width:60px; height:60px; border-radius:50%; background:#ffeeee; border:2px solid var(--danger); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:var(--danger); text-align:center; line-height:1.2;\\'>MISSING<br>PHOTO</div>'" style="width:60px; height:60px; border-radius:50%; object-fit:cover; border:2px solid var(--border); cursor:pointer;">`
                : `<div style="width:60px; height:60px; border-radius:50%; background:#ffeeee; border:2px solid var(--danger); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:var(--danger); text-align:center; line-height:1.2;">MISSING<br>PHOTO</div>`;

            grid.innerHTML += `
                <div class="card card-clickable flex items-center gap-3" style="padding:16px; cursor:pointer;" onclick="app.showNewRental('${c.id}', '${escape(c.full_name)}', '${c.phone}', '${c.market_line}', '${photoUrl || ''}')">
                    ${photoHtml}
                    <div>
                        <div style="font-weight:700; font-size:16px;">${c.full_name}</div>
                        <div style="font-size:13px; color:var(--text-light);">${c.phone} | ${c.market_line}</div>
                    </div>
                    <div style="margin-left:auto;">
                        <button class="btn btn-outline" style="padding:6px 16px;">SELECT</button>
                    </div>
                </div>
            `;
        }
    }

    async showNewRental(id, nameEscaped, phone = null, line = null, photo = null) {
        let name = unescape(nameEscaped);
        this.draftCustomer = id;

        this.showLoading(true);
        const data = await this.DB.getCustomerDetails(id);
        this.showLoading(false);

        if (!data) {
            showToast('Failed to load customer record', 'error');
            return;
        }

        const activeRental = data.rentals.find(r => ['READY_FOR_COLLECTION', 'COLLECTED', 'RENTED', 'OVERDUE'].includes(r.status));

        if (activeRental) {
            this.setView('new-rental-blocked');

            const btnCurrent = document.getElementById('btnViewBlockedRental');
            btnCurrent.onclick = () => this.showCustomerProfile(id);

            const details = document.getElementById('blockedRentalDetails');
            details.innerHTML = `
                <div style="font-size:16px; font-weight:700;">${name}</div>
                <div style="font-size:14px; color:var(--text-light); margin-bottom:16px;">${data.customer.phone} | ${data.customer.market_line}</div>
                
                <div style="background:var(--bg-secondary); padding:16px; border-radius:8px; border-left:4px solid var(--primary); text-align:left;">
                    <div style="font-size:12px; font-weight:700; color:var(--text-light); text-transform:uppercase;">CURRENT POWER BANK</div>
                    <div style="font-size:18px; font-weight:700; color:var(--primary); margin-top:4px;">${activeRental.power_banks.power_bank_number}</div>
                    <div style="font-size:13px; color:var(--text-light); margin-top:4px;">Date: ${new Date(activeRental.rented_at).toLocaleString()}</div>
                    <div style="margin-top:8px;">
                        <span class="badge ${activeRental.status === 'OVERDUE' ? 'badge-danger' : 'badge-success'}">${activeRental.status}</span>
                    </div>
                </div>
            `;
            return;
        }

        this.setView('new-rental');

        if (!photo) {
            photo = data.customer.photo_url ? await this.DB.getPhotoUrl(data.customer.photo_url) : '../assets/dummy.jpg';
            phone = data.customer.phone;
            line = data.customer.market_line;
            name = data.customer.full_name;
        }

        const preview = document.getElementById('newRentalCustPreview');
        preview.innerHTML = `
            <img src="${photo}" onclick="app.viewPhoto(this.src, event)" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:2px solid var(--border); cursor:pointer;">
            <div>
                <div style="font-size:12px; font-weight:700; color:var(--text-light); text-transform:uppercase;">CUSTOMER</div>
                <div style="font-size:20px; font-weight:700;">${name}</div>
                <div style="font-size:14px; color:var(--text-light);">${phone} | ${line}</div>
            </div>
        `;

        // load available PBs
        const avail = await this.DB.getAvailablePowerBanks();
        const sel = document.getElementById('nr_pb');
        sel.innerHTML = '';
        if (avail.length === 0) {
            sel.innerHTML = '<option value="">-- NO POWER BANKS AVAILABLE --</option>';
        } else {
            avail.forEach(pb => {
                sel.innerHTML += `<option value="${pb.id}">${pb.power_bank_number} - AVAILABLE (${pb.condition})</option>`;
            });
        }
    }

    async confirmRental() {
        const pbId = document.getElementById('nr_pb').value;
        const payment = document.getElementById('nr_payment').value;
        const cord = document.getElementById('nr_cord').value === 'true';

        if (!pbId) {
            showToast('Select an available power bank', 'error');
            return;
        }

        this.showLoading(true);
        const session = await this.DB.getAdminSession();
        const payload = {
            customer_id: this.draftCustomer,
            power_bank_id: pbId,
            amount: 500,
            payment_method: payment,
            charging_cord_provided: cord,
            rented_by: session.user.id
        };

        const res = await this.DB.createRental(payload);

        this.showLoading(false);
        if (res.success) {
            showToast('Rental Confirmed!');
            this.setView('rented');
        } else {
            showToast('Rental failed: ' + res.error, 'error');
        }
    }

    /* ──────────────────────────────────────────────────────────
       RENTALS / RETURNS
    ────────────────────────────────────────────────────────── */
    async loadRentedData() {
        // Load both active and overdue
        this.rentalsData = await this.DB.getActiveRentals();
        this.renderRentedTable();
    }

    async renderRentedTable() {
        const query = (document.getElementById('rentedSearch')?.value || '').toLowerCase();
        const tbody = document.getElementById('rentedTableBody');
        tbody.innerHTML = '';

        let filtered = this.rentalsData;
        if (this.currentView === 'overdue') {
            filtered = filtered.filter(r => r.status === 'OVERDUE');
        }
        if (query) {
            filtered = filtered.filter(r =>
                r.customers?.full_name.toLowerCase().includes(query) ||
                r.customers?.phone.toLowerCase().includes(query) ||
                r.power_banks?.power_bank_number.toLowerCase().includes(query) ||
                r.customers?.market_line.toLowerCase().includes(query)
            );
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-light" style="padding:40px;">No rentals found</td></tr>`;
            return;
        }

        for (let r of filtered) {
            let photoUrl = r.customers?.photo_url ? await this.DB.getPhotoUrl(r.customers.photo_url) : null;
            let photoHtml = photoUrl
                ? `<img src="${photoUrl}" onclick="app.viewPhoto(this.src, event)" onerror="this.onerror=null; this.outerHTML='<div style=\\'width:40px; height:40px; border-radius:50%; background:#ffeeee; border:1px solid var(--danger); display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:700; color:var(--danger); text-align:center; line-height:1;\\'>NO<br>PIC</div>'" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:1px solid #ccc; cursor:pointer;">`
                : `<div style="width:40px; height:40px; border-radius:50%; background:#ffeeee; border:1px solid var(--danger); display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:700; color:var(--danger); text-align:center; line-height:1;">NO<br>PIC</div>`;

            const rentedDate = new Date(r.rented_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' +
                new Date(r.rented_at).toLocaleDateString([], { month: 'short', day: 'numeric' });

            const tr = document.createElement('tr');
            const stateLabel = r.status === 'OVERDUE' ? `🔴 OVERDUE` : `🟢 RENTED`;

            tr.innerHTML = `
                <td style="font-weight:600;" onclick="app.showCustomerProfile('${r.customer_id}')" style="cursor:pointer; color:var(--primary);">${r.customers?.full_name || '—'} <div style="font-size:12px; color:var(--text-light); font-weight:normal;">${r.customers?.phone}</div></td>
                <td>${photoHtml}</td>
                <td style="font-weight:700; color:var(--primary);">${r.power_banks?.power_bank_number || '—'}</td>
                <td>Line ${r.customers?.market_line || '—'}</td>
                <td>${rentedDate}</td>
                <td style="font-weight:700; color: ${r.status === 'OVERDUE' ? 'var(--danger)' : 'var(--success)'};">${stateLabel}</td>
                <td><button class="btn btn-primary" style="padding:8px 16px; font-size:13px;" onclick="app.openReturn('${r.id}', '${r.power_bank_id}', '${escape(r.customers?.full_name)}', '${r.power_banks?.power_bank_number}', ${r.charging_cord_provided})">RETURN</button></td>
            `;
            tbody.appendChild(tr);
        }
    }

    openReturn(rentalId, pbId, nameEscaped, pbNum, cordProvided) {
        this.draftReturn = { rentalId, pbId };

        document.getElementById('ret_preview').innerHTML = `
            <div style="font-size:12px; font-weight:700; color:var(--text-light); margin-bottom:4px;">CUSTOMER</div>
            <div style="font-size:18px; font-weight:700;">${unescape(nameEscaped)}</div>
            <div style="font-size:12px; font-weight:700; color:var(--text-light); margin-top:12px; margin-bottom:4px;">POWER BANK</div>
            <div style="font-size:24px; font-weight:700; color:var(--primary);">${pbNum}</div>
        `;

        if (!cordProvided) {
            document.getElementById('ret_cord_group').style.display = 'none';
            document.getElementById('ret_cord_ret').value = 'NOT PROVIDED';
        } else {
            document.getElementById('ret_cord_group').style.display = 'block';
            document.getElementById('ret_cord_ret').value = 'RETURNED';
        }

        document.getElementById('ret_pb_cond').value = 'GOOD';
        document.getElementById('ret_notes').value = '';

        document.getElementById('returnModal').style.display = 'flex';
    }

    async executeReturn() {
        const pb_cond = document.getElementById('ret_pb_cond').value;
        const cord_ret = document.getElementById('ret_cord_ret').value;
        const notes = document.getElementById('ret_notes').value;

        const session = await this.DB.getAdminSession();

        this.showLoading(true);
        const res = await this.DB.processReturn(this.draftReturn.rentalId, this.draftReturn.pbId, {
            power_bank_condition_at_return: pb_cond,
            charging_cord_returned: cord_ret === 'RETURNED',
            charging_cord_condition: cord_ret === 'RETURNED' ? 'GOOD' : 'NOT_RETURNED',
            notes: notes,
            returned_by: session.user.id
        });
        this.showLoading(false);

        if (res.success) {
            document.getElementById('returnModal').style.display = 'none';
            showToast('Return Processed Successfully');
            this.loadRentedData();
            this.loadDashboardData();
        } else {
            showToast('Return failed: ' + res.error, 'error');
        }
    }

    // Inventory
    async loadInventory() {
        const { data, error } = await this.DB.supabase.from('power_banks').select('*').order('power_bank_number', { ascending: true });
        const tbody = document.getElementById('inventoryTableBody');
        tbody.innerHTML = '';
        if (!data || data.length === 0) return;

        data.forEach(pb => {
            const statusColor = pb.status === 'AVAILABLE' ? 'var(--success)' : pb.status === 'RENTED' || pb.status === 'OVERDUE' ? 'var(--primary)' : 'var(--danger)';
            tbody.innerHTML += `
               <tr>
                <td style="font-weight:700; color:var(--primary);">${pb.power_bank_number}</td>
                <td style="color:${statusColor}; font-weight:700;">${pb.status}</td>
                <td>${pb.condition}</td>
                <td>${pb.notes || '—'}</td>
               </tr>
            `;
        });
    }

    // History
    async loadHistory() {
        // limit 50
        const { data, error } = await this.DB.supabase.from('rentals').select('*, customers(full_name), power_banks(power_bank_number)').order('rented_at', { ascending: false }).limit(50);
        const tbody = document.getElementById('historyTableBody');
        tbody.innerHTML = '';
        if (!data || data.length === 0) return;

        data.forEach(r => {
            tbody.innerHTML += `
               <tr>
                <td style="font-weight:600;">${r.customers?.full_name}</td>
                <td style="font-weight:700; color:var(--primary);">${r.power_banks?.power_bank_number}</td>
                <td>${new Date(r.rented_at).toLocaleString()}</td>
                <td>${r.returned_at ? new Date(r.returned_at).toLocaleString() : '—'}</td>
                <td><span class="badge ${r.status === 'RETURNED' ? 'badge-primary' : (r.status === 'OVERDUE' ? 'badge-danger' : 'badge-success')}">${r.status}</span></td>
               </tr>
            `;
        });
    }

    logout() {
        this.DB.signOut();
    }
}

window.app = new ShopApp();
