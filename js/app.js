// Global App Logic

document.addEventListener('DOMContentLoaded', () => {
    // Mobile menu toggle
    const menuBtn = document.getElementById('mobileMenuBtn');
    const navLinks = document.getElementById('navLinks');

    if (menuBtn && navLinks) {
        menuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('show');
            const isExpanded = navLinks.classList.contains('show');
            menuBtn.innerHTML = isExpanded ? '✕' : '☰';
        });
    }
});

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const swPath = window.location.pathname.includes('/pages/') ? '../sw.js' : './sw.js';
        navigator.serviceWorker.register(swPath).catch(err => {
            console.log('SW registration failed:', err);
        });
    });
}

// ── PWA Custom Install Prompt Logic ──
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const declineCount = parseInt(sessionStorage.getItem('pwaDeclineCount') || '0');

    if (declineCount === 0) {
        setTimeout(showInstallPrompt, 1000);
    } else if (declineCount === 1) {
        const declineTime = parseInt(sessionStorage.getItem('pwaDeclineTime') || '0');
        const elapsed = Date.now() - declineTime;
        const remaining = 300000 - elapsed; // 5 mins = 300,000 ms

        if (remaining <= 0) {
            setTimeout(showInstallPrompt, 1000);
        } else {
            setTimeout(showInstallPrompt, remaining);
        }
    }
    // If declineCount >= 2, we don't show it this session (returns on next visit).
});

function createInstallPrompt() {
    const prompt = document.createElement('div');
    prompt.id = 'pwaInstallPrompt';
    prompt.style.cssText = `
        position: fixed;
        bottom: -250px;
        left: 50%;
        transform: translateX(-50%);
        width: 90%;
        max-width: 400px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        padding: 20px;
        z-index: 10000;
        transition: bottom 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        flex-direction: column;
        gap: 16px;
        border: 1px solid var(--border);
    `;

    prompt.innerHTML = `
        <div style="display: flex; gap: 16px; align-items: center;">
            <div style="width: 50px; height: 50px; background: var(--bg-secondary); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📱</div>
            <div style="flex: 1;">
                <h4 style="margin: 0; font-size: 16px; color: var(--text-dark);">Install JudeTex Power</h4>
                <p style="margin: 4px 0 0; font-size: 13px; color: var(--text-body);">Install to your home screen for quick and easy rentals.</p>
            </div>
        </div>
        <div style="display: flex; gap: 12px;">
            <button id="pwaDeclineBtn" style="flex: 1; padding: 12px; border: 1px solid var(--border); background: transparent; border-radius: 6px; font-weight: 600; cursor: pointer; color: var(--text-body);">NOT NOW</button>
            <button id="pwaInstallBtn" style="flex: 1; padding: 12px; border: none; background: var(--accent); color: white; border-radius: 6px; font-weight: 600; cursor: pointer;">INSTALL</button>
        </div>
    `;
    document.body.appendChild(prompt);
    return prompt;
}

function showInstallPrompt() {
    if (!deferredPrompt) return;

    let promptEl = document.getElementById('pwaInstallPrompt');
    if (!promptEl) {
        promptEl = createInstallPrompt();
    }

    setTimeout(() => {
        promptEl.style.bottom = '24px';
    }, 50);

    document.getElementById('pwaInstallBtn').onclick = async () => {
        promptEl.style.bottom = '-250px';
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
        }
        deferredPrompt = null;
    };

    document.getElementById('pwaDeclineBtn').onclick = () => {
        promptEl.style.bottom = '-250px';

        let currentCount = parseInt(sessionStorage.getItem('pwaDeclineCount') || '0');
        currentCount++;
        sessionStorage.setItem('pwaDeclineCount', currentCount);
        sessionStorage.setItem('pwaDeclineTime', Date.now());

        if (currentCount === 1) {
            setTimeout(() => {
                showInstallPrompt();
            }, 300000); // Trigger again after 5 mins
        }
    };
}
