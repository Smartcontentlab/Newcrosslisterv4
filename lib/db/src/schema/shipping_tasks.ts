import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shippingTasksTable = pgTable("shipping_tasks", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  steps: jsonb("steps").notNull().$type<Array<{
    key: string;
    label: string;
    completed: boolean;
    completedAt: string | null;
  }>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertShippingTaskSchema = createInsertSchema(shippingTasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShippingTask = z.infer<typeof insertShippingTaskSchema>;
export type ShippingTask = typeof shippingTasksTable.$inferSelect;
