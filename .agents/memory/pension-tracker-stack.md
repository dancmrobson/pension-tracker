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

**Drizzle date columns** return "YYYY-MM-DD" strings; append T00:00:00 when constructing Date objects to avoid timezone shifts.
