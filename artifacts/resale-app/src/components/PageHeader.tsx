import type { ReactNode } from 'react';

/** Standard page header: sparkle eyebrow, Fira Sans headline, optional supporting line and actions, closed by a 2px rule. */
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
    <div className="flex flex-col justify-between gap-4 border-b-2 border-border pb-5 md:flex-row md:items-end">
      <div className="min-w-0 space-y-2">
        {label && <p className="cx-eyebrow">✦ {label}</p>}
        <h1 className="cx-display text-[2rem] sm:text-[2.625rem]">{title}</h1>
        {description && <p className="max-w-2xl text-[0.9375rem] leading-[1.35] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
