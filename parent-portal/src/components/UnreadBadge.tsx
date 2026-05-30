interface UnreadBadgeProps {
  count: number;
  className?: string;
}

export default function UnreadBadge({ count, className = "" }: UnreadBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow ${className}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
