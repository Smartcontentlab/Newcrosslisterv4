import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db, itemsTable, ordersTable, shippingTasksTable } from "@workspace/db";
import { enqueueDelistingTasksForSale } from "../lib/marketplace-workflow";
import { getAuthenticatedUser } from "../lib/auth";
import {
  CreateOrderBody,
  CreateOrderResponse,
  GetOrderParams,
  GetOrderResponse,
  ListOrdersQueryParams,
  ListOrdersResponse,
  ListRecentOrdersResponse,
  UpdateOrderBody,
  UpdateOrderParams,
  UpdateOrderResponse,
} from "@workspace/api-zod";

const DEFAULT_SHIPPING_STEPS = [
  { key: "locate", label: "Locate item", completed: false, completedAt: null },
  { key: "verify", label: "Verify condition", completed: false, completedAt: null },
  { key: "package", label: "Package item", completed: false, completedAt: null },
  { key: "print_label", label: "Print shipping label", completed: false, completedAt: null },
  { key: "ship", label: "Ship package", completed: false, completedAt: null },
  { key: "mark_shipped", label: "Mark shipped", completed: false, completedAt: null },
  { key: "tracking_uploaded", label: "Tracking uploaded", completed: false, completedAt: null },
  { key: "buyer_notified", label: "Buyer notified", completed: false, completedAt: null },
];

const router: IRouter = Router();

async function enrichOrders(rows: (typeof ordersTable.$inferSelect)[], userId: string) {
  if (rows.length === 0) return [];
  const items = await db
    .select({ id: itemsTable.id, title: itemsTable.title })
    .from(itemsTable)
    .where(and(eq(itemsTable.userId, userId), inArray(itemsTable.id, [...new Set(rows.map((row) => row.itemId))])));
  const titleByItemId = new Map(items.map((item) => [item.id, item.title]));
  return rows.map((order) => ({ ...order, itemTitle: titleByItemId.get(order.itemId) ?? null }));
}

router.get("/orders", async (request, response): Promise<void> => {
  const query = ListOrdersQueryParams.safeParse(request.query);
  if (!query.success) {
    response.status(400).json({ error: query.error.message });
    return;
  }
  const userId = getAuthenticatedUser(response).id;
  const conditions: SQL[] = [eq(ordersTable.userId, userId)];
  if (query.data.status) conditions.push(eq(ordersTable.status, query.data.status));
  if (query.data.marketplace) conditions.push(eq(ordersTable.marketplace, query.data.marketplace));
  const rows = await db.select().from(ordersTable).where(and(...conditions)).orderBy(desc(ordersTable.createdAt));
  response.json(ListOrdersResponse.parse(await enrichOrders(rows, userId)));
});

router.post("/orders", async (request, response): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = getAuthenticatedUser(response).id;
  const [item] = await db
    .select({ id: itemsTable.id, cost: itemsTable.cost })
    .from(itemsTable)
    .where(and(eq(itemsTable.id, parsed.data.itemId), eq(itemsTable.userId, userId)));
  if (!item) {
    response.status(404).json({ error: "Item not found" });
    return;
  }

  const data = {
    ...parsed.data,
    userId,
    profit: parsed.data.profit ?? parsed.data.salePrice - item.cost - (parsed.data.fees ?? 0) - (parsed.data.shippingCost ?? 0),
  };
  const [order] = await db.insert(ordersTable).values(data).returning();
  if (order.status === "awaiting_shipment") {
    await db.insert(shippingTasksTable).values({ userId, orderId: order.id, steps: DEFAULT_SHIPPING_STEPS });
  }
  await db.update(itemsTable).set({ status: "sold", soldPlatform: order.marketplace, soldAt: new Date() })
    .where(and(eq(itemsTable.id, order.itemId), eq(itemsTable.userId, userId)));
  await enqueueDelistingTasksForSale({ userId, itemId: order.itemId, orderId: order.id, soldMarketplace: order.marketplace });
  response.status(201).json(CreateOrderResponse.parse((await enrichOrders([order], userId))[0]));
});

router.get("/orders/recent", async (_request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id;
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.userId, userId)).orderBy(desc(ordersTable.createdAt)).limit(10);
  response.json(ListRecentOrdersResponse.parse(await enrichOrders(rows, userId)));
});

router.get("/orders/:id", async (request, response): Promise<void> => {
  const params = GetOrderParams.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: params.error.message });
    return;
  }
  const userId = getAuthenticatedUser(response).id;
  const [order] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.userId, userId)));
  if (!order) {
    response.status(404).json({ error: "Order not found" });
    return;
  }
  response.json(GetOrderResponse.parse((await enrichOrders([order], userId))[0]));
});

router.patch("/orders/:id", async (request, response): Promise<void> => {
  const params = UpdateOrderParams.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateOrderBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = getAuthenticatedUser(response).id;
  const [order] = await db.update(ordersTable).set(parsed.data)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.userId, userId))).returning();
  if (!order) {
    response.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status === "awaiting_shipment") {
    const existing = await db.select({ id: shippingTasksTable.id }).from(shippingTasksTable)
      .where(and(eq(shippingTasksTable.orderId, order.id), eq(shippingTasksTable.userId, userId)));
    if (existing.length === 0) await db.insert(shippingTasksTable).values({ userId, orderId: order.id, steps: DEFAULT_SHIPPING_STEPS });
  }
  if (["awaiting_shipment", "shipped", "delivered"].includes(order.status)) {
    await db.update(itemsTable).set({ status: "sold", soldPlatform: order.marketplace, soldAt: new Date() })
      .where(and(eq(itemsTable.id, order.itemId), eq(itemsTable.userId, userId)));
    await enqueueDelistingTasksForSale({ userId, itemId: order.itemId, orderId: order.id, soldMarketplace: order.marketplace });
  }
  response.json(UpdateOrderResponse.parse((await enrichOrders([order], userId))[0]));
});

export default router;
