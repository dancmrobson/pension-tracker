const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch only the workspace directories Metro actually needs —
// avoids FallbackWatcher failures on transient/deleted dirs under .local
config.watchFolders = [
  path.resolve(workspaceRoot, "lib"),
  path.resolve(workspaceRoot, "artifacts"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Follow pnpm symlinks and honour package.json "exports"
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
