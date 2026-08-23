import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export type UserSettings = {
  timezone?: string;
  defaultCurrency?: string;
  defaultShippingOrigin?: string;
  notifications?: {
    email?: boolean;
    inApp?: boolean;
  };
};

export const userProfilesTable = pgTable("user_profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  plan: text("plan").notNull().default("free"),
  settings: jsonb("settings").$type<UserSettings>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UserProfile = typeof userProfilesTable.$inferSelect;
