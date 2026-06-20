const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function writeFile(root, file, content = "") {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function envSiteKey(file) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox);
  return sandbox.window.CubeSyncEnv && sandbox.window.CubeSyncEnv.RECAPTCHA_SITE_KEY;
}

test("manifest remains valid JSON for browser installability", () => {
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

  assert.equal(manifest.name, "CubeSync - Concrete Cube Test Request");
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.every((icon) => icon.type === "image/png"));
});

test("Vercel deployment serves generated public output", () => {
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const buildScript = fs.readFileSync("scripts/write-env.js", "utf8");
  const eslintConfig = fs.readFileSync("eslint.config.mjs", "utf8");
  const gitignore = fs.readFileSync(".gitignore", "utf8");

  assert.equal(vercel.outputDirectory, "public");
  assert.equal(vercel.buildCommand, "npm run build");
  assert.equal(packageJson.scripts.build, "node scripts/write-env.js");
  assert.match(buildScript, /PUBLIC_DIR[\s\S]*"public"/);
  assert.match(buildScript, /"index\.html"/);
  assert.match(buildScript, /"glassmorphic\.html"/);
  assert.match(buildScript, /"env\.js"/);
  assert.match(buildScript, /"dropdown-options"/);
  assert.match(eslintConfig, /"public\/\*\*"/);
  assert.match(gitignore, /public\//);
});

test("build script uses .env.local and emits non-empty public env output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cubesync-build-"));
  const staticFiles = [
    "dashboard.html",
    "glassmorphic.html",
    "index.html",
    "rpa-dashboard.html",
    "rpa-view.html",
    "app.js",
    "barcode.js",
    "chime.js",
    "cubesync-form-data.js",
    "cubesync-form-markup.js",
    "cubesync-export.js",
    "dashboard.js",
    "firestore.js",
    "rpa-dashboard.js",
    "rpa-view.js",
    "favicon.png",
    "manifest.json",
    "sw.js"
  ];

  staticFiles.forEach((file) => writeFile(root, file, file));
  writeFile(root, "assets/logo.png", "logo");
  writeFile(root, "css/styles.css", '@import url("shared/tokens-rakmat-base.css");');
  writeFile(root, "css/glassmorphic.css", '@import url("shared/barcode.css");');
  writeFile(root, "css/dashboard.css", '@import url("dashboard/tokens.css");');
  writeFile(root, "css/rpa-dashboard.css", '@import url("rpa/xp-theme.css");');
  writeFile(root, "css/xp-taskbar.css", '@import url("rpa/xp-theme.css");');
  writeFile(root, "css/shared/tokens-rakmat-base.css", "");
  writeFile(root, "css/shared/barcode.css", "");
  writeFile(root, "css/dashboard/tokens.css", "");
  writeFile(root, "css/rpa/xp-theme.css", "body { color: #000; }");
  writeFile(root, "dropdown-options/supplier.txt", "Supplier A\nSupplier B");
  writeFile(root, "dropdown-options/person-in-charge.txt", "Person A");
  writeFile(root, ".env", "CUBESYNC_RECAPTCHA_SITE_KEY=\n");
  writeFile(root, ".env.local", "CUBESYNC_RECAPTCHA_SITE_KEY=local-test-site-key\n");

  childProcess.execFileSync(process.execPath, [path.resolve("scripts/write-env.js")], {
    cwd: root,
    stdio: "pipe"
  });

  assert.equal(envSiteKey(path.join(root, "env.js")), "local-test-site-key");
  assert.equal(envSiteKey(path.join(root, "public/env.js")), "local-test-site-key");
  assert.ok(fs.existsSync(path.join(root, "public/index.html")));
  assert.ok(fs.existsSync(path.join(root, "public/glassmorphic.html")));
  assert.ok(fs.existsSync(path.join(root, "public/assets/logo.png")));
  assert.ok(fs.existsSync(path.join(root, "public/css/styles.css")));
  assert.ok(fs.existsSync(path.join(root, "public/css/rpa/xp-theme.css")));
  assert.ok(fs.existsSync(path.join(root, "public/dropdown-options/supplier.txt")));
  assert.ok(fs.existsSync(path.join(root, "public/dropdown-options/person-in-charge.txt")));
  assert.match(fs.readFileSync(path.join(root, "public/dropdown-options/supplier.txt"), "utf8"), /Supplier A/);
});
