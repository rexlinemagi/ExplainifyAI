const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 🛑 1. THE PDF HACK: Feed the bundler our fake canvas
config.resolver.extraNodeModules = {
    canvas: require.resolve('./mock-canvas.js'),
};

// 🌍 2. THE WEB HACK: Tell Metro to accept WebAssembly (.wasm) files!
// If this line goes missing, the Web app INSTANTLY dies.
config.resolver.assetExts.push('wasm');

module.exports = config;