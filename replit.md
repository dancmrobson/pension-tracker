# Pension Tracker

A mobile app (Expo/React Native) that lets users upload screenshots of their pension app, uses OpenAI Vision to extract the pot value and date automatically, logs entries to a PostgreSQL database, plots performance over time with a chart, and generates AI insights.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI via Replit AI Integrations

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo 54 + expo-router, React Native
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- AI: OpenAI GPT-5.4 vision (via `@workspace/integrations-openai-ai-server`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/pension_entries.ts` — DB schema (Drizzle)
- `artifacts/api-server/src/routes/pension.ts` — all pension API routes
- `artifacts/pension-tracker/app/(tabs)/` — Expo screens (index=Dashboard, upload=Upload, history=History)
- `artifacts/pension-tracker/components/PensionChart.tsx` — SVG line chart
- `artifacts/pension-tracker/constants/colors.ts` — design tokens (navy/gold)

## Architecture decisions

- Contract-first API: OpenAPI spec → Orval generates React Query hooks + Zod schemas
- Base64 image upload: Expo ImagePicker encodes to base64, sends as JSON body (25MB limit set on Express)
- Drizzle `numeric` columns return strings; routes pass raw strings to client which does `parseFloat`
- `lib/api-zod/src/index.ts` only exports from `./generated/api` (not `./generated/types`) to avoid Orval duplicate-export conflicts
- `lib/api-spec/orval.config.ts` has `schemas` option removed from the zod output to prevent type conflicts

## Product

- **Dashboard**: Shows current pot value, interactive performance line chart (SVG), total growth % badge, annualised return stat, and 3 AI-generated insights
- **Upload**: Pick pension screenshot from photo library → AI extracts date + pot value → review/edit + save
- **History**: Chronological list of all entries with growth % vs previous entry, swipe-to-delete

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After changing the OpenAPI spec, always run `pnpm --filter @workspace/api-spec run codegen` AND then manually ensure `lib/api-zod/src/index.ts` only has `export * from "./generated/api"` (Orval regenerates it with the types barrel too, causing TS2308 duplicate-export errors)
- Drizzle `date` columns return strings in "YYYY-MM-DD" format; always append `T00:00:00` when constructing `new Date()` from them to avoid timezone shifts
- Express body limit is 25MB to handle base64-encoded phone screenshots

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
