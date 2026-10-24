import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
export const records = sqliteTable("records", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), data: text("data").notNull(),
  trackingNumber: text("tracking_number"), purchaseKey: text("purchase_key"),
}, (t) => [index("records_kind").on(t.kind), uniqueIndex("records_tracking").on(t.trackingNumber), uniqueIndex("records_purchase").on(t.purchaseKey)]);
export const settings = sqliteTable("settings", { key: text("key").primaryKey(), value: text("value").notNull() });
export const audit = sqliteTable("audit", { id: text("id").primaryKey(), actor: text("actor").notNull(), action: text("action").notNull(), created: text("created").notNull() });
