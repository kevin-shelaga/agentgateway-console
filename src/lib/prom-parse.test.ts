import { describe, expect, it } from "vitest";
import { mergeSamples, parsePrometheusText } from "./prom-parse";

const SAMPLE = `# HELP agentgateway_requests Total requests
# TYPE agentgateway_requests counter
agentgateway_requests_total{gateway="ns/gw",status="200"} 582
agentgateway_requests_total{gateway="ns/gw",status="404"} 38
# TYPE agentgateway_gen_ai_client_token_usage histogram
agentgateway_gen_ai_client_token_usage_sum{gen_ai_token_type="input",gen_ai_request_model="gpt-4o-mini"} 12345
agentgateway_gen_ai_client_token_usage_count{gen_ai_token_type="input",gen_ai_request_model="gpt-4o-mini"} 42
agentgateway_gen_ai_client_token_usage_bucket{gen_ai_token_type="input",le="+Inf"} 42
# TYPE agentgateway_cgroup_usage gauge
agentgateway_cgroup_usage 123
`;

describe("parsePrometheusText", () => {
  it("parses samples with labels, filtering to wanted prefixes", () => {
    const samples = parsePrometheusText(SAMPLE, ["agentgateway_requests", "agentgateway_gen_ai"]);
    expect(samples).toHaveLength(5);
    expect(samples[0]).toEqual({
      name: "agentgateway_requests_total",
      labels: { gateway: "ns/gw", status: "200" },
      value: 582,
    });
    expect(samples.find((s) => s.name.endsWith("_sum"))?.value).toBe(12345);
    // cgroup gauge excluded by prefix filter
    expect(samples.some((s) => s.name.startsWith("agentgateway_cgroup"))).toBe(false);
  });

  it("handles escaped quotes and commas inside label values", () => {
    const text = 'm_total{path="/a,b",msg="say \\"hi\\""} 7\n';
    const [s] = parsePrometheusText(text, ["m_total"]);
    expect(s.labels.path).toBe("/a,b");
    expect(s.labels.msg).toBe('say "hi"');
  });

  it("ignores malformed lines and NaN values without throwing", () => {
    const text = "garbage line\nm_total{a=\"1\"} notanumber\nm_total{a=\"2\"} 5\n";
    const samples = parsePrometheusText(text, ["m_total"]);
    expect(samples).toHaveLength(1);
    expect(samples[0].value).toBe(5);
  });
});

describe("mergeSamples (multi-replica summation)", () => {
  it("sums values across pods for identical name+labels", () => {
    const podA = parsePrometheusText('m_total{x="1"} 10\nm_total{x="2"} 1\n', ["m_total"]);
    const podB = parsePrometheusText('m_total{x="1"} 5\n', ["m_total"]);
    const merged = mergeSamples([podA, podB]);
    expect(merged).toHaveLength(2);
    expect(merged.find((s) => s.labels.x === "1")?.value).toBe(15);
    expect(merged.find((s) => s.labels.x === "2")?.value).toBe(1);
  });

  it("treats different label values as distinct series", () => {
    const merged = mergeSamples([
      parsePrometheusText('m_total{x="1",y="a"} 1\n', ["m_total"]),
      parsePrometheusText('m_total{x="1",y="b"} 2\n', ["m_total"]),
    ]);
    expect(merged).toHaveLength(2);
  });
});
