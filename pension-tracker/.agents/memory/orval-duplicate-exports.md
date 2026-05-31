---
name: Orval duplicate-export fix
description: Prevent TS2308 duplicate-export errors when using Orval split mode with zod client
---

**Rule:** Do NOT set `schemas: { path: "generated/types", type: "typescript" }` on the Orval zod output. It generates both Zod schemas and a TypeScript types folder with the same names, causing TS2308 when both are barrel-re-exported.

Also: after each codegen run, verify `lib/api-zod/src/index.ts` contains only `export * from "./generated/api"` — Orval may regenerate it with the types barrel reference.

**Why:** Orval split mode creates identically-named exports in two places; `export *` from both causes TypeScript ambiguity errors.

**How to apply:** Remove the schemas option from orval.config.ts zod output. After codegen, check index.ts hasn't been overwritten with the types export.
