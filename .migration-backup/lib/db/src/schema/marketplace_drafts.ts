import { integer, jsonb, pgTable, real, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { userProfilesTable } from "./user_profiles";

export type MarketplaceDraftField = {
  key: string;
  label: string;
  required: boolean;
  value?: string | number | boolean | null;
  help?: string;
};

export const marketplaceDraftsTable = pgTable("marketplace_drafts", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => userProfilesTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull(),
  marketplace: text("marketplace").notNull(),
  status: text("status").notNull().default("draft"),
  title: text("title"),
  description: text("description"),
  tags: text("tags").array().notNull().default([]),
  price: real("price").notNull().default(0),
  requiredFields: jsonb("required_fields").$type<MarketplaceDraftField[]>().notNull().default([]),
  missingFields: text("missing_fields").array().notNull().default([]),
  externalListingId: text("external_listing_id"),
  externalUrl: text("external_url"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  soldAt: timestamp("sold_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MarketplaceDraft = typeof marketplaceDraftsTable.$inferSelect;
