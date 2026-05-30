import { NavLink } from "react-router-dom";
import UnreadBadge from "./UnreadBadge";

const tabs = [
  {
    to: "/",
    end: true,
    label: "Home",
    icon: (active: boolean) => (
      <svg className={`h-6 w-6 ${active ? "text-brand-700" : "text-slate-400"}`} fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
        {active ? (
          <path d="M11.47 3.841a1.5 1.5 0 011.06 0l8.69 4.345A1.5 1.5 0 0121 9.345V19.5A1.5 1.5 0 0119.5 21h-5.25a.75.75 0 01-.75-.75v-4.125a1.125 1.125 0 00-1.125-1.125H11.25a1.125 1.125 0 00-1.125 1.125V20.25a.75.75 0 01-.75.75H4.5A1.5 1.5 0 013 19.5V9.345a1.5 1.5 0 01.78-1.159l8.69-4.345z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875a1.125 1.125 0 011.125-1.125h2.25a1.125 1.125 0 011.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
        )}
      </svg>
    ),
    badgeKey: null as null,
  },
  {
    to: "/fees",
    end: false,
    label: "Fees",
    icon: (active: boolean) => (
      <svg className={`h-6 w-6 ${active ? "text-brand-700" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75V5.25A2.25 2.25 0 014.5 3h15a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0119.5 21h-15A2.25 2.25 0 012.25 18.75z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 9h10.5M6.75 12.75h6" />
      </svg>
    ),
    badgeKey: "fees" as const,
  },
  {
    to: "/inbox",
    end: false,
    label: "Inbox",
    icon: (active: boolean) => (
      <svg className={`h-6 w-6 ${active ? "text-brand-700" : "text-slate-400"}`} fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
        {active ? (
          <path d="M9.879 3.375A2.25 2.25 0 0112 2.25h.375c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125H12a1.125 1.125 0 00-1.125 1.125v1.5a1.125 1.125 0 001.125 1.125h.375c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125H12a2.25 2.25 0 01-2.25-2.25v-1.5A1.125 1.125 0 009.375 9H8.25A2.25 2.25 0 016 6.75v-1.5A2.25 2.25 0 018.25 3h1.629zM15.621 3.375A2.25 2.25 0 0118 2.25h.375c1.036 0 1.875.84 1.875 1.875v1.5c0 1.036-.84 1.875-1.875 1.875H18a1.125 1.125 0 00-1.125 1.125v1.5a1.125 1.125 0 001.125 1.125h.375c1.036 0 1.875.84 1.875 1.875v1.5a2.25 2.25 0 01-2.25 2.25h-.375a1.125 1.125 0 00-1.125-1.125v-1.5A1.125 1.125 0 0015.375 15H14.25a2.25 2.25 0 01-2.25-2.25v-1.5c0-1.036.84-1.875 1.875-1.875h.621z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        )}
      </svg>
    ),
    badgeKey: "inbox" as const,
  },
  {
    to: "/account",
    end: false,
    label: "Account",
    icon: (active: boolean) => (
      <svg className={`h-6 w-6 ${active ? "text-brand-700" : "text-slate-400"}`} fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
        {active ? (
          <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        )}
      </svg>
    ),
    badgeKey: null as null,
  },
];

interface BottomNavProps {
  inboxUnread?: number;
  feesUnread?: number;
}

export default function BottomNav({ inboxUnread = 0, feesUnread = 0 }: BottomNavProps) {
  const badges: Record<string, number> = {
    inbox: inboxUnread,
    fees: feesUnread,
  };

  return (
    <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto grid max-w-lg grid-cols-4 px-2 pb-2 pt-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className="relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  {tab.icon(isActive)}
                  {tab.badgeKey && (
                    <UnreadBadge count={badges[tab.badgeKey] ?? 0} className="-right-2 -top-1" />
                  )}
                </span>
                <span className={isActive ? "font-semibold text-brand-700" : ""}>{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
