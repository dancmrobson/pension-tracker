---
name: Pension Tracker conventions
description: Key calling conventions for the Pension Tracker Expo + Express project
---

**Orval mutation calling convention:**
- POST body mutations: `mutate({ data: body })` — NOT `mutate(body)` directly
- DELETE with path param: `mutate({ id })` — no data wrapper
- Query keys for invalidation: `getListPensionEntriesQueryKey()`, `getGetPensionInsightsQueryKey()`

**OpenAI vision:** model `gpt-5.4`; send image as `data:image/jpeg;base64,${base64}`; always try/catch JSON.parse on response.

**Image upload:** Expo ImagePicker with `base64: true, quality: 0.75, mediaTypes: 'images'`; Express body limit 25MB.

**Drizzle numeric columns** return strings from DB; parse with parseFloat on the client side.

**Drizzle field name mismatch (critical):** Drizzle returns rows using the JS property names defined in the schema (`potValue`, `entryDate`, `totalContributions`), NOT the SQL column names. The OpenAPI spec uses snake_case (`pot_value`, `entry_date`). Always use a `serializeEntry()` helper in routes to remap before `res.json()`. Forgetting this causes `undefined` on the client even though TypeScript types look correct.

**Drizzle date columns** return "YYYY-MM-DD" strings; append T00:00:00 when constructing Date objects to avoid timezone shifts.
