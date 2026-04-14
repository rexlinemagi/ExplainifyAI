module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // 🛑 This is the magic key that stops Hermes from crashing!
          unstable_transformImportMeta: true,
        },
      ],
    ],
  };
};
