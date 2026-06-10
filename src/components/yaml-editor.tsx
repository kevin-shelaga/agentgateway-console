"use client";

import * as React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import * as YAML from "yaml";
import { compileValidator } from "@/lib/validation";

export interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** openAPIV3Schema for live AJV diagnostics. */
  schema?: object | null;
  readOnly?: boolean;
  height?: string;
}

const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    fontSize: "13px",
    fontFamily: "var(--font-geist-mono)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
  },
});

/** Resolve a dot-notation issue path to a [from, to] range in the YAML document. */
function rangeForPath(doc: YAML.Document.Parsed, path: string): [number, number] {
  const segments = path === "" ? [] : path.split(".").map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg));
  // Walk back up the path until we find a node with a range.
  for (let depth = segments.length; depth >= 0; depth--) {
    const node = doc.getIn(segments.slice(0, depth), true);
    if (YAML.isNode(node) && node.range) {
      return [node.range[0], node.range[1]];
    }
  }
  return [0, 0];
}

function buildLintSource(schema?: object | null) {
  return (view: EditorView): Diagnostic[] => {
    const text = view.state.doc.toString();
    const docLength = view.state.doc.length;
    const clamp = (n: number) => Math.max(0, Math.min(n, docLength));

    const parsed = YAML.parseDocument(text);
    if (parsed.errors.length > 0) {
      return parsed.errors.map((err) => {
        const from = clamp(err.pos[0]);
        const to = clamp(Math.max(err.pos[1], from));
        return { from, to, severity: "error" as const, message: err.message };
      });
    }

    if (!schema) return [];
    const js: unknown = parsed.toJS();
    return compileValidator(schema)(js).map((issue) => {
      const [from, to] = rangeForPath(parsed, issue.path);
      return {
        from: clamp(from),
        to: clamp(Math.max(to, from)),
        severity: "error" as const,
        message: issue.path ? `${issue.path}: ${issue.message}` : issue.message,
      };
    });
  };
}

export function YamlEditor({
  value,
  onChange,
  schema,
  readOnly = false,
  height = "100%",
}: YamlEditorProps): React.JSX.Element {
  const extensions = React.useMemo(
    () => [yaml(), lintGutter(), linter(buildLintSource(schema)), editorTheme],
    [schema],
  );

  return (
    <div className="h-full w-full [&_.cm-editor]:h-full [&_.cm-editor]:bg-transparent [&_.cm-editor]:outline-none">
      <CodeMirror
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        height={height}
        theme="none"
        basicSetup={{ lineNumbers: true, foldGutter: true }}
        extensions={extensions}
      />
    </div>
  );
}
