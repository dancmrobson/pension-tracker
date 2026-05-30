import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db, pensionEntriesTable } from "@workspace/db";
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

Reply ONLY with a JSON object (no markdown, no extra text):
{"pot_value": <number or null>, "entry_date": "<YYYY-MM-DD string or null>", "total_contributions": <number or null>, "confidence": "<high|medium|low>", "message": "<one sentence describing what was found>"}`,
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

export default pensionRouter;
