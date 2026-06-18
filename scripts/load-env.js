const fs = require("node:fs");
const path = require("node:path");

function braceBalance(value) {
  let balance = 0;
  let inString = false;
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;
    if (char === "{") balance += 1;
    if (char === "}") balance -= 1;
  }

  return balance;
}

function cleanValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadDotEnvFile(envPath, protectedKeys) {
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const firstValue = line.slice(separator + 1);
    const parts = [firstValue];

    if (firstValue.trim().startsWith("{")) {
      let balance = braceBalance(firstValue);
      while (balance > 0 && index + 1 < lines.length) {
        index += 1;
        parts.push(lines[index]);
        balance += braceBalance(lines[index]);
      }
    }

    if (key && !protectedKeys.has(key)) {
      process.env[key] = cleanValue(parts.join("\n"));
    }
  }
}

function loadDotEnv(envPaths = [
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), ".env.local")
]) {
  const paths = Array.isArray(envPaths) ? envPaths : [envPaths];
  const protectedKeys = new Set(Object.keys(process.env));
  paths.forEach((envPath) => loadDotEnvFile(envPath, protectedKeys));
}

module.exports = {
  loadDotEnv
};
