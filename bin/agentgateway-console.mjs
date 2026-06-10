#!/usr/bin/env node
/**
 * agentgateway-console CLI — launch the console locally against your
 * kubeconfig (with context switching), the same way `kubectl` would see it.
 *
 *   agentgateway-console [--port 3000] [--context my-ctx] [--kubeconfig path] [--no-open]
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = { port: 3000, open: true, context: undefined, kubeconfig: undefined, rebuild: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--port":
      case "-p":
        opts.port = Number(argv[++i]);
        break;
      case "--context":
      case "-c":
        opts.context = argv[++i];
        break;
      case "--kubeconfig":
        opts.kubeconfig = argv[++i];
        break;
      case "--no-open":
        opts.open = false;
        break;
      case "--rebuild":
        opts.rebuild = true;
        break;
      case "--help":
      case "-h":
        console.log(`agentgateway-console — Kubernetes console for agentgateway

Usage: agentgateway-console [options]

Options:
  -p, --port <port>        port to listen on (default 3000)
  -c, --context <name>     kubeconfig context to start with
      --kubeconfig <path>  kubeconfig file (default ~/.kube/config)
      --no-open            don't open the browser
      --rebuild            force a production rebuild
  -h, --help               show this help`);
        process.exit(0);
    }
  }
  if (!Number.isInteger(opts.port) || opts.port <= 0) {
    console.error("invalid --port");
    process.exit(1);
  }
  return opts;
}

function ensureBuild(rebuild) {
  const server = path.join(root, ".next", "standalone", "server.js");
  if (rebuild || !existsSync(server)) {
    console.log("• building console (first run)…");
    const result = spawnSync("npx", ["--no-install", "next", "build"], {
      cwd: root,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      console.error("build failed");
      process.exit(result.status ?? 1);
    }
  }
  // The standalone server expects static assets and public/ beside it.
  const staticSrc = path.join(root, ".next", "static");
  const staticDest = path.join(root, ".next", "standalone", ".next", "static");
  if (existsSync(staticSrc)) cpSync(staticSrc, staticDest, { recursive: true });
  const publicSrc = path.join(root, "public");
  const publicDest = path.join(root, ".next", "standalone", "public");
  if (existsSync(publicSrc)) cpSync(publicSrc, publicDest, { recursive: true });
  return server;
}

function checkPortFree(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function openBrowser(url) {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
}

const opts = parseArgs(process.argv.slice(2));

if (!(await checkPortFree(opts.port))) {
  console.error(`port ${opts.port} is already in use (try --port)`);
  process.exit(1);
}

const serverJs = ensureBuild(opts.rebuild);

const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(opts.port),
  // Bind loopback only: this process holds your kubeconfig credentials.
  HOSTNAME: "127.0.0.1",
};
if (opts.context) env.AGC_CONTEXT = opts.context;
if (opts.kubeconfig) env.KUBECONFIG = opts.kubeconfig;

const child = spawn("node", [serverJs], { cwd: root, env, stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
child.on("exit", (code) => process.exit(code ?? 0));

const url = `http://localhost:${opts.port}`;
waitForServer(`${url}/api/cluster`).then((up) => {
  if (up) {
    console.log(`\n  agentgateway console → ${url}${opts.context ? `  (context: ${opts.context})` : ""}\n`);
    if (opts.open) openBrowser(url);
  } else {
    console.error("server did not become ready — see logs above");
  }
});
