import React, { useEffect } from 'react';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="toast-container" role="region" aria-live="polite" aria-label="通知提示">
      {toasts?.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = window.setTimeout(
        () => onDismiss(toast.id),
        toast.duration ?? 5000,
      );
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div className={`toast toast--${toast.type}`} role="alert">
      <span className="toast__icon" aria-hidden="true">
        {toast.type === 'info' && 'ℹ'}
        {toast.type === 'success' && '✓'}
        {toast.type === 'warning' && '⚠'}
        {toast.type === 'error' && '✕'}
      </span>
      <span className="toast__message">{toast.message}</span>
      <button
        type="button"
        className="toast__dismiss"
        onClick={() => onDismiss(toast.id)}
        aria-label="关闭提示"
      >
        ×
      </button>
    </div>
  );
};
