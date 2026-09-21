import { Link } from 'wouter';
import { ArrowUpRight } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const START: Array<{ title: string; body: string; href: string; cta: string }> = [
  { title: 'Add an item once', body: 'Photos, title, condition, what you paid, and one list price. Everything else is optional and can be filled in later.', href: '/listing-studio', cta: 'Open listing studio' },
  { title: 'Generate marketplace drafts', body: 'CrossLinkOS writes Poshmark, Depop and Mercari versions from your one item. Edit anything before you use it.', href: '/listings', cta: 'See the draft board' },
  { title: 'Fill the forms with the extension', body: 'Install the Chrome extension once. Send a draft to it, open the marketplace, and it fills the form for you to review.', href: '/connections', cta: 'Install the extension' },
  { title: 'Record the sale', body: 'When something sells, record it. CrossLinkOS lists which other marketplaces still need the item removed and starts the shipping checklist.', href: '/orders', cta: 'Open orders' },
];

const STATES: Array<{ glyph: string; label: string; meaning: string }> = [
  { glyph: '○', label: 'Needs details', meaning: 'A draft exists but a required field is missing.' },
  { glyph: '✦', label: 'Needs posted', meaning: 'The draft is complete in CrossLinkOS. It has not been created on the marketplace yet.' },
  { glyph: '◇', label: 'Prefilled, review', meaning: 'The extension filled the open form. You still review, upload photos, and save or publish.' },
  { glyph: '●', label: 'Draft saved / Live', meaning: 'You confirmed the marketplace saved it or published it. CrossLinkOS never assumes this for you.' },
  { glyph: '▲', label: 'Needs attention', meaning: 'Something needs your review before this draft can move forward.' },
];

const FAQ: Array<{ q: string; a: string }> = [
  { q: 'Does CrossLinkOS post to marketplaces for me?', a: 'No. It prepares drafts and the extension fills forms in your own browser. You always press save or publish yourself. This keeps your accounts in your hands.' },
  { q: 'Do you store my marketplace passwords?', a: 'Never. You sign in on each marketplace directly. The extension does not read, copy or store passwords, MFA codes or cookies.' },
  { q: 'Why does the extension not detect on a preview link?', a: 'The extension only connects to the production app address. Preview and local addresses are ignored on purpose.' },
  { q: 'Which marketplaces are supported?', a: 'Poshmark, Depop and Mercari are supported through the extension today. eBay and Etsy are planned through their official APIs. Grailed, Facebook Marketplace, Whatnot and Shopify come after.' },
  { q: 'How is profit calculated?', a: 'List price minus estimated marketplace fees, minus shipping you pay, minus what you paid for the item. Fee figures are planning estimates. Check the marketplace for the exact amount at sale time.' },
  { q: 'Can I move my data out?', a: 'Yes. Settings has a one-click CSV export of your whole inventory.' },
  { q: 'What does the AI assistant do with my data?', a: 'The text you send, such as item titles and details, is passed to our AI provider to write descriptions and price ideas. Suggestions are always editable and are never applied automatically.' },
];

const FEES: Array<{ name: string; href: string }> = [
  { name: 'Poshmark fees', href: 'https://support.poshmark.com/s/article/How-does-Poshmark-make-money?language=en_US' },
  { name: 'Depop selling fees', href: 'https://depophelp.zendesk.com/hc/en-gb/articles/360001790747-Selling-fees-and-taxes' },
  { name: 'Mercari fees', href: 'https://www.mercari.com/us/help_center/article/169/' },
];

export default function Help() {
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader label="Help" title="How CrossLinkOS works" description="List once, prepare drafts for each marketplace, and stay in control of every final click." />

      <section aria-label="Quick start" className="border-2 border-border bg-muted p-6">
        <h2 className="text-[0.9375rem] font-extrabold">Quick start</h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-2">
          {START.map((step, index) => (
            <li key={step.title} className="flex gap-3 rounded-none border border-border p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-none bg-muted font-semibold text-xs text-ink-2">{index + 1}</span>
              <div>
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="mt-1 text-sm leading-5 text-ink-2">{step.body}</p>
                <Link href={step.href} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-foreground hover:underline">{step.cta} <ArrowUpRight size={13} /></Link>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Draft status guide" className="border-2 border-border bg-muted px-7 py-6">
        <h2 className="pb-3 text-[0.9375rem] font-extrabold">What the draft states mean</h2>
        {STATES.map((state) => (
          <div key={state.label} className="grid grid-cols-[28px_150px_minmax(0,1fr)] items-baseline gap-x-3 border-t border-border py-3 max-sm:grid-cols-[28px_minmax(0,1fr)]">
            <span className="font-semibold text-foreground" aria-hidden="true">{state.glyph}</span>
            <span className="font-semibold text-xs uppercase tracking-[0.06em]">{state.label}</span>
            <span className="text-sm text-ink-2 max-sm:col-start-2">{state.meaning}</span>
          </div>
        ))}
      </section>

      <section aria-label="Frequently asked questions" className="border-2 border-border bg-muted px-7 py-6">
        <h2 className="pb-2 text-[0.9375rem] font-extrabold">Questions</h2>
        <Accordion type="single" collapsible>
          {FAQ.map((entry, index) => (
            <AccordionItem key={entry.q} value={`q${index}`} className="border-border">
              <AccordionTrigger className="text-left text-[0.9375rem] font-semibold hover:no-underline">{entry.q}</AccordionTrigger>
              <AccordionContent className="text-sm leading-6 text-ink-2">{entry.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="Marketplace fee pages" className="border-2 border-border bg-muted p-6">
          <p className="cx-eyebrow cx-bracket">Fees</p>
          <h2 className="mt-2 text-[0.9375rem] font-extrabold">Check current fees</h2>
          <p className="mt-1 text-sm text-ink-2">Fee estimates in CrossLinkOS are planning aids. Marketplaces change their rules, so confirm the numbers at the source.</p>
          <ul className="mt-3 space-y-1">
            {FEES.map((fee) => (
              <li key={fee.name}><a href={fee.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-foreground hover:underline">{fee.name} <ArrowUpRight size={13} /></a></li>
            ))}
          </ul>
        </section>
        <section aria-label="Feedback" className="border-2 border-border bg-muted p-6">
          <p className="cx-eyebrow cx-bracket">Feedback</p>
          <h2 className="mt-2 text-[0.9375rem] font-extrabold">Something not working?</h2>
          <p className="mt-1 text-sm text-ink-2">Tell us what you were doing and what you expected. Screenshots help a lot.</p>
          <a href="https://github.com/Smartcontentlab/Newcrosslisterv4/issues/new" target="_blank" rel="noreferrer" className="mt-4 inline-flex h-11 items-center gap-2 rounded-none bg-primary border-2 border-foreground hover:bg-accent-hover px-5 text-xs font-extrabold uppercase tracking-[0.05em] text-primary-foreground ">Report an issue <ArrowUpRight size={14} /></a>
        </section>
      </div>
    </div>
  );
}
