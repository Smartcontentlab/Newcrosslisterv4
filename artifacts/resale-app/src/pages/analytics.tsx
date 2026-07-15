import { useGetMonthlyRevenue, useGetTopCategories } from '@workspace/api-client-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from 'recharts';

export default function Analytics() {
  const { data: monthlyRevenue, isLoading: revenueLoading } = useGetMonthlyRevenue();
  const { data: topCategories, isLoading: categoriesLoading } = useGetTopCategories();

  if (revenueLoading || categoriesLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 bg-muted/20 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-muted/20 rounded-xl animate-pulse" />
          <div className="h-96 bg-muted/20 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-card-glow p-4 rounded-lg border-primary/50">
          <p className="font-pixel text-xs text-primary mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="font-sans text-sm font-bold" style={{ color: entry.color }}>
              {entry.name}: ${entry.value.toFixed(0)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="font-pixel text-4xl text-secondary text-glow-purple glitch-text mb-2" data-text="Analytics">
          Analytics
        </h1>
        <p className="text-muted-foreground font-sans">Metrics for your empire ★</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="glass-card-glow p-6 rounded-xl">
          <h2 className="font-pixel text-xl text-primary text-glow-pink mb-6 flex items-center gap-2">
            <span>★</span> Revenue vs Profit
          </h2>
          <div className="h-80 w-full" data-testid="chart-revenue">
            {!monthlyRevenue || monthlyRevenue.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground font-sans">
                No revenue data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyRevenue} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis 
                    dataKey="month" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    fontFamily="Nunito" 
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    fontFamily="Nunito"
                    tickFormatter={(value) => `$${value}`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    name="Revenue" 
                    stroke="hsl(var(--neon-pink))" 
                    strokeWidth={3} 
                    dot={{ fill: "hsl(var(--background))", stroke: "hsl(var(--neon-pink))", strokeWidth: 2, r: 4 }} 
                    activeDot={{ r: 6, fill: "hsl(var(--neon-pink))" }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="profit" 
                    name="Profit" 
                    stroke="hsl(var(--neon-mint))" 
                    strokeWidth={3} 
                    dot={{ fill: "hsl(var(--background))", stroke: "hsl(var(--neon-mint))", strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: "hsl(var(--neon-mint))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Categories Chart */}
        <div className="glass-card-glow p-6 rounded-xl">
          <h2 className="font-pixel text-xl text-accent text-glow-mint mb-6 flex items-center gap-2">
            <span>★</span> Top Categories
          </h2>
          <div className="h-80 w-full" data-testid="chart-categories">
            {!topCategories || topCategories.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground font-sans">
                No category data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCategories} margin={{ top: 20, right: 30, left: 20, bottom: 5 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis 
                    type="number" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    fontFamily="Nunito"
                    tickFormatter={(value) => `$${value}`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    dataKey="category" 
                    type="category" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    fontFamily="Nunito"
                    width={100}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="totalRevenue" 
                    name="Revenue" 
                    fill="hsl(var(--neon-purple))" 
                    radius={[0, 4, 4, 0]} 
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
      
      {/* Metrics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {topCategories?.slice(0, 3).map((category, idx) => (
          <div key={category.category} className="glass-card p-6 rounded-xl border border-border/30">
            <div className="flex items-center gap-3 mb-4">
              <span className="font-pixel text-2xl text-primary text-glow-pink opacity-50">#{idx + 1}</span>
              <h3 className="font-sans font-bold text-lg text-foreground">{category.category}</h3>
            </div>
            <div className="space-y-2 text-sm font-sans">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Revenue</span>
                <span className="font-bold text-accent text-glow-mint">${category.totalRevenue.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sales</span>
                <span className="font-bold">{category.totalSales} items</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Price</span>
                <span className="font-bold">${category.avgPrice.toFixed(2)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
