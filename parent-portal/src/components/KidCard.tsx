import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { ChildCard as ChildCardType } from "../types";

interface ActionButtonProps {
  label: string;
  icon: ReactNode;
  unread?: number;
  onClick?: () => void;
  colorClass?: string;
}

function ActionButton({
  label,
  icon,
  unread = 0,
  onClick,
  colorClass = "bg-white border-slate-200 text-slate-800",
}: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-center shadow-sm transition active:scale-[0.98] ${colorClass}`}
    >
      <span className="relative text-xl">{icon}</span>
      <span className="text-[11px] font-semibold leading-tight">{label}</span>
      {unread > 0 && (
        <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="h-14 w-14 shrink-0 rounded-full border-2 border-white object-cover shadow"
      />
    );
  }
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white bg-brand-100 text-sm font-bold text-brand-800 shadow">
      {initials}
    </div>
  );
}

interface KidCardProps {
  child: ChildCardType;
}

export default function KidCard({ child }: KidCardProps) {
  const navigate = useNavigate();

  return (
    <article className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-800 p-4 text-white shadow-lg">
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={child.name} photoUrl={child.profilePhotoUrl} />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{child.name}</h2>
          <p className="truncate text-sm text-brand-100">
            {child.classGroupName || "Class"} · {child.rollNo}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ActionButton
          label="Kid Diary"
          unread={child.unread.diary}
          onClick={() => navigate(`/children/${child.id}/diary`)}
          colorClass="bg-emerald-50 border-emerald-100 text-emerald-900"
          icon="📔"
        />
        <ActionButton
          label="Teacher Notes"
          unread={child.unread.notices}
          onClick={() => navigate(`/children/${child.id}/notices`)}
          colorClass="bg-amber-50 border-amber-100 text-amber-900"
          icon="💬"
        />
        <ActionButton
          label="Gallery"
          unread={child.unread.gallery}
          onClick={() => navigate(`/children/${child.id}/gallery`)}
          colorClass="bg-sky-50 border-sky-100 text-sky-900"
          icon="🖼️"
        />
        <ActionButton
          label="Invoice"
          unread={child.unread.invoice}
          onClick={() => navigate("/fees")}
          colorClass="bg-violet-50 border-violet-100 text-violet-900"
          icon="🧾"
        />
      </div>
    </article>
  );
}
