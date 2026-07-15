import { Router, type IRouter } from "express";
import { eq, desc, and, type SQL } from "drizzle-orm";
import { db, ordersTable, itemsTable, shippingTasksTable } from "@workspace/db";
import {
  ListOrdersQueryParams,
  CreateOrderBody,
  CreateOrderResponse,
  GetOrderParams,
  GetOrderResponse,
  UpdateOrderParams,
  UpdateOrderBody,
  UpdateOrderResponse,
  ListOrdersResponse,
  ListRecentOrdersResponse,
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

async function enrichOrders(rows: (typeof ordersTable.$inferSelect)[]) {
  if (rows.length === 0) return [];
  const allItems = await db
    .select({ id: itemsTable.id, title: itemsTable.title })
    .from(itemsTable);
  const itemMap = new Map(allItems.map((i) => [i.id, i.title]));
  return rows.map((order) => ({
    ...order,
    itemTitle: itemMap.get(order.itemId) ?? null,
  }));
}

const router: IRouter = Router();

router.get("/orders", async (req, res): Promise<void> => {
  const query = ListOrdersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions: SQL[] = [];
  if (query.data.status) conditions.push(eq(ordersTable.status, query.data.status));
  if (query.data.marketplace) conditions.push(eq(ordersTable.marketplace, query.data.marketplace));

  const rows = await db
    .select()
    .from(ordersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(ordersTable.createdAt));

  const enriched = await enrichOrders(rows);
  res.json(ListOrdersResponse.parse(enriched));
});

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = { ...parsed.data };
  if (data.profit === undefined || data.profit === null) {
    data.profit = data.salePrice - (data.fees ?? 0) - (data.shippingCost ?? 0);
  }

  const [order] = await db.insert(ordersTable).values(data).returning();

  if (order.status === "awaiting_shipment") {
    await db.insert(shippingTasksTable).values({
      orderId: order.id,
      steps: DEFAULT_SHIPPING_STEPS,
    });
  }

  if (order.status === "shipped" || order.status === "delivered") {
    await db
      .update(itemsTable)
      .set({ status: "sold" })
      .where(eq(itemsTable.id, order.itemId));
  }

  const enriched = await enrichOrders([order]);
  res.status(201).json(CreateOrderResponse.parse(enriched[0]));
});

router.get("/orders/recent", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(ordersTable)
    .orderBy(desc(ordersTable.createdAt))
    .limit(10);

  const enriched = await enrichOrders(rows);
  res.json(ListRecentOrdersResponse.parse(enriched));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, params.data.id));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const enriched = await enrichOrders([order]);
  res.json(GetOrderResponse.parse(enriched[0]));
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [order] = await db
    .update(ordersTable)
    .set(parsed.data)
    .where(eq(ordersTable.id, params.data.id))
    .returning();

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (parsed.data.status === "awaiting_shipment") {
    const existing = await db
      .select({ id: shippingTasksTable.id })
      .from(shippingTasksTable)
      .where(eq(shippingTasksTable.orderId, order.id));

    if (existing.length === 0) {
      await db.insert(shippingTasksTable).values({
        orderId: order.id,
        steps: DEFAULT_SHIPPING_STEPS,
      });
    }
  }

  if (parsed.data.status === "shipped" || parsed.data.status === "delivered") {
    await db
      .update(itemsTable)
      .set({ status: "sold" })
      .where(eq(itemsTable.id, order.itemId));
  }

  const enriched = await enrichOrders([order]);
  res.json(UpdateOrderResponse.parse(enriched[0]));
});

export default router;
