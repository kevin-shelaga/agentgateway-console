#!/usr/bin/env node
/**
 * Extracts openAPIV3Schema JSON from CRD manifests and writes them to
 * src/lib/schemas/bundled/<crd-name>.json so the console can validate
 * resources even when the cluster can't serve CRD schemas.
 *
 * Sources:
 *  - agentgateway CRDs: ../agentgateway/controller/install/helm/agentgateway-crds/templates/*.yaml
 *  - Gateway API standard CRDs: downloaded from the gateway-api GitHub release
 *    matching the version pinned in ../agentgateway/go.mod (sigs.k8s.io/gateway-api),
 *    falling back to the latest release if that asset is missing.
 *  - Enterprise CRDs (optional): ../agentgateway-enterprise generated charts —
 *    only the enterprise groups; the agentgateway.dev copies it ships are
 *    skipped so the OSS repo stays their source of truth. Silently skipped
 *    when the enterprise repo isn't checked out.
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAllDocuments } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const agentgatewayRepo = path.resolve(repoRoot, "..", "agentgateway");
const crdTemplatesDir = path.join(
  agentgatewayRepo,
  "controller/install/helm/agentgateway-crds/templates",
);
const outDir = path.join(repoRoot, "src/lib/schemas/bundled");

const REQUIRED = [
  "agentgatewaybackends.agentgateway.dev",
  "agentgatewaypolicies.agentgateway.dev",
  "agentgatewayparameters.agentgateway.dev",
  "gatewayclasses.gateway.networking.k8s.io",
  "gateways.gateway.networking.k8s.io",
  "httproutes.gateway.networking.k8s.io",
  "grpcroutes.gateway.networking.k8s.io",
];

/**
 * Helm chart templates may contain `{{ ... }}` directives that are not valid
 * YAML. Neutralize them: drop lines that are purely template directives
 * (e.g. `{{- if .Values.x }}`) and blank out inline expressions.
 */
function stripHelmTemplating(text) {
  return text
    .split("\n")
    .filter((line) => !/^\s*\{\{.*\}\}\s*$/.test(line))
    .map((line) => line.replaceAll(/\{\{.*?\}\}/g, ""))
    .join("\n");
}

function parseCrdDocs(text, sourceName) {
  let docs;
  try {
    docs = parseAllDocuments(text, { strict: false });
    // Force evaluation; throw on hard errors.
    for (const d of docs) {
      if (d.errors.length > 0) throw d.errors[0];
    }
  } catch (err) {
    // Retry after neutralizing Helm templating.
    const stripped = stripHelmTemplating(text);
    docs = parseAllDocuments(stripped, { strict: false });
    for (const d of docs) {
      if (d.errors.length > 0) {
        throw new Error(
          `Failed to parse ${sourceName} even after stripping Helm templating: ${d.errors[0].message} (original error: ${err.message})`,
        );
      }
    }
  }
  const crds = [];
  for (const doc of docs) {
    const obj = doc.toJS();
    if (obj && obj.kind === "CustomResourceDefinition") crds.push(obj);
  }
  return crds;
}

function extractBundle(crd) {
  const versions = {};
  for (const v of crd.spec?.versions ?? []) {
    if (v.served === false) continue;
    const schema = v.schema?.openAPIV3Schema;
    if (schema) versions[v.name] = schema;
  }
  return {
    name: crd.metadata.name,
    group: crd.spec.group,
    kind: crd.spec.names.kind,
    plural: crd.spec.names.plural,
    scope: crd.spec.scope,
    versions,
  };
}

async function readAgentgatewayCrds() {
  const entries = await readdir(crdTemplatesDir);
  const crds = [];
  for (const entry of entries.filter((f) => /\.ya?ml$/.test(f)).sort()) {
    const text = await readFile(path.join(crdTemplatesDir, entry), "utf8");
    crds.push(...parseCrdDocs(text, entry));
  }
  return crds;
}

const enterpriseRepo = path.resolve(repoRoot, "..", "agentgateway-enterprise");
const ENTERPRISE_GROUPS = new Set(["enterpriseagentgateway.solo.io", "enterprise.solo.io"]);
const enterpriseTemplateDirs = [
  "ent-controller/install/generated/enterprise-agentgateway-crds/templates",
  "ent-controller/install/generated/enterprise-solo-crds/templates",
];

async function readEnterpriseCrds() {
  const crds = [];
  for (const dir of enterpriseTemplateDirs) {
    const full = path.join(enterpriseRepo, dir);
    let entries;
    try {
      entries = await readdir(full);
    } catch {
      console.warn(`enterprise repo not found at ${full} — skipping enterprise CRDs`);
      return [];
    }
    for (const entry of entries.filter((f) => /\.ya?ml$/.test(f)).sort()) {
      const text = await readFile(path.join(full, entry), "utf8");
      for (const crd of parseCrdDocs(text, entry)) {
        if (ENTERPRISE_GROUPS.has(crd.spec?.group)) crds.push(crd);
      }
    }
  }
  return crds;
}

async function detectGatewayApiVersion() {
  try {
    const gomod = await readFile(path.join(agentgatewayRepo, "go.mod"), "utf8");
    const m = gomod.match(/^\s*sigs\.k8s\.io\/gateway-api\s+v(\d+\.\d+\.\d+)\s*$/m);
    if (m) return `v${m[1]}`;
  } catch {
    // ignore; fall through to latest
  }
  return null;
}

async function fetchGatewayApiCrds() {
  const pinned = await detectGatewayApiVersion();
  const candidates = [];
  if (pinned) {
    candidates.push({
      version: pinned,
      url: `https://github.com/kubernetes-sigs/gateway-api/releases/download/${pinned}/standard-install.yaml`,
    });
  }
  candidates.push({
    version: "latest",
    url: "https://github.com/kubernetes-sigs/gateway-api/releases/latest/download/standard-install.yaml",
  });

  for (const { version, url } of candidates) {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      console.warn(`gateway-api ${version}: ${url} -> HTTP ${res.status}, trying next`);
      continue;
    }
    const text = await res.text();
    console.log(`gateway-api CRDs: ${version} (${url})`);
    return parseCrdDocs(text, url);
  }
  throw new Error("Unable to download Gateway API standard-install.yaml");
}

async function main() {
  const crds = [
    ...(await readAgentgatewayCrds()),
    ...(await fetchGatewayApiCrds()),
    ...(await readEnterpriseCrds()),
  ];
  await mkdir(outDir, { recursive: true });

  const written = [];
  for (const crd of crds) {
    const bundle = extractBundle(crd);
    if (Object.keys(bundle.versions).length === 0) {
      console.warn(`Skipping ${bundle.name}: no served versions with openAPIV3Schema`);
      continue;
    }
    const file = path.join(outDir, `${bundle.name}.json`);
    await writeFile(file, JSON.stringify(bundle, null, 2) + "\n", "utf8");
    written.push(bundle.name);
    console.log(`Wrote ${path.relative(repoRoot, file)} (versions: ${Object.keys(bundle.versions).join(", ")})`);
  }

  const missing = REQUIRED.filter((name) => !written.includes(name));
  if (missing.length > 0) {
    console.error(`Missing required CRDs: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`Done: ${written.length} CRD schema bundle(s) written to ${path.relative(repoRoot, outDir)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
