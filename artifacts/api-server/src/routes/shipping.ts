import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, itemsTable, ordersTable, shippingTasksTable } from "@workspace/db";
import {
  GetShippingTaskParams,
  GetShippingTaskResponse,
  ListShippingTasksResponse,
  UpdateShippingTaskBody,
  UpdateShippingTaskParams,
  UpdateShippingTaskResponse,
} from "@workspace/api-zod";
import { getAuthenticatedUser } from "../lib/auth";

const router: IRouter = Router();

async function enrichTask(task: typeof shippingTasksTable.$inferSelect, userId: string) {
  const [order] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, task.orderId), eq(ordersTable.userId, userId)));
  if (!order) return { ...task, orderMarketplace: null, orderBuyerName: null, itemTitle: null, trackingNumber: null };
  const [item] = await db.select({ title: itemsTable.title }).from(itemsTable).where(and(eq(itemsTable.id, order.itemId), eq(itemsTable.userId, userId)));
  return { ...task, orderMarketplace: order.marketplace, orderBuyerName: order.buyerName ?? null, itemTitle: item?.title ?? null, trackingNumber: order.trackingNumber ?? null };
}

router.get("/shipping", async (_request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id;
  const pendingOrders = await db.select().from(ordersTable).where(and(eq(ordersTable.userId, userId), eq(ordersTable.status, "awaiting_shipment")));
  if (pendingOrders.length === 0) {
    response.json(ListShippingTasksResponse.parse([]));
    return;
  }
  const orderIds = pendingOrders.map((order) => order.id);
  const [tasks, items] = await Promise.all([
    db.select().from(shippingTasksTable).where(and(eq(shippingTasksTable.userId, userId), inArray(shippingTasksTable.orderId, orderIds))),
    db.select({ id: itemsTable.id, title: itemsTable.title }).from(itemsTable).where(eq(itemsTable.userId, userId)),
  ]);
  const ordersById = new Map(pendingOrders.map((order) => [order.id, order]));
  const titlesById = new Map(items.map((item) => [item.id, item.title]));
  response.json(ListShippingTasksResponse.parse(tasks.map((task) => {
    const order = ordersById.get(task.orderId);
    return { ...task, orderMarketplace: order?.marketplace ?? null, orderBuyerName: order?.buyerName ?? null, itemTitle: order ? titlesById.get(order.itemId) ?? null : null, trackingNumber: order?.trackingNumber ?? null };
  })));
});

router.get("/shipping/:id", async (request, response): Promise<void> => {
  const params = GetShippingTaskParams.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: params.error.message });
    return;
  }
  const userId = getAuthenticatedUser(response).id;
  const [task] = await db.select().from(shippingTasksTable).where(and(eq(shippingTasksTable.id, params.data.id), eq(shippingTasksTable.userId, userId)));
  if (!task) {
    response.status(404).json({ error: "Shipping task not found" });
    return;
  }
  response.json(GetShippingTaskResponse.parse(await enrichTask(task, userId)));
});

router.patch("/shipping/:id", async (request, response): Promise<void> => {
  const params = UpdateShippingTaskParams.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateShippingTaskBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = getAuthenticatedUser(response).id;
  const [existing] = await db.select().from(shippingTasksTable).where(and(eq(shippingTasksTable.id, params.data.id), eq(shippingTasksTable.userId, userId)));
  if (!existing) {
    response.status(404).json({ error: "Shipping task not found" });
    return;
  }

  const now = new Date().toISOString();
  const updatedSteps = (existing.steps as Array<{ key: string; label: string; completed: boolean; completedAt: string | null }>).map((step) => {
    const patch = parsed.data.steps.find((candidate) => candidate.key === step.key);
    return patch ? { ...step, completed: patch.completed, completedAt: patch.completed && !step.completed ? now : step.completedAt } : step;
  });
  const [task] = await db.update(shippingTasksTable).set({ steps: updatedSteps }).where(and(eq(shippingTasksTable.id, params.data.id), eq(shippingTasksTable.userId, userId))).returning();
  if (!task) {
    response.status(404).json({ error: "Shipping task not found" });
    return;
  }
  if (updatedSteps.every((step) => step.completed)) {
    await db.update(ordersTable).set({ status: "shipped" }).where(and(eq(ordersTable.id, task.orderId), eq(ordersTable.userId, userId)));
  }
  response.json(UpdateShippingTaskResponse.parse(await enrichTask(task, userId)));
});

export default router;
