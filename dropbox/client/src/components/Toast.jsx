import { useEffect } from "react";
import { CheckCircle2, XCircle, Info, AlertCircle, X } from "lucide-react";

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(() => {
      onClose?.();
    }, 3000);

    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  const icons = {
    success: <CheckCircle2 size={17} />,
    error: <XCircle size={17} />,
    info: <Info size={17} />,
    warning: <AlertCircle size={17} />,
  };

  return (
    <div className={`toast toast-${type}`}>
      <div className="toast-icon">
        {icons[type] || icons.info}
      </div>

      <span className="toast-message">{message}</span>

      <button
        className="toast-close"
        onClick={onClose}
        aria-label="Close notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default Toast;