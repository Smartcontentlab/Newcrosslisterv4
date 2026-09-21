import {
  useGetDashboardSummary,
  useGetMarketplaceBreakdown,
  useGetMonthlyRevenue,
  useGetTopCategories,
} from '@workspace/api-client-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/PageHeader';

const money = (value: number | undefined, digits = 0) =>
  `$${(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

const AXIS = { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fill: 'hsl(var(--muted-foreground))' } as const;

type TooltipEntry = { name?: string; value?: number; color?: string };
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <p className="cx-eyebrow mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="font-mono text-xs tabular-nums" style={{ color: entry.color }}>
          {entry.name}: {money(entry.value)}
        </p>
      ))}
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-5">
      <p className="cx-eyebrow">{label}</p>
      <p className="font-mono text-[2rem] font-medium leading-none tabular-nums">{value}</p>
      {note && <p className="font-mono text-xs text-ink-2">{note}</p>}
    </div>
  );
}

export default function Analytics() {
  const { data: summary, isLoading: sumLoad } = useGetDashboardSummary();
  const { data: monthly, isLoading: revLoad } = useGetMonthlyRevenue();
  const { data: categories, isLoading: catLoad } = useGetTopCategories();
  const { data: markets } = useGetMarketplaceBreakdown();

  if (sumLoad || revLoad || catLoad) {
    return <div className="h-64 animate-pulse rounded-[20px] bg-muted" aria-busy="true" />;
  }

  const empty = !monthly?.length && !categories?.length;
  const maxMarket = Math.max(1, ...(markets ?? []).map((m) => m.totalRevenue));

  return (
    <div className="space-y-6">
      <PageHeader label="Business health" title="Analytics" description="Revenue, profit and where your sales come from. Figures update as you record sales." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Lifetime revenue" value={money(summary?.totalRevenue)} />
        <Tile label="Lifetime profit" value={money(summary?.totalProfit)} note="after fees and shipping" />
        <Tile label="Avg sale price" value={money(summary?.avgSalePrice, 2)} />
        <Tile label="Sell-through" value={`${Math.round((summary?.sellThroughRate ?? 0) * 100)}%`} note="sold vs. listed" />
      </div>

      {empty ? (
        <div className="dot-grid rounded-[20px] border border-dashed border-input bg-card p-12 text-center">
          <p className="font-display text-xl font-bold">Nothing to chart yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">Record your first sale on the Orders page and your revenue, profit and category charts will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-[20px] border border-border bg-card p-6" aria-label="Revenue versus profit">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-xl font-bold">Revenue vs profit</h2>
              <span className="flex items-center gap-3 font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-ink-2">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Revenue</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-foreground" />Profit</span>
              </span>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthly} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} dy={8} />
                  <YAxis tick={AXIS} tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="profit" name="Profit" stroke="hsl(var(--foreground))" strokeWidth={2.5} strokeDasharray="0" dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-[20px] border border-border bg-card p-6" aria-label="Top categories">
            <h2 className="mb-4 font-display text-xl font-bold">Top categories</h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categories} layout="vertical" margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={AXIS} tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false} />
                  <YAxis dataKey="category" type="category" tick={AXIS} width={96} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
                  <Bar dataKey="totalRevenue" name="Revenue" fill="hsl(var(--primary))" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}

      {(markets?.length ?? 0) > 0 && (
        <section className="rounded-[20px] border border-border bg-card px-7 py-6" aria-label="Sales by marketplace">
          <h2 className="pb-3 font-display text-xl font-bold">Sales by marketplace</h2>
          {markets!.map((m) => (
            <div key={m.marketplace} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-x-4 border-t border-border py-3">
              <span className="text-[0.9375rem] font-medium capitalize">{m.marketplace}</span>
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${money(m.totalRevenue)} revenue`}>
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (m.totalRevenue / maxMarket) * 100)}%` }} />
              </div>
              <span className="w-32 text-right font-mono text-xs tabular-nums text-ink-2">{money(m.totalRevenue)} · {m.totalSales} sold</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
