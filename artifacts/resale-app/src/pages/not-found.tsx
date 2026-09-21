import { Link } from 'wouter';
import { Sparkle } from '@/components/ui/sparkle';

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <div className="dot-grid corner-ticks w-full max-w-md rounded-[20px] border border-border bg-card px-8 py-12 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent-tint text-accent-text"><Sparkle size={20} /></span>
        <p className="cx-eyebrow cx-bracket mt-6">Error 404</p>
        <h1 className="mt-3 font-display text-3xl font-bold">Page not found</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-ink-2">That page does not exist or has moved. Head back to your overview to keep going.</p>
        <Link href="/" data-testid="button-home" className="mt-7 inline-flex h-11 items-center rounded-full bg-foreground px-6 text-sm font-medium text-background hover:bg-foreground/85">Back to overview</Link>
      </div>
    </main>
  );
}
