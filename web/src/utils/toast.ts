// Toast 消息提示工具

export interface ToastOptions {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

let toastContainer: HTMLElement | null = null;

function createToastContainer() {
  if (toastContainer) return toastContainer;
  
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  toastContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;
  
  const style = document.createElement('style');
  style.textContent = `
    .toast-container .toast {
      padding: 14px 20px;
      border-radius: 10px;
      color: white;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      animation: toast-slide-in 0.3s ease;
      max-width: 320px;
    }
    .toast-container .toast.success { background: #10b981; }
    .toast-container .toast.error { background: #ef4444; }
    .toast-container .toast.warning { background: #f59e0b; }
    .toast-container .toast.info { background: #3b82f6; }
    @keyframes toast-slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes toast-slide-out {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
    .toast-container .toast.removing {
      animation: toast-slide-out 0.3s ease forwards;
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(toastContainer);
  
  return toastContainer;
}

export function showToast(options: string | ToastOptions) {
  const { message, type = 'info', duration = 3000 } = typeof options === 'string' ? { message: options } : options;
  
  const container = createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  if (duration > 0) {
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
  
  return toast;
}

export default { showToast };