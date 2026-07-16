import { useGetMonthlyRevenue, useGetTopCategories } from '@workspace/api-client-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from 'recharts';

export default function Analytics() {
  const { data: monthlyRevenue, isLoading: revLoad } = useGetMonthlyRevenue();
  const { data: topCategories, isLoading: catLoad } = useGetTopCategories();

  if (revLoad || catLoad) return <div className="h-64 bg-white/5 rounded-xl animate-pulse" />;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-card p-3 rounded-lg border-border/50 shadow-xl bg-black/90">
          <p className="font-pixel text-[10px] text-muted-foreground mb-2 uppercase">{label}</p>
          {payload.map((entry: any, i: number) => (
            <p key={i} className="font-sans text-sm font-bold" style={{ color: entry.color }}>
              {entry.name}: ${entry.value.toFixed(0)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-end justify-between border-b border-border/50 pb-4">
        <div>
          <h1 className="font-pixel text-xl tracking-wide uppercase text-foreground mb-2">Analytics</h1>
          <p className="text-xs font-sans text-muted-foreground uppercase tracking-widest">BUSINESS HEALTH METRICS</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6 rounded-xl border border-border/50">
          <h2 className="font-sans text-sm font-bold text-muted-foreground uppercase tracking-widest mb-6">Revenue vs Profit</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyRevenue} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="month" stroke="#666" fontSize={10} fontFamily="Press Start 2P" tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#666" fontSize={10} fontFamily="'Nunito', sans-serif" tickFormatter={v => `$${v}`} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={3} dot={false} activeDot={{ r: 4, fill: "hsl(var(--primary))" }} />
                <Line type="monotone" dataKey="profit" stroke="hsl(var(--accent))" strokeWidth={3} dot={false} activeDot={{ r: 4, fill: "hsl(var(--accent))" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-6 rounded-xl border border-border/50">
          <h2 className="font-sans text-sm font-bold text-muted-foreground uppercase tracking-widest mb-6">Top Categories</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCategories} layout="vertical" margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" stroke="#666" fontSize={10} fontFamily="'Nunito', sans-serif" tickFormatter={v => `$${v}`} tickLine={false} axisLine={false} />
                <YAxis dataKey="category" type="category" stroke="#666" fontSize={10} fontFamily="Press Start 2P" width={90} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="totalRevenue" name="Revenue" fill="hsl(var(--secondary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
