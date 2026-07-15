import { Router, type IRouter } from "express";
import { eq, and, gte, count, sum, avg } from "drizzle-orm";
import { db, ordersTable, itemsTable, listingsTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetMarketplaceBreakdownResponse,
  GetMonthlyRevenueResponse,
  GetTopCategoriesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/analytics/dashboard", async (_req, res): Promise<void> => {
  const [allOrders, allItems, allListings] = await Promise.all([
    db.select().from(ordersTable),
    db.select().from(itemsTable),
    db.select().from(listingsTable),
  ]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const deliveredOrders = allOrders.filter((o) =>
    ["shipped", "delivered"].includes(o.status)
  );
  const totalRevenue = deliveredOrders.reduce((s, o) => s + o.salePrice, 0);
  const totalProfit = deliveredOrders.reduce((s, o) => s + o.profit, 0);
  const activeListings = allListings.filter((l) => l.status === "active").length;
  const totalInventory = allItems.filter((i) => i.status !== "archived").length;
  const pendingOrders = allOrders.filter((o) => o.status === "pending").length;
  const awaitingShipment = allOrders.filter((o) => o.status === "awaiting_shipment").length;
  const soldThisMonth = deliveredOrders.filter(
    (o) => new Date(o.createdAt) >= monthStart
  ).length;
  const inventoryValue = allItems
    .filter((i) => i.status === "active")
    .reduce((s, i) => s + i.price, 0);
  const avgSalePrice =
    deliveredOrders.length > 0
      ? totalRevenue / deliveredOrders.length
      : 0;
  const activeItems = allItems.filter((i) => i.status === "active").length;
  const soldItems = allItems.filter((i) => i.status === "sold").length;
  const sellThroughRate =
    activeItems + soldItems > 0
      ? soldItems / (activeItems + soldItems)
      : 0;

  res.json(
    GetDashboardSummaryResponse.parse({
      totalRevenue,
      totalProfit,
      activeListings,
      totalInventory,
      pendingOrders,
      awaitingShipment,
      soldThisMonth,
      inventoryValue,
      avgSalePrice,
      sellThroughRate,
    })
  );
});

router.get("/analytics/marketplaces", async (_req, res): Promise<void> => {
  const [allOrders, allListings] = await Promise.all([
    db.select().from(ordersTable),
    db.select().from(listingsTable),
  ]);

  const marketplaces = [
    "ebay", "poshmark", "depop", "mercari", "facebook",
    "etsy", "grailed", "whatnot", "shopify",
  ];

  const stats = marketplaces.map((marketplace) => {
    const orders = allOrders.filter(
      (o) =>
        o.marketplace === marketplace &&
        ["shipped", "delivered"].includes(o.status)
    );
    const activeListings = allListings.filter(
      (l) => l.marketplace === marketplace && l.status === "active"
    ).length;

    return {
      marketplace,
      totalSales: orders.length,
      totalRevenue: orders.reduce((s, o) => s + o.salePrice, 0),
      totalProfit: orders.reduce((s, o) => s + o.profit, 0),
      activeListings,
    };
  });

  res.json(GetMarketplaceBreakdownResponse.parse(stats));
});

router.get("/analytics/monthly", async (_req, res): Promise<void> => {
  const allOrders = await db.select().from(ordersTable);

  const monthlyMap = new Map<string, { revenue: number; profit: number; sales: number }>();

  // Generate last 12 months
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, { revenue: 0, profit: 0, sales: 0 });
  }

  for (const order of allOrders) {
    if (!["shipped", "delivered"].includes(order.status)) continue;
    const d = new Date(order.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthlyMap.has(key)) {
      const m = monthlyMap.get(key)!;
      m.revenue += order.salePrice;
      m.profit += order.profit;
      m.sales += 1;
    }
  }

  const result = Array.from(monthlyMap.entries()).map(([month, data]) => ({
    month,
    ...data,
  }));

  res.json(GetMonthlyRevenueResponse.parse(result));
});

router.get("/analytics/top-categories", async (_req, res): Promise<void> => {
  const [allOrders, allItems] = await Promise.all([
    db.select().from(ordersTable),
    db.select().from(itemsTable),
  ]);

  const itemMap = new Map(allItems.map((i) => [i.id, i]));
  const categoryMap = new Map<
    string,
    { totalSales: number; totalRevenue: number; totalPrice: number }
  >();

  for (const order of allOrders) {
    if (!["shipped", "delivered"].includes(order.status)) continue;
    const item = itemMap.get(order.itemId);
    const category = item?.category ?? "Uncategorized";
    if (!categoryMap.has(category)) {
      categoryMap.set(category, { totalSales: 0, totalRevenue: 0, totalPrice: 0 });
    }
    const c = categoryMap.get(category)!;
    c.totalSales += 1;
    c.totalRevenue += order.salePrice;
    c.totalPrice += order.salePrice;
  }

  const result = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      totalSales: data.totalSales,
      totalRevenue: data.totalRevenue,
      avgPrice: data.totalSales > 0 ? data.totalPrice / data.totalSales : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 10);

  res.json(GetTopCategoriesResponse.parse(result));
});

export default router;
