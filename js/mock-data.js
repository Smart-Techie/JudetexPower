// Mock Data Initialization

const initialPowerBanks = [
    { id: 'PB-001', status: 'AVAILABLE', condition: 'GOOD' },
    { id: 'PB-002', status: 'AVAILABLE', condition: 'GOOD' },
    { id: 'PB-003', status: 'RENTED', condition: 'GOOD' },
    { id: 'PB-004', status: 'MAINTENANCE', condition: 'DAMAGED' },
    { id: 'PB-005', status: 'AVAILABLE', condition: 'GOOD' },
    { id: 'PB-006', status: 'RESERVED', condition: 'GOOD' },
    { id: 'PB-007', status: 'OVERDUE', condition: 'GOOD' },
    { id: 'PB-008', status: 'AVAILABLE', condition: 'GOOD' }
];

const initialRentals = [];

const initializeData = () => {
    const { Storage } = window.JudetexUtils;

    if (!Storage.get('powerbanks')) {
        Storage.set('powerbanks', initialPowerBanks);
    }

    if (!Storage.get('rentals')) {
        Storage.set('rentals', initialRentals);
    }
};

// Initialize immediately
initializeData();
