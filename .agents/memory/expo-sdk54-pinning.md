---
name: Expo SDK 54 package pinning
description: pnpm add installs latest SDK 56-era versions for Expo packages; must pin to SDK 54 compatible versions or Metro warns and features may break.
---

## The rule

When adding Expo-ecosystem packages to the pension-tracker artifact, always pin to the SDK 54-compatible version. `pnpm add expo-<x>` installs the latest (currently SDK 56-era) version, which triggers Metro warnings and may cause runtime failures.

**Why:** The app uses Expo SDK 54 (`expo@54.x`). Expo packages are tightly versioned against the SDK. Installing mismatched versions causes "Your project may not work correctly" warnings and can break native modules after EAS build.

**How to apply:** Run `npx expo install <package>` to get the correct pinned version, or look up the expected version from the Metro warning and re-pin manually with `pnpm add <package>@~X.Y.Z`.

## Known correct versions for Expo SDK 54

| Package | Correct version |
|---|---|
| expo-notifications | ~0.32.17 |
| expo-local-authentication | ~17.0.8 |

## Pattern when a new package gives a version warning

1. Metro log shows: `expo-<x>@Y.Z - expected version: ~A.B.C`
2. Run: `cd artifacts/pension-tracker && pnpm add expo-<x>@~A.B.C`
3. Restart the expo workflow
