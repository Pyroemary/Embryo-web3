// Builds a single self-contained HTML prototype (demo mode) for sharing as a hosted page.
// Usage: pnpm --filter @embryo/mobile build:prototype  → dist-prototype/embryo-prototype.html
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = "dist-prototype";
execSync(`npx expo export --platform web --output-dir ${out}/export`, {
  stdio: "inherit",
  env: { ...process.env, EMBRYO_SINGLE_BUNDLE: "1", EXPO_PUBLIC_API_URL: "" },
});
const dir = join(out, "export/_expo/static/js/web");
const js = readFileSync(join(dir, readdirSync(dir).find((f) => f.startsWith("entry-"))), "utf8").replaceAll("</script", "<\\/script");
const html = `<title>Embryo App Prototype</title>
<style>
  :root { --forest: #1E4D45; color-scheme: light; }
  html, body { height: 100%; }
  body { overflow: hidden; background: var(--forest); }
  #root { display: flex; height: 100%; flex: 1; }
</style>
<div id="root"></div>
<script>try { if (location.pathname !== "/") history.replaceState(null, "", "/"); } catch (e) {}</script>
<script>
${js}
</script>
`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "embryo-prototype.html"), html);
console.log(`wrote ${out}/embryo-prototype.html (${(html.length / 1e6).toFixed(2)} MB)`);
