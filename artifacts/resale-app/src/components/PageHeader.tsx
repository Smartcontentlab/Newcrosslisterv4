import type { ReactNode } from 'react';

/** Standard page header: mono label, display title, optional supporting line and actions. */
export function PageHeader({
  label,
  title,
  description,
  actions,
}: {
  label?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div className="min-w-0 space-y-2">
        {label && <p className="cx-eyebrow">{label}</p>}
        <h1 className="font-display text-[2rem] font-bold leading-[1.05] sm:text-[2.5rem]">{title}</h1>
        {description && <p className="max-w-2xl text-sm leading-6 text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
