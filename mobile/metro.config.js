// This app lives inside the web project's repo. Resolve modules only from mobile/node_modules so Metro
// never picks up the web app's React 18 from ../node_modules.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
