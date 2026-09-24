// Utility library for common functions

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0
  }).format(amount);
};

const formatDate = (dateInput) => {
  const d = new Date(dateInput);
  return d.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const showToast = (message, type = 'success') => {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-message">${message}</span>
    </div>
  `;
  
  container.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 100);
  
  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (container.contains(toast)) {
        container.removeChild(toast);
      }
    }, 300);
  }, 3000);
};

const validatePhone = (phone) => {
  const phoneRe = /^[0-9]{10,11}$/;
  return phoneRe.test(phone.replace(/[^0-9]/g, ''));
};

const validateFile = (file, maxSizeMB = 5, allowedTypes = ['image/jpeg', 'image/png', 'image/jpg']) => {
  if (!file) return { valid: false, message: 'No file selected' };
  
  if (file.size > maxSizeMB * 1024 * 1024) {
    return { valid: false, message: `File size must be under ${maxSizeMB}MB` };
  }
  
  if (!allowedTypes.includes(file.type) && !allowedTypes.includes('application/pdf') ) {
     // Checking types logic based on requirement
     return { valid: false, message: 'Invalid file type.' };
  }
  
  return { valid: true };
};

const Storage = {
  get: (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(`judetex_${key}`);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(`judetex_${key}`, JSON.stringify(value));
    } catch (e) {
      console.error('Storage full or unavailable', e);
    }
  }
};

window.JudetexUtils = {
  formatCurrency,
  formatDate,
  showToast,
  validatePhone,
  validateFile,
  Storage
};
