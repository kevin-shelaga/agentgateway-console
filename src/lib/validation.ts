import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import * as YAML from "yaml";

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Formats used by K8s CRD schemas that should validate as no-ops. */
const NOOP_FORMATS = ["int32", "int64", "byte", "int-or-string", "date-time"];

let ajvInstance: Ajv | null = null;

function getAjv(): Ajv {
  if (ajvInstance) return ajvInstance;
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  for (const fmt of NOOP_FORMATS) {
    if (!ajv.formats[fmt]) ajv.addFormat(fmt, () => true);
  }
  ajvInstance = ajv;
  return ajv;
}

/** Convert an AJV instancePath ("/spec/static/port") to dot notation ("spec.static.port"). */
function toDotPath(instancePath: string): string {
  return instancePath
    .split("/")
    .filter((seg) => seg !== "")
    .map((seg) => seg.replace(/~1/g, "/").replace(/~0/g, "~"))
    .join(".");
}

function toIssue(err: ErrorObject): ValidationIssue {
  let message = err.message ?? "invalid";
  if (err.keyword === "required") {
    const missing = (err.params as { missingProperty?: string }).missingProperty;
    if (missing && !message.includes(missing)) message = `${message}: ${missing}`;
  }
  return { path: toDotPath(err.instancePath), message };
}

const validatorCache = new Map<object, (doc: unknown) => ValidationIssue[]>();

/**
 * Compile a CRD openAPIV3Schema into a validator returning structured issues.
 *
 * Notes:
 * - AJV runs with strict:false so x-kubernetes-* vendor keywords
 *   (x-kubernetes-validations, x-kubernetes-int-or-string, ...) are ignored.
 * - CEL rules (x-kubernetes-validations) are NOT evaluated; only structural
 *   openAPI constraints are checked.
 * - Compiled validators are cached by schema object reference.
 */
export function compileValidator(openAPIV3Schema: object): (doc: unknown) => ValidationIssue[] {
  const cached = validatorCache.get(openAPIV3Schema);
  if (cached) return cached;

  const ajv = getAjv();
  const validate: ValidateFunction = ajv.compile(openAPIV3Schema);

  const validator = (doc: unknown): ValidationIssue[] => {
    if (validate(doc)) return [];
    return (validate.errors ?? []).map(toIssue);
  };

  validatorCache.set(openAPIV3Schema, validator);
  return validator;
}

/** Validate YAML syntax only. Returns one issue per parse error, with line/col in the message. */
export function validateYamlSyntax(text: string): ValidationIssue[] {
  const doc = YAML.parseDocument(text);
  return doc.errors.map((err) => {
    const pos = err.linePos?.[0];
    const where = pos ? ` (line ${pos.line}, col ${pos.col})` : "";
    return { path: "", message: `${err.message}${where}` };
  });
}
