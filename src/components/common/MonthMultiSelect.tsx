import { useEffect, useRef, useState } from "react";

type MonthMultiSelectProps = {
  months: readonly string[];
  selected: string[];
  onChange: (months: string[]) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
};

export default function MonthMultiSelect({
  months,
  selected,
  onChange,
  placeholder = "Select months",
  className = "",
  required,
}: MonthMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const toggleMonth = (month: string) => {
    if (selected.includes(month)) {
      onChange(selected.filter((m) => m !== month));
    } else {
      onChange([...selected, month]);
    }
  };

  const triggerLabel =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : selected.length <= 3
          ? selected.join(", ")
          : `${selected.length} months selected`;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`w-full rounded-lg border px-3 py-2 text-sm text-left focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 flex items-center justify-between gap-2 ${
          selected.length === 0 ? "border-slate-300 text-slate-500" : "border-slate-300 text-slate-900"
        }`}
      >
        <span className="truncate">{triggerLabel}</span>
        <svg
          className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {required && selected.length === 0 && (
        <input
          tabIndex={-1}
          className="absolute opacity-0 h-0 w-0 pointer-events-none"
          value=""
          required
          onChange={() => {}}
          aria-hidden
        />
      )}
      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute z-30 mt-1 w-full min-w-[12rem] rounded-lg border border-slate-200 bg-white shadow-lg max-h-56 overflow-y-auto py-1"
        >
          {months.map((month) => {
            const checked = selected.includes(month);
            return (
              <label
                key={month}
                role="option"
                aria-selected={checked}
                className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 select-none"
              >
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={checked}
                  onChange={() => toggleMonth(month)}
                />
                <span className={checked ? "font-medium text-slate-900" : "text-slate-700"}>{month}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
