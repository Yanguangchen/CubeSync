const fs = require("node:fs");
const path = require("node:path");
const { loadDotEnv } = require("./load-env");

const PUBLIC_DIR = path.join(process.cwd(), "public");
// Every JS file referenced via <script src="..."> in HTML must be listed here,
// otherwise it won't be copied to public/ and will 404 in production.
// See deployment-config.test.js for automated checks that enforce this.
const STATIC_FILES = [
  "dashboard.html",
  "glassmorphic.html",
  "index.html",
  "rpa-dashboard.html",
  "rpa-view.html",
  "app.js",
  "barcode.js",
  "chime.js",
  "cubesync-autocomplete.js",
  "cubesync-form-data.js",
  "cubesync-form-markup.js",
  "cubesync-export.js",
  "cubesync-table-manager.js",
  "cubesync-dashboard-filters.js",
  "cubesync-heatmap.js",
  "cubesync-metrics.js",
  "cubesync-notifications.js",
  "cubesync-today-toggle.js",
  "dashboard.js",
  "firestore.js",
  "rpa-dashboard.js",
  "rpa-view.js",
  "favicon.png",
  "manifest.json",
  "sw.js"
];
const STATIC_DIRS = [
  "assets",
  "css",
  "dropdown-options"
];

function jsString(value) {
  return JSON.stringify(String(value || ""));
}

loadDotEnv();

const env = {
  RECAPTCHA_SITE_KEY: process.env.CUBESYNC_RECAPTCHA_SITE_KEY
};

const content = `window.CubeSyncEnv = {
  RECAPTCHA_SITE_KEY: ${jsString(env.RECAPTCHA_SITE_KEY)}
};
`;

function copyStaticFiles() {
  fs.rmSync(PUBLIC_DIR, { recursive: true, force: true });
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  for (const file of STATIC_FILES) {
    fs.copyFileSync(path.join(process.cwd(), file), path.join(PUBLIC_DIR, file));
  }

  for (const directory of STATIC_DIRS) {
    const source = path.join(process.cwd(), directory);
    if (!fs.existsSync(source)) {
      continue;
    }
    fs.cpSync(source, path.join(PUBLIC_DIR, directory), {
      recursive: true
    });
  }

}

fs.writeFileSync(path.join(process.cwd(), "env.js"), content);
copyStaticFiles();
fs.writeFileSync(path.join(PUBLIC_DIR, "env.js"), content);
console.log("Generated env.js and public/ static output");
