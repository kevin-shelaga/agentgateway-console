# Demo environment: kind + agentgateway + mock LLM, for showing off the console.
#
#   make demo-up        create kind cluster, install agentgateway, deploy demo app
#   make demo-traffic   send mixed LLM/echo/error traffic through the gateway
#   make demo-console   launch the console against the kind cluster
#   make demo-down      delete the kind cluster
#
# Requires: docker, kind, kubectl, helm.

KIND_CLUSTER      ?= agc-demo
KIND_CONTEXT      := kind-$(KIND_CLUSTER)
GATEWAY_API_VER   ?= v1.5.1
AGW_CHART_VER     ?= 1.2.1
TRAFFIC_SECONDS   ?= 300
KUBECTL           := kubectl --context $(KIND_CONTEXT)

.PHONY: demo-up demo-cluster demo-agentgateway demo-app demo-traffic demo-console demo-down

demo-up: demo-cluster demo-agentgateway demo-app
	@echo ""
	@echo "Demo is up. Next:"
	@echo "  make demo-traffic     # send traffic (Usage page lights up after ~30s)"
	@echo "  make demo-console     # open the console on the kind context"

demo-cluster:
	@kind get clusters 2>/dev/null | grep -qx "$(KIND_CLUSTER)" || kind create cluster --name $(KIND_CLUSTER)
	$(KUBECTL) apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/$(GATEWAY_API_VER)/standard-install.yaml

demo-agentgateway:
	helm upgrade -i agentgateway-crds oci://ghcr.io/agentgateway/charts/agentgateway-crds \
		--version $(AGW_CHART_VER) -n agentgateway-system --create-namespace \
		--kube-context $(KIND_CONTEXT)
	helm upgrade -i agentgateway oci://ghcr.io/agentgateway/charts/agentgateway \
		--version $(AGW_CHART_VER) -n agentgateway-system \
		--kube-context $(KIND_CONTEXT)
	$(KUBECTL) -n agentgateway-system rollout status deploy/agentgateway --timeout=120s

demo-app:
	$(KUBECTL) apply -f demo/mockllm.yaml
	$(KUBECTL) -n default rollout status deploy/mockllm --timeout=120s
	$(KUBECTL) apply -f demo/gateway.yaml
	@echo "waiting for the demo-gateway proxy to be programmed..."
	$(KUBECTL) wait --for=condition=Programmed gateway/demo-gateway -n default --timeout=120s
	$(KUBECTL) -n default rollout status deploy/demo-gateway --timeout=120s

# Mixed traffic from inside the cluster (no port-forward juggling):
# chat completions against both models, echo hits, and some 404s for the
# status-class bars. Rotates x-user-id between three users so the per-user
# token charts populate. Runs for TRAFFIC_SECONDS (default 300).
demo-traffic:
	$(KUBECTL) -n default delete pod demo-traffic --ignore-not-found --wait=true
	$(KUBECTL) -n default run demo-traffic --image=curlimages/curl --restart=Never \
		--labels=app=demo-traffic -- sh -c '\
		end=$$(( $$(date +%s) + $(TRAFFIC_SECONDS) )); \
		i=0; \
		while [ $$(date +%s) -lt $$end ]; do \
		  i=$$((i+1)); \
		  case $$((i % 3)) in \
		    0) user=alice ;; 1) user=bob ;; 2) user=carol ;; \
		  esac; \
		  body="{\"model\":\"demo\",\"messages\":[{\"role\":\"user\",\"content\":\"hello $$i\"}]}"; \
		  case $$((i % 5)) in \
		    0|1) curl -s -o /dev/null -X POST -H "content-type: application/json" -H "x-user-id: $$user" -d "$$body" http://demo-gateway.default/v1/chat/completions ;; \
		    2)   curl -s -o /dev/null -X POST -H "content-type: application/json" -H "x-user-id: $$user" -d "$$body" http://demo-gateway.default/v2/chat/completions ;; \
		    3)   curl -s -o /dev/null -H "x-user-id: $$user" http://demo-gateway.default/echo ;; \
		    4)   curl -s -o /dev/null http://demo-gateway.default/does-not-exist ;; \
		  esac; \
		  sleep 0.5; \
		done; echo "sent $$i requests"'
	@echo "traffic pod running for $(TRAFFIC_SECONDS)s — follow it with:"
	@echo "  $(KUBECTL) -n default logs -f demo-traffic"

demo-console:
	@echo "starting the console against $(KIND_CONTEXT)..."
	node bin/agentgateway-console.mjs --context $(KIND_CONTEXT)

demo-down:
	kind delete cluster --name $(KIND_CLUSTER)
