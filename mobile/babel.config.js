module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            // @noble/curves collapsed p256 into nist.js in v2.0+
            // Intercept legacy/standard p256 import calls and route them directly to the physical file.
            '@noble/curves/p256': './node_modules/@noble/curves/nist.js'
          }
        }
      ]
    ]
  };
};
