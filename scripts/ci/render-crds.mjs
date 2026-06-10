#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const bundledSchemaDir = path.join(repoRoot, "src/lib/schemas/bundled");

const REQUIRED_CRDS = [
  {
    name: "agentgatewaybackends.agentgateway.dev",
    singular: "agentgatewaybackend",
  },
  {
    name: "agentgatewaypolicies.agentgateway.dev",
    singular: "agentgatewaypolicy",
  },
  {
    name: "agentgatewayparameters.agentgateway.dev",
    singular: "agentgatewayparameter",
  },
  {
    name: "gatewayclasses.gateway.networking.k8s.io",
    singular: "gatewayclass",
  },
  {
    name: "gateways.gateway.networking.k8s.io",
    singular: "gateway",
  },
  {
    name: "httproutes.gateway.networking.k8s.io",
    singular: "httproute",
  },
  {
    name: "grpcroutes.gateway.networking.k8s.io",
    singular: "grpcroute",
  },
];

function readBundle(name) {
  const file = path.join(bundledSchemaDir, `${name}.json`);

  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`Missing required bundled schema: ${path.relative(repoRoot, file)}`);
    }

    throw new Error(`Failed to read bundled schema ${path.relative(repoRoot, file)}: ${err.message}`);
  }
}

function toCrd(required) {
  const bundle = readBundle(required.name);
  const versions = Object.entries(bundle.versions ?? {});

  if (versions.length === 0) {
    throw new Error(`Bundled schema ${required.name} has no versions`);
  }

  return {
    apiVersion: "apiextensions.k8s.io/v1",
    kind: "CustomResourceDefinition",
    metadata: {
      name: bundle.name,
    },
    spec: {
      group: bundle.group,
      names: {
        plural: bundle.plural,
        singular: required.singular,
        kind: bundle.kind,
        listKind: `${bundle.kind}List`,
      },
      scope: bundle.scope,
      versions: versions.map(([name, openAPIV3Schema], index) => ({
        name,
        served: true,
        storage: index === 0,
        schema: {
          openAPIV3Schema,
        },
      })),
    },
  };
}

function renderYaml() {
  return `${REQUIRED_CRDS.map((required) => JSON.stringify(toCrd(required), null, 2)).join("\n---\n")}\n`;
}

function applyYaml(yaml) {
  const result = spawnSync("kubectl", ["apply", "-f", "-"], {
    input: yaml,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });

  if (result.error) {
    throw new Error(`Failed to run kubectl apply -f -: ${result.error.message}`);
  }

  process.exit(result.status ?? 1);
}

try {
  const yaml = renderYaml();

  if (process.argv.includes("--apply")) {
    applyYaml(yaml);
  } else {
    process.stdout.write(yaml);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
