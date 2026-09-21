import type { SVGProps } from 'react';

/** Four-point sparkle: the signature accent glyph of the Crosslister design system. */
export function Sparkle({ size = 16, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 1.5c.9 5.6 2.9 8.6 10.5 10.5-7.6 1.9-9.6 4.9-10.5 10.5C11.1 16.9 9.1 13.9 1.5 12 9.1 10.1 11.1 7.1 12 1.5Z" />
    </svg>
  );
}

export function Heart({ size = 16, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 21s-8.5-5.2-8.5-11.1C3.5 6.7 5.9 4.5 8.6 4.5c1.5 0 2.8.7 3.4 1.9.6-1.2 1.9-1.9 3.4-1.9 2.7 0 5.1 2.2 5.1 5.4C20.5 15.8 12 21 12 21Z" />
    </svg>
  );
}
