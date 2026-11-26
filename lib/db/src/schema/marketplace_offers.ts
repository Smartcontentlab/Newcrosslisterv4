import { integer, pgTable, real, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { userProfilesTable } from "./user_profiles";

/**
 * Offers and sales the Chrome extension read from the seller's own Poshmark and Depop pages
 * (read only: nothing here answers an offer). One row per offer or sale it saw.
 *
 * kind:   "offer" | "sale"
 * status: "open"      offer still showing on the marketplace
 *         "gone"      offer no longer showing (accepted, declined, countered or expired there)
 *         "dismissed" the seller hid it in the app
 *         "recorded"  sale turned into an order (orderId set)
 *         "unmatched" sale the app could not tie to an item; the seller picks the item
 */
export const marketplaceOffersTable = pgTable("marketplace_offers", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => userProfilesTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id"),
  marketplace: text("marketplace").notNull(),
  kind: text("kind").notNull().default("offer"),
  externalKey: text("external_key").notNull(),
  listingUrl: text("listing_url"),
  listingTitle: text("listing_title"),
  amount: real("amount").notNull().default(0),
  buyer: text("buyer"),
  detail: text("detail"),
  status: text("status").notNull().default("open"),
  orderId: integer("order_id"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MarketplaceOffer = typeof marketplaceOffersTable.$inferSelect;

/** Same table as SQL, so the API can create it on first use (Supabase has no migration runner here). */
export const MARKETPLACE_OFFERS_DDL = `
create table if not exists public.marketplace_offers (
  id serial primary key,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  item_id integer,
  marketplace text not null,
  kind text not null default 'offer',
  external_key text not null,
  listing_url text,
  listing_title text,
  amount real not null default 0,
  buyer text,
  detail text,
  status text not null default 'open',
  order_id integer,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, marketplace, kind, external_key)
);
create index if not exists marketplace_offers_user_status on public.marketplace_offers (user_id, status);
alter table public.marketplace_offers enable row level security;
`;
