// EMBRYO_SINGLE_BUNDLE=1 → one JS bundle for web (used to package the self-contained prototype).
module.exports = ({ config }) =>
  process.env.EMBRYO_SINGLE_BUNDLE
    ? { ...config, plugins: config.plugins.map((p) => (p === "expo-router" ? ["expo-router", { asyncRoutes: false }] : p)) }
    : config;
