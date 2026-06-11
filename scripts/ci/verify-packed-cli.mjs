#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tmp = mkdtempSync(path.join(tmpdir(), "agentgateway-console-package-"));
const installDir = path.join(tmp, "install");
const npmEnv = { ...process.env, npm_config_cache: path.join(tmp, "npm-cache") };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout ?? "";
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("could not allocate a free port"));
      });
    });
  });
}

async function waitFor(url, child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`published CLI exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`timed out waiting for ${url}`);
}

async function stop(child) {
  if (!child) return;
  if (child.exitCode !== null) return;

  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 5_000);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

let child;

try {
  mkdirSync(installDir);

  const packOutput = run("npm", ["pack", "--ignore-scripts", "--pack-destination", tmp], {
    capture: true,
    env: npmEnv,
  });
  const tarball = packOutput
    .trim()
    .split(/\r?\n/)
    .findLast((line) => line.endsWith(".tgz"));

  if (!tarball) {
    throw new Error(`could not determine npm pack output from:\n${packOutput}`);
  }

  run(
    "npm",
    ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", path.join(tmp, tarball)],
    { cwd: installDir, env: npmEnv },
  );

  const port = await getFreePort();
  child = spawn("npx", ["--no-install", "agentgateway-console", "--port", String(port), "--no-open"], {
    cwd: installDir,
    env: npmEnv,
    stdio: "inherit",
  });

  await waitFor(`http://127.0.0.1:${port}/api/cluster`, child);
  console.log("published CLI smoke check passed");
} finally {
  await stop(child);
  rmSync(tmp, { force: true, recursive: true });
}
