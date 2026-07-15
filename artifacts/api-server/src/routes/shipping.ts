import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, shippingTasksTable, ordersTable, itemsTable } from "@workspace/db";
import {
  GetShippingTaskParams,
  GetShippingTaskResponse,
  UpdateShippingTaskParams,
  UpdateShippingTaskBody,
  UpdateShippingTaskResponse,
  ListShippingTasksResponse,
} from "@workspace/api-zod";

async function enrichTask(task: typeof shippingTasksTable.$inferSelect) {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, task.orderId));

  if (!order) {
    return {
      ...task,
      orderMarketplace: null,
      orderBuyerName: null,
      itemTitle: null,
      trackingNumber: null,
    };
  }

  const [item] = await db
    .select({ title: itemsTable.title })
    .from(itemsTable)
    .where(eq(itemsTable.id, order.itemId));

  return {
    ...task,
    orderMarketplace: order.marketplace,
    orderBuyerName: order.buyerName ?? null,
    itemTitle: item?.title ?? null,
    trackingNumber: order.trackingNumber ?? null,
  };
}

const router: IRouter = Router();

router.get("/shipping", async (_req, res): Promise<void> => {
  // Get all orders awaiting shipment
  const pendingOrders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.status, "awaiting_shipment"));

  const orderIds = pendingOrders.map((o) => o.id);
  if (orderIds.length === 0) {
    res.json(ListShippingTasksResponse.parse([]));
    return;
  }

  const tasks = await db.select().from(shippingTasksTable);
  const relevantTasks = tasks.filter((t) => orderIds.includes(t.orderId));

  const allItems = await db
    .select({ id: itemsTable.id, title: itemsTable.title })
    .from(itemsTable);
  const itemMap = new Map(allItems.map((i) => [i.id, i.title]));

  const orderMap = new Map(pendingOrders.map((o) => [o.id, o]));

  const enriched = relevantTasks.map((task) => {
    const order = orderMap.get(task.orderId);
    return {
      ...task,
      orderMarketplace: order?.marketplace ?? null,
      orderBuyerName: order?.buyerName ?? null,
      itemTitle: order ? (itemMap.get(order.itemId) ?? null) : null,
      trackingNumber: order?.trackingNumber ?? null,
    };
  });

  res.json(ListShippingTasksResponse.parse(enriched));
});

router.get("/shipping/:id", async (req, res): Promise<void> => {
  const params = GetShippingTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await db
    .select()
    .from(shippingTasksTable)
    .where(eq(shippingTasksTable.id, params.data.id));

  if (!task) {
    res.status(404).json({ error: "Shipping task not found" });
    return;
  }

  const enriched = await enrichTask(task);
  res.json(GetShippingTaskResponse.parse(enriched));
});

router.patch("/shipping/:id", async (req, res): Promise<void> => {
  const params = UpdateShippingTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateShippingTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(shippingTasksTable)
    .where(eq(shippingTasksTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Shipping task not found" });
    return;
  }

  // Merge updated steps
  const now = new Date().toISOString();
  const updatedSteps = (existing.steps as Array<{ key: string; label: string; completed: boolean; completedAt: string | null }>).map((step) => {
    const patch = parsed.data.steps.find((s) => s.key === step.key);
    if (!patch) return step;
    return {
      ...step,
      completed: patch.completed,
      completedAt: patch.completed && !step.completed ? now : step.completedAt,
    };
  });

  const [task] = await db
    .update(shippingTasksTable)
    .set({ steps: updatedSteps })
    .where(eq(shippingTasksTable.id, params.data.id))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Shipping task not found" });
    return;
  }

  // If all steps completed, mark order as shipped
  const allDone = updatedSteps.every((s) => s.completed);
  if (allDone) {
    await db
      .update(ordersTable)
      .set({ status: "shipped" })
      .where(eq(ordersTable.id, task.orderId));
  }

  const enriched = await enrichTask(task);
  res.json(UpdateShippingTaskResponse.parse(enriched));
});

export default router;
