import { existsSync, rmSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const runFramework = path.join(root, "scripts", "run-framework.mjs");
const python = process.platform === "win32"
  ? path.join(root, ".venv", "Scripts", "python.exe")
  : path.join(root, ".venv", "bin", "python");

const responds = async (url) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
};

if (!existsSync(python)) {
  console.error("Missing .venv. Run: python -m venv .venv");
  process.exit(1);
}

const [webRunning, audioRunning] = await Promise.all([
  responds("http://127.0.0.1:8787/"),
  responds("http://127.0.0.1:8765/health"),
]);

if (webRunning && audioRunning) {
  console.log("Luma is already running at http://127.0.0.1:8787");
  console.log("Use the original terminal and press Ctrl+C when you want to stop it.");
  process.exit(0);
}

if (webRunning || audioRunning) {
  console.error("A previous Luma process is still using port 8765 or 8787.");
  console.error("Close the original terminal with Ctrl+C, then run npm run local again.");
  process.exit(1);
}

try {
  rmSync(path.join(root, "dist"), {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 250,
  });
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "EBUSY") {
    console.error("The previous local server still has the build folder open.");
    console.error("Close its terminal with Ctrl+C, wait a moment, and run npm run local again.");
  } else {
    console.error(error);
  }
  process.exit(1);
}

const build = spawn(process.execPath, [runFramework, "build"], {
  cwd: root,
  stdio: "inherit",
});
const buildCode = await new Promise((resolve) => build.once("exit", resolve));
if (buildCode !== 0) process.exit(Number(buildCode) || 1);

const processes = [
  spawn(python, [path.join(root, "local-backend", "server.py")], {
    cwd: root,
    stdio: "inherit",
  }),
  spawn(process.execPath, [
    "--import",
    pathToFileURL(path.join(root, "scripts", "sites-env.mjs")).href,
    path.join(root, "node_modules", "wrangler", "bin", "wrangler.js"),
    "dev",
    "--config",
    path.join(root, "dist", "server", "wrangler.json"),
    "--local",
    "--persist-to",
    path.join(root, ".wrangler", "state"),
    "--ip",
    "127.0.0.1",
    "--inspector-port",
    "0",
  ], {
    cwd: root,
    stdio: "inherit",
  }),
];

let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  for (const child of processes) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }
};

for (const child of processes) {
  child.on("exit", (code) => {
    if (!closing && code) process.exitCode = code;
    shutdown();
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
