import type { ReactNode } from 'react';

/** Standard page header: sparkle eyebrow, Fira Sans headline (with an optional sticker beside it), optional supporting line and actions, closed by a 2px rule. */
export function PageHeader({
  label,
  title,
  badge,
  description,
  actions,
}: {
  label?: string;
  title: string;
  /** Short text shown as the screen's one rotated sticker, beside the headline. */
  badge?: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 border-b-2 border-border pb-5 md:flex-row md:items-end">
      <div className="min-w-0 space-y-2">
        {label && <p className="cx-eyebrow"><span aria-hidden="true">✦ </span>{label}</p>}
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="cx-display text-[2rem] sm:text-[2.625rem]">{title}</h1>
          {badge && <span className="sticker">{badge}</span>}
        </div>
        {description && <p className="max-w-2xl text-[0.9375rem] leading-[1.35] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
