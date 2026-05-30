import { date, numeric, pgTable, serial, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contributionEntriesTable = pgTable(
  "contribution_entries",
  {
    id: serial("id").primaryKey(),
    contributionDate: date("contribution_date").notNull(),
    employeeAmount: numeric("employee_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    employerAmount: numeric("employer_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("contribution_entries_date_unique").on(t.contributionDate)]
);

export const insertContributionSchema = createInsertSchema(contributionEntriesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertContributionEntry = z.infer<typeof insertContributionSchema>;
export type ContributionEntry = typeof contributionEntriesTable.$inferSelect;
