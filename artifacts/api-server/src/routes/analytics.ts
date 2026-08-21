import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, itemsTable, listingsTable, ordersTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetMarketplaceBreakdownResponse,
  GetMonthlyRevenueResponse,
  GetTopCategoriesResponse,
} from "@workspace/api-zod";
import { getAuthenticatedUser } from "../lib/auth";

const router: IRouter = Router();

router.get("/analytics/dashboard", async (_request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id;
  const [allOrders, allItems, allListings] = await Promise.all([
    db.select().from(ordersTable).where(eq(ordersTable.userId, userId)),
    db.select().from(itemsTable).where(eq(itemsTable.userId, userId)),
    db.select().from(listingsTable).where(eq(listingsTable.userId, userId)),
  ]);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const deliveredOrders = allOrders.filter((order) => ["shipped", "delivered"].includes(order.status));
  const totalRevenue = deliveredOrders.reduce((sum, order) => sum + order.salePrice, 0);
  const totalProfit = deliveredOrders.reduce((sum, order) => sum + order.profit, 0);
  const activeItems = allItems.filter((item) => item.status === "active").length;
  const soldItems = allItems.filter((item) => item.status === "sold").length;
  response.json(GetDashboardSummaryResponse.parse({
    totalRevenue,
    totalProfit,
    activeListings: allListings.filter((listing) => listing.status === "active").length,
    totalInventory: allItems.filter((item) => item.status !== "archived").length,
    pendingOrders: allOrders.filter((order) => order.status === "pending").length,
    awaitingShipment: allOrders.filter((order) => order.status === "awaiting_shipment").length,
    soldThisMonth: deliveredOrders.filter((order) => new Date(order.createdAt) >= monthStart).length,
    inventoryValue: allItems.filter((item) => item.status === "active").reduce((sum, item) => sum + item.price, 0),
    avgSalePrice: deliveredOrders.length ? totalRevenue / deliveredOrders.length : 0,
    sellThroughRate: activeItems + soldItems ? soldItems / (activeItems + soldItems) : 0,
  }));
});

router.get("/analytics/marketplaces", async (_request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id;
  const [allOrders, allListings] = await Promise.all([
    db.select().from(ordersTable).where(eq(ordersTable.userId, userId)),
    db.select().from(listingsTable).where(eq(listingsTable.userId, userId)),
  ]);
  const marketplaces = ["ebay", "poshmark", "depop", "mercari", "facebook", "etsy", "grailed", "whatnot", "shopify"];
  response.json(GetMarketplaceBreakdownResponse.parse(marketplaces.map((marketplace) => {
    const orders = allOrders.filter((order) => order.marketplace === marketplace && ["shipped", "delivered"].includes(order.status));
    return { marketplace, totalSales: orders.length, totalRevenue: orders.reduce((sum, order) => sum + order.salePrice, 0), totalProfit: orders.reduce((sum, order) => sum + order.profit, 0), activeListings: allListings.filter((listing) => listing.marketplace === marketplace && listing.status === "active").length };
  })));
});

router.get("/analytics/monthly", async (_request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id;
  const allOrders = await db.select().from(ordersTable).where(eq(ordersTable.userId, userId));
  const monthlyMap = new Map<string, { revenue: number; profit: number; sales: number }>();
  const now = new Date();
  for (let index = 11; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    monthlyMap.set(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, { revenue: 0, profit: 0, sales: 0 });
  }
  for (const order of allOrders) {
    if (!["shipped", "delivered"].includes(order.status)) continue;
    const date = new Date(order.createdAt);
    const bucket = monthlyMap.get(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    if (bucket) { bucket.revenue += order.salePrice; bucket.profit += order.profit; bucket.sales += 1; }
  }
  response.json(GetMonthlyRevenueResponse.parse(Array.from(monthlyMap.entries()).map(([month, data]) => ({ month, ...data }))));
});

router.get("/analytics/top-categories", async (_request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id;
  const [orders, items] = await Promise.all([
    db.select().from(ordersTable).where(eq(ordersTable.userId, userId)),
    db.select().from(itemsTable).where(eq(itemsTable.userId, userId)),
  ]);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const categories = new Map<string, { totalSales: number; totalRevenue: number; totalPrice: number }>();
  for (const order of orders) {
    if (!["shipped", "delivered"].includes(order.status)) continue;
    const category = itemsById.get(order.itemId)?.category ?? "Uncategorized";
    const bucket = categories.get(category) ?? { totalSales: 0, totalRevenue: 0, totalPrice: 0 };
    bucket.totalSales += 1; bucket.totalRevenue += order.salePrice; bucket.totalPrice += order.salePrice;
    categories.set(category, bucket);
  }
  response.json(GetTopCategoriesResponse.parse(Array.from(categories.entries()).map(([category, data]) => ({ category, totalSales: data.totalSales, totalRevenue: data.totalRevenue, avgPrice: data.totalSales ? data.totalPrice / data.totalSales : 0 })).sort((left, right) => right.totalRevenue - left.totalRevenue).slice(0, 10)));
});

export default router;
