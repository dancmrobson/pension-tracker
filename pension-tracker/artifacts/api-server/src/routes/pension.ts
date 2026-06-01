import { Router } from "express";
import { asc, eq, lte, sql } from "drizzle-orm";
import { db, pensionEntriesTable, contributionEntriesTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const pensionRouter = Router();

function serializeEntry(e: typeof pensionEntriesTable.$inferSelect) {
  return {
    id: e.id,
    entry_date: e.entryDate,
    pot_value: e.potValue,
    total_contributions: e.totalContributions ?? null,
    notes: e.notes ?? null,
    created_at: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
  };
}

function serializeContribution(e: typeof contributionEntriesTable.$inferSelect) {
  return {
    id: e.id,
    contribution_date: e.contributionDate,
    employee_amount: e.employeeAmount,
    employer_amount: e.employerAmount,
    created_at: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
  };
}

// Simple CSV line parser that handles quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Parse "£146.76" or "-£2.64" or "£1,234.56" → number
function parseAmount(s: string): number {
  const cleaned = s.replace(/[£,\s]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// Parse "DD/MM/YYYY" → "YYYY-MM-DD"
function parseDateDMY(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

pensionRouter.get("/pension/entries", async (req, res) => {
  try {
    const entries = await db
      .select()
      .from(pensionEntriesTable)
      .orderBy(asc(pensionEntriesTable.entryDate));
    res.json(entries.map(serializeEntry));
  } catch (err) {
    req.log.error({ err }, "Failed to list pension entries");
    res.status(500).json({ error: "Failed to list entries" });
  }
});

pensionRouter.post("/pension/entries/analyze", async (req, res) => {
  try {
    const { image_base64 } = req.body as { image_base64?: string };
    if (!image_base64) {
      res.status(400).json({ error: "image_base64 is required" });
      return;
    }

    const dataUrl = image_base64.startsWith("data:")
      ? image_base64
      : `data:image/jpeg;base64,${image_base64}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "high" },
            },
            {
              type: "text",
              text: `Analyze this pension or retirement savings screenshot. Extract:
1. Pension pot value — the total current value (labeled "Your pension pot value", "Total value", "Current value", "Pension value", etc.)
2. The date the value was calculated (labeled "Value calculated on", "As of", "Updated", "Date", etc.)
3. Total contributions (labeled "Total contributions", "Total paid in", "Contributions to date", etc.) — if visible
4. The user's first name — look for any greeting such as "Hello [Name]", "Hi [Name]", "Welcome [Name]", "Good morning [Name]", etc. Extract only the first name, not a full sentence.

Reply ONLY with a JSON object (no markdown, no extra text):
{"pot_value": <number or null>, "entry_date": "<YYYY-MM-DD string or null>", "total_contributions": <number or null>, "user_name": "<first name string or null>", "confidence": "<high|medium|low>", "message": "<one sentence describing what was found>"}`,
            },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text.trim());
    } catch {
      parsed = {
        pot_value: null,
        entry_date: null,
        total_contributions: null,
        confidence: "low",
        message: "Could not extract pension data from this image",
      };
    }

    res.json(parsed);
  } catch (err) {
    req.log.error({ err }, "Failed to analyze pension image");
    res.status(500).json({ error: "Failed to analyze image" });
  }
});

pensionRouter.post("/pension/entries", async (req, res) => {
  try {
    const { entry_date, pot_value, total_contributions, notes } = req.body as {
      entry_date: string;
      pot_value: string;
      total_contributions?: string | null;
      notes?: string | null;
    };

    if (!entry_date || !pot_value) {
      res.status(400).json({ error: "entry_date and pot_value are required" });
      return;
    }

    const [entry] = await db
      .insert(pensionEntriesTable)
      .values({
        entryDate: entry_date,
        potValue: String(pot_value),
        totalContributions: total_contributions ? String(total_contributions) : null,
        notes: notes ?? null,
      })
      .onConflictDoUpdate({
        target: pensionEntriesTable.entryDate,
        set: {
          potValue: sql`EXCLUDED.pot_value`,
          totalContributions: sql`EXCLUDED.total_contributions`,
          notes: sql`EXCLUDED.notes`,
        },
      })
      .returning();

    res.status(201).json(serializeEntry(entry));
  } catch (err) {
    req.log.error({ err }, "Failed to create pension entry");
    res.status(500).json({ error: "Failed to create entry" });
  }
});

pensionRouter.delete("/pension/entries/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db.delete(pensionEntriesTable).where(eq(pensionEntriesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete pension entry");
    res.status(500).json({ error: "Failed to delete entry" });
  }
});

pensionRouter.get("/pension/insights", async (req, res) => {
  try {
    const entries = await db
      .select()
      .from(pensionEntriesTable)
      .orderBy(asc(pensionEntriesTable.entryDate));

    if (entries.length === 0) {
      res.json({
        has_data: false,
        summary: "No data yet. Upload your first pension screenshot to get started.",
        total_growth_pct: null,
        annualized_return_pct: null,
        insights: [],
      });
      return;
    }

    const values = entries.map((e) => parseFloat(e.potValue));
    const first = values[0];
    const last = values[values.length - 1];
    const totalGrowthPct = ((last - first) / first) * 100;

    const firstDate = new Date(entries[0].entryDate);
    const lastDate = new Date(entries[entries.length - 1].entryDate);
    const years =
      (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    const annualizedReturn =
      years > 0.01 ? (Math.pow(last / first, 1 / years) - 1) * 100 : null;

    let insights: string[] = [];

    if (entries.length >= 2) {
      try {
        const recentEntries = entries.slice(-24);
        const dataDesc = recentEntries
          .map(
            (e) =>
              `${e.entryDate}: £${parseFloat(e.potValue).toLocaleString("en-GB", {
                minimumFractionDigits: 2,
              })}`,
          )
          .join("\n");

        const insightResp = await openai.chat.completions.create({
          model: "gpt-5.4",
          max_completion_tokens: 400,
          messages: [
            {
              role: "user",
              content: `You are a pension advisor. Analyze this pension pot performance data and provide 3 concise, practical insights (1-2 sentences each) about growth trends, performance, and actionable advice:

${dataDesc}

Reply ONLY with a JSON array of exactly 3 strings (no markdown):
["insight 1", "insight 2", "insight 3"]`,
            },
          ],
        });

        const insightText = insightResp.choices[0]?.message?.content ?? "[]";
        const parsed = JSON.parse(insightText.trim());
        if (Array.isArray(parsed)) {
          insights = parsed.slice(0, 3).map(String);
        }
      } catch {
        insights = [
          `Your pension pot has ${totalGrowthPct >= 0 ? "grown" : "decreased"} by ${Math.abs(totalGrowthPct).toFixed(1)}% since your first recorded entry.`,
        ];
      }
    } else {
      insights = [
        `Your pension pot is currently worth £${last.toLocaleString("en-GB", { minimumFractionDigits: 2 })}. Add more snapshots over time to track performance.`,
      ];
    }

    res.json({
      has_data: true,
      summary: `${totalGrowthPct >= 0 ? "+" : ""}${totalGrowthPct.toFixed(1)}% total growth`,
      total_growth_pct: parseFloat(totalGrowthPct.toFixed(2)),
      annualized_return_pct: annualizedReturn
        ? parseFloat(annualizedReturn.toFixed(2))
        : null,
      insights,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get pension insights");
    res.status(500).json({ error: "Failed to get insights" });
  }
});

// ---- Contributions ----

pensionRouter.get("/pension/contributions", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(contributionEntriesTable)
      .orderBy(asc(contributionEntriesTable.contributionDate));
    res.json(rows.map(serializeContribution));
  } catch (err) {
    req.log.error({ err }, "Failed to list contributions");
    res.status(500).json({ error: "Failed to list contributions" });
  }
});

pensionRouter.post("/pension/contributions/upload", async (req, res) => {
  try {
    const { csv_text } = req.body as { csv_text?: string };
    if (!csv_text || typeof csv_text !== "string") {
      res.status(400).json({ error: "csv_text is required" });
      return;
    }

    const lines = csv_text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      res.status(400).json({ error: "CSV appears empty or has no data rows" });
      return;
    }

    const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, " ").trim());
    const dateIdx = headers.findIndex((h) => h.includes("date"));
    const typeIdx = headers.findIndex((h) => h.includes("type") || h.includes("contribution type"));
    const amountIdx = headers.findIndex((h) => h.startsWith("amount") && !h.includes("invested"));

    if (dateIdx === -1 || typeIdx === -1 || amountIdx === -1) {
      res.status(400).json({
        error: `Could not find required columns (date, type, amount). Found headers: ${headers.join(", ")}`,
      });
      return;
    }

    // Aggregate per date
    const byDate = new Map<string, { employee: number; employer: number }>();
    let rowsParsed = 0;

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      if (fields.length < Math.max(dateIdx, typeIdx, amountIdx) + 1) continue;

      const isoDate = parseDateDMY(fields[dateIdx]);
      if (!isoDate) continue;

      const type = fields[typeIdx].toLowerCase();
      const amount = Math.abs(parseAmount(fields[amountIdx]));
      if (amount === 0) continue;

      rowsParsed++;
      const existing = byDate.get(isoDate) ?? { employee: 0, employer: 0 };
      if (type.includes("salary") || type.includes("employee") || type.includes("your")) {
        if (!type.includes("employer")) existing.employee += amount;
        else existing.employer += amount;
      } else if (type.includes("employer")) {
        existing.employer += amount;
      } else {
        existing.employee += amount;
      }
      byDate.set(isoDate, existing);
    }

    if (byDate.size === 0) {
      res.status(400).json({ error: "No valid contribution rows found. Check CSV format." });
      return;
    }

    const toInsert = Array.from(byDate.entries()).map(([date, amounts]) => ({
      contributionDate: date,
      employeeAmount: amounts.employee.toFixed(2),
      employerAmount: amounts.employer.toFixed(2),
    }));

    await db
      .insert(contributionEntriesTable)
      .values(toInsert)
      .onConflictDoUpdate({
        target: contributionEntriesTable.contributionDate,
        set: {
          employeeAmount: sql`EXCLUDED.employee_amount`,
          employerAmount: sql`EXCLUDED.employer_amount`,
        },
      });

    res.json({ upserted: byDate.size, rows_parsed: rowsParsed });
  } catch (err) {
    req.log.error({ err }, "Failed to upload contributions CSV");
    res.status(500).json({ error: "Failed to process CSV" });
  }
});

export default pensionRouter;
