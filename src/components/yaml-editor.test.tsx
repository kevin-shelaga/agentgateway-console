import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { YamlEditor } from "@/components/yaml-editor";
import schema from "@/lib/schemas/bundled/agentgatewaybackends.agentgateway.dev.json";

/**
 * Real CodeMirror mount (no mock): proves the editor, the yaml language
 * extension, and the AJV lint source construct without a browser. Deeper
 * interaction (diagnostics rendering, gutter) is verified in the browser.
 */
describe("YamlEditor (CodeMirror smoke)", () => {
  it("mounts and renders the document", () => {
    const { container } = render(
      <YamlEditor value={"kind: AgentgatewayBackend\nspec: {}\n"} onChange={() => {}} />,
    );
    const editor = container.querySelector(".cm-editor");
    expect(editor).not.toBeNull();
    expect(container.textContent).toContain("AgentgatewayBackend");
  });

  it("mounts read-only with a schema attached", () => {
    const { container } = render(
      <YamlEditor
        value="a: 1"
        onChange={() => {}}
        readOnly
        schema={(schema as { versions: Record<string, object> }).versions.v1alpha1}
      />,
    );
    expect(container.querySelector(".cm-editor")).not.toBeNull();
  });
});
