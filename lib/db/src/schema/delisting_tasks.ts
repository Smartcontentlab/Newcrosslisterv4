import { integer, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { userProfilesTable } from "./user_profiles";

export const delistingTasksTable = pgTable("delisting_tasks", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => userProfilesTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull(),
  orderId: integer("order_id"),
  marketplace: text("marketplace").notNull(),
  marketplaceDraftId: integer("marketplace_draft_id"),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type DelistingTask = typeof delistingTasksTable.$inferSelect;
