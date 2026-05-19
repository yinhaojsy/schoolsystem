import { ReactNode, useState } from "react";

interface SectionCardProps {
  title: string;
  children: ReactNode;
  /** When true, the section can be expanded/collapsed via the header. */
  collapsible?: boolean;
  /** Only used when `collapsible` is true. */
  defaultCollapsed?: boolean;
  subtitle?: string;
}

export default function SectionCard({
  title,
  children,
  collapsible = false,
  defaultCollapsed = false,
  subtitle,
}: SectionCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const titleBlock = (
    <div className="min-w-0 text-left">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={`flex w-full items-center justify-between gap-3 rounded-lg -m-1 p-1 text-left hover:bg-slate-50 transition-colors ${
            collapsed ? "mb-0" : "mb-4"
          }`}
          aria-expanded={!collapsed}
        >
          {titleBlock}
          <span
            className={`shrink-0 text-slate-400 transition-transform ${collapsed ? "" : "rotate-180"}`}
            aria-hidden
          >
            ▼
          </span>
        </button>
      ) : (
        <div className="mb-4">{titleBlock}</div>
      )}
      {!collapsed && children}
    </div>
  );
}
