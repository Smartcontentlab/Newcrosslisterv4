import { pgTable, text, serial, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type ItemPhotoRecord = {
  id: string;
  original: string;
  processed?: string | null;
  active: "original" | "processed";
  processingStatus: "original" | "processing" | "processed" | "failed";
  name?: string;
  createdAt: string;
};

export const itemsTable = pgTable("items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  brand: text("brand"),
  model: text("model"),
  category: text("category"),
  size: text("size"),
  color: text("color"),
  measurements: text("measurements"),
  sku: text("sku"),
  notes: text("notes"),
  sourceLocation: text("source_location"),
  sourceUrl: text("source_url"),
  soldPlatform: text("sold_platform"),
  soldAt: timestamp("sold_at", { withTimezone: true }),
  condition: text("condition").notNull().default("good"),
  status: text("status").notNull().default("draft"),
  price: real("price").notNull().default(0),
  cost: real("cost").notNull().default(0),
  weight: real("weight"),
  photos: text("photos").array().notNull().default([]),
  photoRecords: jsonb("photo_records").$type<ItemPhotoRecord[]>().notNull().default([]),
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
