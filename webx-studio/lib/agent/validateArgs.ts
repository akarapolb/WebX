// The subset of JSON Schema the agent's tool parameters use. A malformed
// call comes back with field-level errors the model can fix on its next
// turn, instead of failing somewhere inside the tool.

const DESCRIBE: Record<string, string> = {
  object: "an object", array: "an array", string: "a string", integer: "an integer",
  number: "a number", boolean: "true or false", null: "null",
};

function typeOk(type: string, v: unknown): boolean {
  switch (type) {
    case "object": return Boolean(v) && typeof v === "object" && !Array.isArray(v);
    case "array": return Array.isArray(v);
    case "string": return typeof v === "string";
    case "integer": return typeof v === "number" && Number.isInteger(v);
    case "number": return typeof v === "number" && Number.isFinite(v);
    case "boolean": return typeof v === "boolean";
    case "null": return v === null;
    default: return true;
  }
}

const join = (path: string, key: string) => (path ? `${path}.${key}` : key);

function check(schema: any, v: unknown, path: string, errors: string[]): void {
  if (!schema || typeof schema !== "object") return;
  const name = path || "arguments";

  if (schema.type) {
    const types: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeOk(t, v))) {
      errors.push(`${name} must be ${types.map((t) => DESCRIBE[t] || t).join(" or ")}`);
      return;
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e: unknown) => e === v)) {
    errors.push(`${name} must be one of: ${schema.enum.map((e: unknown) => JSON.stringify(e)).join(", ")}`);
  }
  if (typeof v === "string") {
    if (typeof schema.minLength === "number" && v.length < schema.minLength) errors.push(`${name} must be at least ${schema.minLength} characters`);
    if (typeof schema.maxLength === "number" && v.length > schema.maxLength) errors.push(`${name} must be at most ${schema.maxLength} characters`);
  }
  if (typeof v === "number") {
    if (typeof schema.minimum === "number" && v < schema.minimum) errors.push(`${name} must be at least ${schema.minimum}`);
    if (typeof schema.maximum === "number" && v > schema.maximum) errors.push(`${name} must be at most ${schema.maximum}`);
  }
  if (Array.isArray(v)) {
    if (typeof schema.minItems === "number" && v.length < schema.minItems) errors.push(`${name} must have at least ${schema.minItems} item(s)`);
    if (typeof schema.maxItems === "number" && v.length > schema.maxItems) errors.push(`${name} must have at most ${schema.maxItems} item(s)`);
    if (schema.items) v.forEach((x, i) => check(schema.items, x, `${name}[${i}]`, errors));
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>;
    const props: Record<string, any> = schema.properties || {};
    for (const key of Array.isArray(schema.required) ? schema.required : []) {
      if (obj[key] === undefined) errors.push(`${join(path, key)} is required`);
    }
    for (const [key, value] of Object.entries(obj)) {
      if (props[key]) check(props[key], value, join(path, key), errors);
      else if (schema.additionalProperties === false) {
        const accepted = Object.keys(props);
        errors.push(`${join(path, key)} is not an accepted argument (accepted: ${accepted.length ? accepted.join(", ") : "none"})`);
      }
    }
  }
}

/** Problems with `value` against `schema`, at most 8, as short sentences. */
export function validateArgs(schema: Record<string, any>, value: unknown): string[] {
  const errors: string[] = [];
  check(schema, value, "", errors);
  return errors.slice(0, 8);
}
