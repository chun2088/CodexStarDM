export type StatusBadgeProps = {
  status: string;
  label?: string;
};

function resolveClasses(status: string) {
  const normalized = status.toLowerCase();

  switch (normalized) {
    case "approved":
    case "active":
    case "success":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200";
    case "rejected":
    case "inactive":
    case "exhausted":
    case "canceled":
      return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200";
    case "pending":
    case "grace":
    case "warning":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    default:
      return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  }
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const classes = resolveClasses(status);
  const text = label ?? `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {text}
    </span>
  );
}
