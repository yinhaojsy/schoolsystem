interface AlertModalProps {
  isOpen: boolean;
  message: string;
  type?: "error" | "warning" | "info" | "success";
  onClose: () => void;
}

export default function AlertModal({ isOpen, message, type = "error", onClose }: AlertModalProps) {
  if (!isOpen) return null;

  const colors = {
    error: "bg-red-50 border-red-200 text-red-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
    success: "bg-green-50 border-green-200 text-green-800",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className={`rounded-xl border p-6 ${colors[type]} max-w-md w-full mx-4`}>
        <p className="mb-4 text-sm font-medium">{message}</p>
        <button
          onClick={onClose}
          className={`w-full rounded-lg px-4 py-2 text-sm font-semibold ${
            type === "error" 
              ? "bg-red-600 text-white hover:bg-red-700"
              : type === "warning"
              ? "bg-amber-600 text-white hover:bg-amber-700"
              : type === "success"
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-blue-600 text-white hover:bg-blue-700"
          } transition-colors`}
        >
          OK
        </button>
      </div>
    </div>
  );
}
