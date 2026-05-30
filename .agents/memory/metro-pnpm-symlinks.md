---
name: Metro pnpm symlink resolution
description: How to fix Metro bundler failing to resolve pnpm-symlinked packages in an Expo artifact inside a pnpm workspace
---

## Rule
When new packages are installed into a specific Expo artifact (`pnpm --filter @workspace/pension-tracker add <pkg>`), pnpm places them as symlinks pointing to `../../node_modules/.pnpm/...`. Metro does not follow these symlinks by default, causing "could not be found" bundle errors even though `ls node_modules/<pkg>` shows the directory.

## Fix
Update `artifacts/pension-tracker/metro.config.js`:

```js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
```

**Why:** Metro's default resolver only searches within the project root and direct `node_modules`; pnpm symlinks point outside that boundary. `unstable_enableSymlinks` + `watchFolders` covering the workspace root lets Metro follow them.

**How to apply:** Any time a new native or SDK-versioned package is added specifically to `@workspace/pension-tracker` and Metro throws an "Unable to resolve module" error for it.

Also clear Metro cache after config changes: `rm -rf artifacts/pension-tracker/.expo /tmp/metro-*`
