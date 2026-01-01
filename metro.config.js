const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// svg を transformer に渡す
config.transformer.babelTransformerPath = require.resolve(
  "react-native-svg-transformer"
);

// svg を asset から外して source に入れる
config.resolver.assetExts = config.resolver.assetExts.filter(
  (ext) => ext !== "svg"
);
config.resolver.sourceExts.push("svg");

module.exports = config;
