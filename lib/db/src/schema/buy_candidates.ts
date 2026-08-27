import { jsonb, pgTable, real, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userProfilesTable } from "./user_profiles";

export type BuyCandidateComp = {
  title: string;
  price: number;
  soldAt: string;
  source: string;
};

export const buyCandidatesTable = pgTable("buy_candidates", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => userProfilesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  brand: text("brand"),
  category: text("category"),
  purchaseCost: real("purchase_cost").notNull(),
  recommendation: text("recommendation").notNull(),
  rationale: text("rationale").notNull(),
  estimatedSalePrice: real("estimated_sale_price").notNull(),
  estimatedFees: real("estimated_fees").notNull(),
  projectedProfit: real("projected_profit").notNull(),
  confidence: text("confidence").notNull(),
  comps: jsonb("comps").$type<BuyCandidateComp[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBuyCandidateSchema = createInsertSchema(buyCandidatesTable).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBuyCandidate = z.infer<typeof insertBuyCandidateSchema>;
export type BuyCandidate = typeof buyCandidatesTable.$inferSelect;