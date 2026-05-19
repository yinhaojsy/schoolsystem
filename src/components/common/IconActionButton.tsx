import type { ReactNode, ButtonHTMLAttributes } from "react";

type IconActionButtonProps = {
  label: string;
  icon: ReactNode;
  loading?: boolean;
  className?: string;
} & Pick<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "disabled" | "type">;

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 animate-spin ${className ?? ""}`}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export default function IconActionButton({
  label,
  icon,
  loading = false,
  className = "",
  disabled,
  onClick,
  type = "button",
}: IconActionButtonProps) {
  const tooltip = loading ? `${label}…` : label;

  return (
    <button
      type={type}
      title={tooltip}
      aria-label={label}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${className}`}
    >
      {loading ? <LoadingSpinner /> : icon}
    </button>
  );
}
