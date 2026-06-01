import { date, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pensionEntriesTable = pgTable("pension_entries", {
  id: serial("id").primaryKey(),
  entryDate: date("entry_date").notNull().unique(),
  potValue: numeric("pot_value", { precision: 14, scale: 2 }).notNull(),
  totalContributions: numeric("total_contributions", { precision: 14, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPensionEntrySchema = createInsertSchema(pensionEntriesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertPensionEntry = z.infer<typeof insertPensionEntrySchema>;
export type PensionEntry = typeof pensionEntriesTable.$inferSelect;
