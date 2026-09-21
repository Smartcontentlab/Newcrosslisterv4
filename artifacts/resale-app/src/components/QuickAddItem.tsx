import { Camera, ChevronRight, Layers3, PackagePlus, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import type { Item } from '@workspace/api-client-react';

interface QuickAddItemProps {
  onItemCreated?: (item: Item) => void;
}

/**
 * The legacy dashboard quick-add form had its own partial data model and save
 * route. It is intentionally replaced by a single entry point into Listing
 * Studio so every item uses the authenticated canonical workflow.
 */
export default function QuickAddItem(_: QuickAddItemProps) {
  return (
    <section className="glass-card rounded-xl border border-border p-6 sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-2xl gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/35 bg-primary/10 text-accent-text">
            <PackagePlus size={23} />
          </div>
          <div>
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.15em] text-accent-text">New inventory</p>
            <h2 className="mt-2 text-xl font-bold text-foreground">Start a complete marketplace-ready listing</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Upload photos, choose a white or textured backdrop, then fill the one canonical form for Poshmark, Depop, and Mercari. Nothing is saved until the full Listing Studio confirms it.</p>
          </div>
        </div>
        <Link href="/listing-studio" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-bold text-background transition hover:brightness-110">
          <Camera size={16} /> Open Listing Studio <ChevronRight size={16} />
        </Link>
      </div>
      <div className="mt-5 grid gap-3 border-t border-border/60 pt-5 sm:grid-cols-3">
        <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Camera size={14} className="mt-0.5 shrink-0 text-success" />Up to eight photos with original/processed preview.</div>
        <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Layers3 size={14} className="mt-0.5 shrink-0 text-success" />Shared plus Poshmark, Depop, and Mercari fields in one record.</div>
        <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-success" />Save, create P/D/M drafts, and track each marketplace honestly.</div>
      </div>
    </section>
  );
}
