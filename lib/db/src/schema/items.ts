import { pgTable, text, serial, timestamp, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const itemsTable = pgTable("items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  brand: text("brand"),
  model: text("model"),
  category: text("category"),
  condition: text("condition").notNull().default("good"),
  status: text("status").notNull().default("draft"),
  price: real("price").notNull().default(0),
  cost: real("cost").notNull().default(0),
  weight: real("weight"),
  photos: text("photos").array().notNull().default([]),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertItemSchema = createInsertSchema(itemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof itemsTable.$inferSelect;
