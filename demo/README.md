# Console demo environment

A self-contained kind cluster running agentgateway with a mock LLM, so every
part of the console has something to show: resources, status, runtime pods,
API keys, the playground, and the Usage charts.

## Prerequisites

`docker`, `kind`, `kubectl`, and `helm` on your PATH.

## Quick start

```sh
make demo-up        # kind cluster + Gateway API CRDs + agentgateway + demo app
make demo-traffic   # mixed LLM / echo / 404 traffic for ~5 minutes
make demo-console   # launch the console pointed at the kind context
make demo-down      # tear it all down
```

Traffic takes ~30 seconds to show up on the Usage page (metrics are scraped
from the proxy pods every 15s and charted as session-scope rates). The
traffic generator rotates `x-user-id` between `alice`, `bob`, and `carol`,
which the demo gateway turns into a `user` metric label — so the Usage
page's "Tokens by user" card lights up too.

## What gets deployed

| Thing | Purpose in the demo |
| --- | --- |
| `Gateway default/demo-gateway` (class `agentgateway`) | Gateways page, dashboard completeness checks |
| `HTTPRoute default/llm` (`/v1`, `/v2`) | Routes referencing `AgentgatewayBackend`s |
| `HTTPRoute default/echo` | Plain Service-backed route |
| `AgentgatewayBackend gpt4o-mini` / `gpt41` | Two AI backends → by-model token charts |
| `Secret default/demo-llm-key` | Shows up on the API Keys page (referenced by both backends) |
| `Deployment default/mockllm` | OpenAI-compatible mock returning randomized `usage` token counts |
| `AgentgatewayParameters demo-gateway-params` | Adds a `user` metric label from the `x-user-id` header → "Tokens by user" card |

The mock LLM is a stdlib-only Python server shipped in a ConfigMap on
`python:3.12-alpine` — no images to build. It answers
`POST */chat/completions` with random prompt/completion token counts and
50–400ms of artificial latency, `GET /echo` with 200, and anything else
with 404, so the request-rate, status-class, latency, and token charts all
have shape.

## Knobs

```sh
make demo-up KIND_CLUSTER=my-demo          # cluster name (context becomes kind-my-demo)
make demo-traffic TRAFFIC_SECONDS=900      # run traffic longer
make demo-up AGW_CHART_VER=1.2.1           # agentgateway chart version
```
