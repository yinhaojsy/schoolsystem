import { useEffect } from "react";
import type { DiarySectionKey } from "../../utils/diarySeenStorage";

const LABELS: Record<DiarySectionKey, string> = {
  drank: "New drink update!",
  ate: "New meal update!",
  slept: "New sleep update!",
  medicine: "Medicine update",
  potty: "Potty update",
  fun: "Had fun today!",
  remarks: "New teacher note",
};

type Props = {
  section: DiarySectionKey | null;
  onDone: () => void;
};

export default function DiaryCelebrationOverlay({ section, onDone }: Props) {
  useEffect(() => {
    if (!section) return;
    const timer = window.setTimeout(onDone, 2800);
    return () => window.clearTimeout(timer);
  }, [section, onDone]);

  if (!section) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/15 px-6"
      aria-live="polite"
      role="status"
    >
      <div className="diary-celebration-pop w-full max-w-xs rounded-3xl bg-white p-5 shadow-2xl">
        <CartoonScene section={section} />
        <p className="mt-3 text-center text-sm font-semibold text-slate-800">{LABELS[section]}</p>
      </div>
    </div>
  );
}

function CartoonScene({ section }: { section: DiarySectionKey }) {
  switch (section) {
    case "drank":
      return <DrankScene />;
    case "ate":
      return <AteScene />;
    case "slept":
      return <SleptScene />;
    case "medicine":
      return <MedicineScene />;
    case "potty":
      return <PottyScene />;
    case "fun":
      return <FunScene />;
    case "remarks":
      return <RemarksScene />;
    default:
      return null;
  }
}

function BabyFace() {
  return (
    <>
      <circle cx="60" cy="42" r="22" fill="#FDE68A" stroke="#F59E0B" strokeWidth="2" />
      <circle cx="52" cy="38" r="2.5" fill="#374151" />
      <circle cx="68" cy="38" r="2.5" fill="#374151" />
      <path d="M54 48 Q60 54 66 48" stroke="#374151" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="46" cy="46" r="4" fill="#FCA5A5" opacity="0.55" />
      <circle cx="74" cy="46" r="4" fill="#FCA5A5" opacity="0.55" />
    </>
  );
}

function DrankScene() {
  return (
    <svg viewBox="0 0 120 90" className="mx-auto h-28 w-full" aria-hidden>
      <BabyFace />
      <g className="diary-bob">
        <rect x="78" y="30" width="16" height="28" rx="6" fill="#E0F2FE" stroke="#38BDF8" strokeWidth="2" />
        <rect x="80" y="24" width="12" height="8" rx="3" fill="#BAE6FD" stroke="#38BDF8" strokeWidth="1.5" />
        <path d="M74 40 Q70 44 74 48" stroke="#F59E0B" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
      <text x="60" y="82" textAnchor="middle" fontSize="10" fill="#64748B">
        glug glug
      </text>
    </svg>
  );
}

function AteScene() {
  return (
    <svg viewBox="0 0 120 90" className="mx-auto h-28 w-full" aria-hidden>
      <BabyFace />
      <g className="diary-bob">
        <ellipse cx="82" cy="52" rx="14" ry="6" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2" />
        <path d="M76 48 L88 48" stroke="#D97706" strokeWidth="2" />
        <path d="M90 44 L98 36" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function SleptScene() {
  return (
    <svg viewBox="0 0 120 90" className="mx-auto h-28 w-full" aria-hidden>
      <circle cx="95" cy="18" r="10" fill="#FEF9C3" stroke="#FACC15" strokeWidth="1.5" />
      <text x="95" y="22" textAnchor="middle" fontSize="10" fill="#CA8A04">
        z
      </text>
      <g className="diary-sway">
        <ellipse cx="60" cy="58" rx="26" ry="14" fill="#E0E7FF" stroke="#818CF8" strokeWidth="2" />
        <circle cx="60" cy="42" r="18" fill="#FDE68A" stroke="#F59E0B" strokeWidth="2" />
        <path d="M52 40 Q60 36 68 40" stroke="#374151" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M54 46 Q60 48 66 46" stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function MedicineScene() {
  return (
    <svg viewBox="0 0 120 90" className="mx-auto h-28 w-full" aria-hidden>
      <BabyFace />
      <g className="diary-bob">
        <rect x="78" y="34" width="10" height="18" rx="3" fill="#CCFBF1" stroke="#14B8A6" strokeWidth="2" />
        <path d="M88 42 L100 34" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
        <circle cx="101" cy="33" r="3" fill="#E2E8F0" stroke="#94A3B8" />
      </g>
    </svg>
  );
}

function PottyScene() {
  return (
    <svg viewBox="0 0 120 90" className="mx-auto h-28 w-full" aria-hidden>
      <g className="diary-sway">
        <path
          d="M42 68 L42 58 Q42 50 50 50 L70 50 Q78 50 78 58 L78 68 Z"
          fill="#FBCFE8"
          stroke="#F472B6"
          strokeWidth="2"
        />
        <circle cx="60" cy="38" r="16" fill="#FDE68A" stroke="#F59E0B" strokeWidth="2" />
        <circle cx="54" cy="36" r="2" fill="#374151" />
        <circle cx="66" cy="36" r="2" fill="#374151" />
        <path d="M56 42 Q60 45 64 42" stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function FunScene() {
  return (
    <svg viewBox="0 0 120 90" className="mx-auto h-28 w-full" aria-hidden>
      <circle className="diary-float" cx="24" cy="24" r="8" fill="#FCA5A5" />
      <circle className="diary-float-delay" cx="96" cy="20" r="7" fill="#93C5FD" />
      <circle className="diary-float" cx="88" cy="34" r="6" fill="#FDE68A" />
      <BabyFace />
      <path d="M48 58 Q60 48 72 58" stroke="#F59E0B" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function RemarksScene() {
  return (
    <svg viewBox="0 0 120 90" className="mx-auto h-28 w-full" aria-hidden>
      <BabyFace />
      <g className="diary-bob">
        <rect x="78" y="28" width="28" height="20" rx="6" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="2" />
        <path d="M84 78 L84 36" stroke="#94A3B8" strokeWidth="0" />
        <path d="M82 36 L78 42 L86 42 Z" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="1.5" />
        <path d="M84 36 L84 42" stroke="#94A3B8" strokeWidth="1.5" />
        <path d="M84 36 L90 42 L78 42" fill="#F1F5F9" />
      </g>
    </svg>
  );
}
