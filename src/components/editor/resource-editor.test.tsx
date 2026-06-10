import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import { ResourceEditor, type ResourceFormProps } from "@/components/editor/resource-editor";
import { getResource } from "@/lib/registry";
import { namespaceList } from "@/test/fixtures";
import { mockFetch, renderWithProviders, type FetchRoute } from "@/test/utils";

const { push, back } = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
beforeEach(() => {
  push.mockClear();
  back.mockClear();
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    back,
    replace: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/yaml-editor", () => ({
  YamlEditor: ({
    value,
    onChange,
    readOnly,
  }: {
    value: string;
    onChange: (v: string) => void;
    readOnly?: boolean;
  }) => (
    <textarea
      data-testid="yaml"
      readOnly={readOnly}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const desc = getResource("gateways")!;

function routes(extra: FetchRoute[] = []): FetchRoute[] {
  return [
    { match: "/api/resources/core/v1/namespaces", body: { items: namespaceList } },
    ...extra,
  ];
}

function renderEditor({
  extraRoutes = [],
  mode = "create" as const,
  Form,
  initial = desc.template("default"),
}: {
  extraRoutes?: FetchRoute[];
  mode?: "create" | "update";
  Form?: React.ComponentType<ResourceFormProps>;
  initial?: ReturnType<typeof desc.template>;
} = {}) {
  const spy = mockFetch(routes(extraRoutes));
  const result = renderWithProviders(
    <ResourceEditor desc={desc} initial={initial} mode={mode} Form={Form} />,
  );
  return { spy, ...result };
}

function yamlBox(): HTMLTextAreaElement {
  return screen.getByTestId("yaml") as HTMLTextAreaElement;
}

describe("ResourceEditor two-way sync", () => {
  it("propagates form edits into the YAML text", () => {
    renderEditor();
    const name = screen.getByLabelText("Name");
    fireEvent.change(name, { target: { value: "renamed-gateway" } });
    expect(yamlBox().value).toContain("name: renamed-gateway");
  });

  it("propagates YAML edits into the form", () => {
    renderEditor();
    const doc = desc.template("default");
    doc.metadata.name = "from-yaml";
    fireEvent.change(yamlBox(), { target: { value: stringify(doc, { indent: 2 }) } });
    expect(screen.getByLabelText("Name")).toHaveValue("from-yaml");
  });

  it("a Form's onChange drives the YAML text", () => {
    const MutateForm = ({ doc, onChange }: ResourceFormProps) => (
      <button
        type="button"
        onClick={() => onChange({ ...doc, spec: { ...(doc.spec as object), custom: "marker" } })}
      >
        mutate-spec
      </button>
    );
    renderEditor({ Form: MutateForm });
    fireEvent.click(screen.getByRole("button", { name: "mutate-spec" }));
    expect(yamlBox().value).toContain("custom: marker");
  });
});

describe("ResourceEditor YAML parse errors", () => {
  it("pauses the form and disables Validate/Save until the YAML parses again", () => {
    renderEditor();
    fireEvent.change(yamlBox(), { target: { value: "metadata: [unclosed" } });

    expect(screen.getByText(/form is paused/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Validate \(dry-run\)/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Create/ })).toBeDisabled();

    fireEvent.change(yamlBox(), {
      target: { value: stringify(desc.template("default"), { indent: 2 }) },
    });
    expect(screen.queryByText(/form is paused/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Validate \(dry-run\)/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Create/ })).toBeEnabled();
  });

  it("treats non-mapping YAML documents as parse errors", () => {
    renderEditor();
    fireEvent.change(yamlBox(), { target: { value: "just a scalar" } });
    expect(screen.getByText(/document must be a YAML mapping/)).toBeInTheDocument();
  });
});

describe("ResourceEditor schema validation", () => {
  it("lists schema issues from the fetched CRD schema", async () => {
    const schema = {
      type: "object",
      properties: {
        spec: {
          type: "object",
          required: ["mustHave"],
          properties: { mustHave: { type: "string" } },
        },
      },
    };
    renderEditor({
      extraRoutes: [
        {
          match: "/api/schemas/",
          body: { name: desc.crdName, versions: { v1: schema }, source: "bundled" },
        },
      ],
    });

    expect(await screen.findByText(/Schema validation \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/mustHave/)).toBeInTheDocument();
    expect(screen.getByText("bundled")).toBeInTheDocument();
  });
});

describe("ResourceEditor dry-run", () => {
  it("shows the success line when the API server accepts the manifest", async () => {
    renderEditor({ extraRoutes: [{ match: "/api/dry-run", body: { ok: true } }] });
    fireEvent.click(screen.getByRole("button", { name: /Validate \(dry-run\)/ }));
    expect(await screen.findByText(/Dry-run passed/)).toBeInTheDocument();
  });

  it("shows API server rejection with field causes on 422", async () => {
    renderEditor({
      extraRoutes: [
        {
          match: "/api/dry-run",
          status: 422,
          body: {
            error: {
              status: 422,
              reason: "Invalid",
              message: "Gateway is invalid",
              causes: [
                { field: "spec.gatewayClassName", message: "Unsupported value", reason: "FieldValueNotSupported" },
              ],
            },
          },
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /Validate \(dry-run\)/ }));
    expect(await screen.findByText(/Rejected by the API server/)).toBeInTheDocument();
    expect(screen.getByText("spec.gatewayClassName")).toBeInTheDocument();
    expect(screen.getByText(/Unsupported value/)).toBeInTheDocument();
  });
});

describe("ResourceEditor save", () => {
  it("dry-runs, then POSTs, then navigates to the saved resource", async () => {
    const saved = desc.template("default");
    const { spy } = renderEditor({
      extraRoutes: [
        { match: "/api/dry-run", body: { ok: true } },
        { match: "/api/resources/gateway.networking.k8s.io/v1/gateways", body: saved },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: /Create/ }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/resources/gateways/default/my-gateway"),
    );

    const posts = spy.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
      .map(([url]) => String(url));
    expect(posts[0]).toContain("/api/dry-run");
    expect(posts[1]).toContain("/api/resources/gateway.networking.k8s.io/v1/gateways");
    expect(posts).toHaveLength(2);
  });

  it("surfaces a save rejection in the validation panel instead of navigating", async () => {
    renderEditor({
      extraRoutes: [
        {
          match: "/api/dry-run",
          status: 422,
          body: {
            error: { status: 422, reason: "Invalid", message: "bad manifest", causes: [] },
          },
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /Create/ }));
    expect(await screen.findByText(/Rejected by the API server/)).toBeInTheDocument();
    expect(screen.getByText("bad manifest")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("Cancel navigates back", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(back).toHaveBeenCalled();
  });
});

describe("ResourceEditor view tabs", () => {
  it("toggles form/YAML visibility across Split, Form and YAML views", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderEditor();

    // Split (default): both panes visible.
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByTestId("yaml")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Form" }));
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.queryByTestId("yaml")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "YAML" }));
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByTestId("yaml")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Split" }));
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByTestId("yaml")).toBeInTheDocument();
  });
});

describe("ResourceEditor without a guided form", () => {
  it("shows the YAML-only hint when no Form is registered", () => {
    renderEditor({ Form: undefined });
    expect(screen.getByText(/No guided form for Gateway yet/)).toBeInTheDocument();
  });
});
