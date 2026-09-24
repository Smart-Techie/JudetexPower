// Customer application logic

document.addEventListener('DOMContentLoaded', () => {
    const { Storage } = window.JudetexUtils;
    let selectedPowerBank = null;

    // -- Power Banks Page Logic --
    const pbGrid = document.getElementById('powerBankGrid');
    if (pbGrid) {
        const powerbanks = Storage.get('powerbanks', []);
        const availablePBs = powerbanks.filter(pb => pb.status === 'AVAILABLE');

        if (availablePBs.length === 0) {
            document.getElementById('emptyState').style.display = 'block';
        } else {
            availablePBs.forEach(pb => {
                const card = document.createElement('div');
                card.className = 'card pb-card';
                card.style.cursor = 'pointer';
                card.style.display = 'flex';
                card.style.flexDirection = 'column';
                card.style.justifyContent = 'space-between';

                card.innerHTML = `
          <div class="mb-3">
            <div class="flex justify-between items-center mb-2">
              <span style="font-weight: 600; color: var(--text-light); text-transform: uppercase; font-size: 14px;">POWER BANK</span>
              <span class="badge badge-success">● AVAILABLE</span>
            </div>
            <div style="font-size: 40px; font-weight: 800; color: var(--primary); line-height: 1;">${pb.id}</div>
          </div>
          <div>
            <div class="mb-3" style="font-size: 20px; font-weight: 700; color: var(--text-dark);">₦500 <span style="font-size: 14px; font-weight: 600; color: var(--text-light);">/ DAY</span></div>
            <button class="btn btn-outline w-full pb-select-btn" data-id="${pb.id}">SELECT</button>
          </div>
        `;

                card.addEventListener('click', () => selectPowerBank(pb.id, card));
                pbGrid.appendChild(card);
            });
        }
    }

    function selectPowerBank(id, cardElement) {
        // Reset all cards
        document.querySelectorAll('.pb-card').forEach(c => {
            c.style.borderColor = 'var(--border)';
            c.style.boxShadow = 'none';
            c.style.backgroundColor = 'white';
            const btn = c.querySelector('.pb-select-btn');
            btn.className = 'btn btn-outline w-full pb-select-btn';
            btn.innerText = 'SELECT';
        });

        // Highlight selected
        cardElement.style.borderColor = 'var(--accent)';
        cardElement.style.boxShadow = '0 0 0 4px rgba(255, 107, 0, 0.1)';
        cardElement.style.backgroundColor = '#FFFBF7';

        const btn = cardElement.querySelector('.pb-select-btn');
        btn.className = 'btn btn-primary w-full pb-select-btn';
        btn.innerText = 'SELECTED';

        selectedPowerBank = id;

        // Show Selection Bar
        const bar = document.getElementById('selectionBar');
        const displayId = document.getElementById('selectedPbId');
        if (bar && displayId) {
            displayId.innerText = id;
            bar.style.display = 'block';
            // Add padding to body so bar doesn't overlap content
            document.body.style.paddingBottom = '120px';
        }
    }

    const continueBtn = document.getElementById('continueBtn');
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            if (selectedPowerBank) {
                Storage.set('current_rental_request', { powerBankId: selectedPowerBank });
                window.location.href = 'customer-details.html';
            }
        });
    }
});
