const assert = require("node:assert/strict");
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

function withCleanBuildEnv(callback) {
  const keys = ["CUBESYNC_RECAPTCHA_SITE_KEY"];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));

  keys.forEach((key) => {
    delete process.env[key];
  });

  try {
    return callback();
  } finally {
    keys.forEach((key) => {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
}

function runBuildScript(root) {
  const previousCwd = process.cwd();
  const scriptPath = path.resolve(previousCwd, "scripts/write-env.js");

  process.chdir(root);
  try {
    withCleanBuildEnv(() => {
      delete require.cache[scriptPath];
      require(scriptPath);
    });
  } finally {
    delete require.cache[scriptPath];
    process.chdir(previousCwd);
  }
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

test("every script referenced in HTML is included in build STATIC_FILES", () => {
  const buildScript = fs.readFileSync("scripts/write-env.js", "utf8");

  const htmlFiles = ["index.html", "dashboard.html", "glassmorphic.html"];
  const missingScripts = [];

  for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(htmlFile, "utf8");
    const scriptRe = /<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*>/g;
    let match;
    while ((match = scriptRe.exec(html)) !== null) {
      const src = match[1];
      if (src.startsWith("http")) continue;
      if (src === "env.js") continue;
      if (!buildScript.includes(`"${src}"`)) {
        missingScripts.push({ htmlFile, src });
      }
    }
  }

  assert.deepEqual(
    missingScripts,
    [],
    `Scripts referenced in HTML but missing from build STATIC_FILES: ${missingScripts.map((m) => `${m.htmlFile} -> ${m.src}`).join(", ")}`
  );
});

test("build copies HTML-referenced scripts to public output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cubesync-scripts-"));

  const htmlFiles = ["index.html", "dashboard.html", "glassmorphic.html"];
  const allScripts = new Set();

  for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(htmlFile, "utf8");
    const scriptRe = /<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*>/g;
    let match;
    while ((match = scriptRe.exec(html)) !== null) {
      const src = match[1];
      if (!src.startsWith("http")) allScripts.add(src);
    }
  }

  const buildScript = fs.readFileSync("scripts/write-env.js", "utf8");
  const listMatch = buildScript.match(/STATIC_FILES\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(listMatch, "Could not find STATIC_FILES array in build script");
  const fileRe = /"([^"]+)"/g;
  let m;
  const staticFiles = [];
  while ((m = fileRe.exec(listMatch[1])) !== null) staticFiles.push(m[1]);

  staticFiles.forEach((file) => writeFile(root, file, file));
  writeFile(root, "css/styles.css", "");
  writeFile(root, "css/glassmorphic.css", "");
  writeFile(root, "css/dashboard.css", "");
  writeFile(root, ".env.local", "CUBESYNC_RECAPTCHA_SITE_KEY=test\n");

  runBuildScript(root);

  for (const src of allScripts) {
    assert.ok(
      fs.existsSync(path.join(root, "public", src)),
      `Script "${src}" referenced in HTML but not found in public/ after build`
    );
  }
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

  runBuildScript(root);

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
