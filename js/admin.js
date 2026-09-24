// Admin application logic

document.addEventListener('DOMContentLoaded', () => {
    const { Storage, formatCurrency, showToast } = window.JudetexUtils;

    // Basic Auth Check
    if (!localStorage.getItem('judetex_admin_auth')) {
        window.location.href = 'admin-login.html';
        return;
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('judetex_admin_auth');
            window.location.href = 'admin-login.html';
        });
    }

    // Sidebar toggler
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    // View routing
    const links = document.querySelectorAll('.sidebar-link[data-view]');
    const views = document.querySelectorAll('.view-section');
    const pageTitle = document.getElementById('pageTitle');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();

            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            const v = link.getAttribute('data-view');
            views.forEach(view => view.classList.remove('active'));
            document.getElementById(`view-${v}`).classList.add('active');

            pageTitle.innerText = link.innerText;

            if (window.innerWidth <= 1024) sidebar.classList.remove('open');

            // refresh data on view change
            if (v === 'requests') loadRequests();
            if (v === 'dashboard') loadDashboard();
        });
    });

    /* MOCK DATA LOADING */
    const getBadgeClass = (status) => {
        if (status === 'AWAITING VERIFICATION') return 'badge-warning';
        if (status === 'PAYMENT VERIFIED' || status === 'READY FOR COLLECTION') return 'badge-success';
        if (status === 'COLLECTED') return 'badge-primary';
        if (status === 'OVERDUE' || status === 'REJECTED') return 'badge-danger';
        return 'badge-primary';
    };

    const loadDashboard = () => {
        const rentals = Storage.get('rentals', []);
        const recent = rentals.slice(-5).reverse();

        const tbody = document.getElementById('recentRequestsBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (recent.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center text-light">No recent rentals</td></tr>`;
            return;
        }

        recent.forEach(r => {
            tbody.innerHTML += `
        <tr>
          <td><span style="font-weight:600; font-size:14px;">${r.id}</span></td>
          <td style="font-weight:600;">${r.powerBankId}</td>
          <td><span class="badge ${getBadgeClass(r.status)}">${r.status}</span></td>
        </tr>
      `;
        });
    };

    // VERIFICATION MODAL LOGIC
    let currentVerifyingReq = null;
    const modal = document.getElementById('verificationModal');
    const closeBtn = document.getElementById('modal_closeBtn');

    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });

    window.verifyRequest = (id) => {
        const rentals = Storage.get('rentals', []);
        const req = rentals.find(r => r.id === id);
        if (!req) return;

        currentVerifyingReq = req;

        document.getElementById('modal_name').innerText = req.customer.name;
        document.getElementById('modal_phone').innerText = req.customer.phone;
        document.getElementById('modal_line').innerText = req.customer.marketLine;
        document.getElementById('modal_pb').innerText = req.powerBankId;

        const cPhoto = document.getElementById('modal_customerPhoto');
        const noCPhoto = document.getElementById('modal_noPhoto');
        if (req.photoData) {
            cPhoto.src = req.photoData;
            cPhoto.style.display = 'block';
            noCPhoto.style.display = 'none';
        } else {
            cPhoto.style.display = 'none';
            noCPhoto.style.display = 'block';
        }

        const rImg = document.getElementById('modal_receipt');
        const noR = document.getElementById('modal_noReceipt');
        if (req.receiptData && req.receiptData !== "MOCK_PDF_DATA") {
            rImg.src = req.receiptData;
            rImg.style.display = 'block';
            noR.style.display = 'none';
        } else {
            rImg.style.display = 'none';
            noR.style.display = 'block';
            if (req.receiptData === "MOCK_PDF_DATA") noR.innerText = "PDF Document";
        }

        modal.style.display = 'flex';
    };

    document.getElementById('modal_approveBtn').addEventListener('click', () => {
        updateRequestStatus(currentVerifyingReq.id, 'READY FOR COLLECTION');
        showToast('Payment verified. Ready for collection.');
    });

    document.getElementById('modal_rejectBtn').addEventListener('click', () => {
        // Release power bank if rejected
        const pbs = Storage.get('powerbanks', []);
        const idx = pbs.findIndex(p => p.id === currentVerifyingReq.powerBankId);
        if (idx !== -1) {
            pbs[idx].status = 'AVAILABLE';
            Storage.set('powerbanks', pbs);
        }
        updateRequestStatus(currentVerifyingReq.id, 'REJECTED');
        showToast('Request rejected.', 'error');
    });

    const updateRequestStatus = (id, newStatus) => {
        const rentals = Storage.get('rentals', []);
        const idx = rentals.findIndex(r => r.id === id);
        if (idx !== -1) {
            rentals[idx].status = newStatus;
            Storage.set('rentals', rentals);
        }
        modal.style.display = 'none';
        loadRequests();
        loadDashboard();
    };

    const loadRequests = () => {
        const rentals = Storage.get('rentals', []);
        const tbody = document.getElementById('requestsTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        // Show only pending/active originally
        const visible = rentals.filter(r => r.status.includes('AWAITING') || r.status.includes('READY')).reverse();

        if (visible.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:40px; color:var(--text-light);">No pending requests found.</td></tr>`;
            return;
        }

        visible.forEach(r => {
            let actionBtn = `<button class="btn btn-outline" style="padding:6px 12px; font-size:12px;" onclick="verifyRequest('${r.id}')">VIEW</button>`;

            tbody.innerHTML += `
        <tr>
          <td><span style="font-weight:700; color:var(--primary);">${r.id}</span></td>
          <td>
            <div style="font-weight:600;">${r.customer.name}</div>
            <div style="font-size:12px; color:var(--text-light);">${r.customer.phone}</div>
          </td>
          <td style="font-weight:600;">${r.powerBankId}</td>
          <td>₦${r.amount}</td>
          <td><span class="badge ${getBadgeClass(r.status)}">${r.status}</span></td>
          <td>${actionBtn}</td>
        </tr>
      `;
        });
    };

    // Init
    loadDashboard();
});
