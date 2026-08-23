import { integer, pgTable, real, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userProfilesTable } from "./user_profiles";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => userProfilesTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull(),
  listingId: integer("listing_id"),
  marketplace: text("marketplace").notNull(),
  buyerName: text("buyer_name"),
  salePrice: real("sale_price").notNull().default(0),
  fees: real("fees").notNull().default(0),
  shippingCost: real("shipping_cost").notNull().default(0),
  profit: real("profit").notNull().default(0),
  status: text("status").notNull().default("pending"),
  trackingNumber: text("tracking_number"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
