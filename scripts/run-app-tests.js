const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const emulatorSuite = "firestore-rules-emulator.test.js";
const testFiles = fs.readdirSync(root)
  .filter((file) => file.endsWith(".test.js") && file !== emulatorSuite)
  .sort();

if (!testFiles.length) {
  console.error("No application test files found.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--test", "--experimental-test-coverage", ...testFiles],
  { cwd: root, stdio: "inherit" }
);

if (result.error) throw result.error;
process.exit(result.status == null ? 1 : result.status);
