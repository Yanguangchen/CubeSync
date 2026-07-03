const net = require("node:net");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const host = "127.0.0.1";
const port = 8080;

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status == null ? 1 : result.status;
}

(async () => {
  if (await isPortOpen()) {
    console.log(`Using the running Firestore emulator at ${host}:${port}.`);
    run(process.execPath, ["--test", "firestore-rules-emulator.test.js"], {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: `${host}:${port}`
    });
    return;
  }

  run("firebase", [
    "emulators:exec",
    "--only", "firestore",
    "--project", "cubesync-rules-test",
    "node --test firestore-rules-emulator.test.js"
  ]);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
