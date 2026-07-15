import { useGetMonthlyRevenue, getGetMonthlyRevenueQueryKey, useGetTopCategories, getGetTopCategoriesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";

export default function Analytics() {
  const { data: monthlyData } = useGetMonthlyRevenue({
    query: { queryKey: getGetMonthlyRevenueQueryKey() }
  });

  const { data: topCategories } = useGetTopCategories({
    query: { queryKey: getGetTopCategoriesQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Dive deep into your business metrics.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue vs Profit Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue & Profit Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px] w-full">
            {monthlyData ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ fontWeight: 'bold' }}
                  />
                  <Legend iconType="circle" />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--chart-1))" strokeWidth={3} activeDot={{ r: 8 }} />
                  <Line type="monotone" dataKey="profit" name="Profit" stroke="hsl(var(--chart-3))" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full bg-muted/20 animate-pulse rounded-md" />
            )}
          </CardContent>
        </Card>

        {/* Top Categories */}
        <Card>
          <CardHeader>
            <CardTitle>Top Categories by Sales</CardTitle>
          </CardHeader>
          <CardContent>
            {topCategories ? (
              <div className="space-y-6">
                {topCategories.map((cat, i) => {
                  const maxSales = Math.max(...topCategories.map(c => c.totalSales));
                  const width = `${(cat.totalSales / maxSales) * 100}%`;
                  return (
                    <div key={cat.category} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{cat.category}</span>
                        <span className="text-muted-foreground">{formatCurrency(cat.totalRevenue)} ({cat.totalSales} items)</span>
                      </div>
                      <div className="h-2 w-full bg-accent rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[200px] w-full bg-muted/20 animate-pulse rounded-md" />
            )}
          </CardContent>
        </Card>

        {/* Actionable Insights Placeholder */}
        <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <SparklesIcon /> Actionable Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-background/50 backdrop-blur rounded-lg border border-border shadow-sm">
              <h4 className="font-bold mb-1">Sell-through rate is down 4%</h4>
              <p className="text-sm text-muted-foreground mb-3">You have 12 stale items that haven't sold in 30+ days. Consider running a 15% markdown sale.</p>
              <button className="text-sm text-primary font-bold hover:underline">Review Stale Inventory →</button>
            </div>
            <div className="p-4 bg-background/50 backdrop-blur rounded-lg border border-border shadow-sm">
              <h4 className="font-bold mb-1">Sneakers are trending</h4>
              <p className="text-sm text-muted-foreground mb-3">Your 'Footwear' category yields the highest profit margin (42%). Focus sourcing efforts here this week.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SparklesIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
      <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
    </svg>
  )
}
