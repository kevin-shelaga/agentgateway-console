export interface K8sErrorCause {
  field?: string;
  reason?: string;
  message: string;
}

export interface ParsedK8sError {
  status: number;
  reason: string;
  message: string;
  causes: K8sErrorCause[];
}

export function parseK8sError(err: unknown): ParsedK8sError {
  // @kubernetes/client-node v1 throws ApiException with .code and .body (JSON string or object)
  const fallback: ParsedK8sError = {
    status: 500,
    reason: "Unknown",
    message: err instanceof Error ? err.message : String(err),
    causes: [],
  };
  const anyErr = err as { code?: number; body?: unknown };
  if (!anyErr?.body) return fallback;
  let body: Record<string, unknown>;
  try {
    body =
      typeof anyErr.body === "string"
        ? JSON.parse(anyErr.body)
        : (anyErr.body as Record<string, unknown>);
  } catch {
    return { ...fallback, status: anyErr.code ?? 500 };
  }
  const details = (body.details ?? {}) as { causes?: K8sErrorCause[] };
  return {
    status: (body.code as number) ?? anyErr.code ?? 500,
    reason: (body.reason as string) ?? "Unknown",
    message: (body.message as string) ?? fallback.message,
    causes: details.causes ?? [],
  };
}
