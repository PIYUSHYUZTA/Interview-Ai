/**
 * Dependency-free runtime JSON *schema* validation.
 *
 * This is how the application enforces the rule that every AI-produced value
 * consumed by application logic is structured, schema-validated JSON. Providers
 * may guarantee JSON *syntax*; only this layer guarantees *semantics* (field
 * presence, types, numeric ranges). Core logic never touches unvalidated AI
 * output.
 *
 * No external dependency on purpose — validation is a handful of combinators
 * and stays trivially auditable.
 */

export type SchemaNode =
  | { readonly type: 'string'; readonly minLen?: number; readonly maxLen?: number }
  | { readonly type: 'number'; readonly min?: number; readonly max?: number; readonly integer?: boolean }
  | { readonly type: 'boolean' }
  | { readonly type: 'object'; readonly props: Readonly<Record<string, SchemaNode>>; readonly required: readonly string[] }
  | { readonly type: 'array'; readonly items: SchemaNode; readonly maxItems?: number }
  | { readonly type: 'enum'; readonly values: readonly (string | number)[] }
  | { readonly type: 'optional'; readonly inner: SchemaNode };

export const stringNode = (opts: { minLen?: number; maxLen?: number } = {}): SchemaNode => ({
  type: 'string',
  ...opts,
});

export const numberNode = (opts: { min?: number; max?: number; integer?: boolean } = {}): SchemaNode => ({
  type: 'number',
  ...opts,
});

export const booleanNode = (): SchemaNode => ({ type: 'boolean' });

export const objectNode = (opts: {
  props: Readonly<Record<string, SchemaNode>>;
  required?: readonly string[];
}): SchemaNode => ({
  type: 'object',
  props: opts.props,
  required: opts.required ?? Object.keys(opts.props),
});

export const arrayNode = (items: SchemaNode, opts: { maxItems?: number } = {}): SchemaNode => ({
  type: 'array',
  items,
  ...opts,
});

export const enumNode = (values: readonly (string | number)[]): SchemaNode => ({
  type: 'enum',
  values,
});

export const optional = (inner: SchemaNode): SchemaNode => ({ type: 'optional', inner });

/**
 * Validate a value against a schema. Returns a (possibly empty) list of
 * human-readable path-annotated violations.
 */
export function validateShape(value: unknown, node: SchemaNode, path = '$'): string[] {
  switch (node.type) {
    case 'optional':
      return value === undefined || value === null ? [] : validateShape(value, node.inner, path);

    case 'string': {
      if (typeof value !== 'string') return [`${path}: expected string, got ${typeName(value)}`];
      if (node.minLen !== undefined && value.length < node.minLen) {
        return [`${path}: string shorter than ${node.minLen} chars`];
      }
      if (node.maxLen !== undefined && value.length > node.maxLen) {
        return [`${path}: string longer than ${node.maxLen} chars`];
      }
      return [];
    }

    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return [`${path}: expected finite number, got ${typeName(value)}`];
      }
      const violations: string[] = [];
      if (node.integer === true && !Number.isInteger(value)) {
        violations.push(`${path}: expected integer, got ${value}`);
      }
      if (node.min !== undefined && value < node.min) {
        violations.push(`${path}: ${value} < min ${node.min}`);
      }
      if (node.max !== undefined && value > node.max) {
        violations.push(`${path}: ${value} > max ${node.max}`);
      }
      return violations;
    }

    case 'boolean': {
      return typeof value === 'boolean' ? [] : [`${path}: expected boolean, got ${typeName(value)}`];
    }

    case 'enum': {
      const ok = node.values.some((v) => v === value);
      return ok ? [] : [`${path}: value ${JSON.stringify(value)} not in allowed set`];
    }

    case 'array': {
      if (!Array.isArray(value)) return [`${path}: expected array, got ${typeName(value)}`];
      if (node.maxItems !== undefined && value.length > node.maxItems) {
        return [`${path}: more than ${node.maxItems} items`];
      }
      const errors: string[] = [];
      value.forEach((item, i) => {
        errors.push(...validateShape(item, node.items, `${path}[${i}]`));
      });
      return errors;
    }

    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return [`${path}: expected object, got ${typeName(value)}`];
      }
      const record = value as Record<string, unknown>;
      const errors: string[] = [];
      for (const key of node.required) {
        if (!(key in record)) {
          errors.push(`${path}.${key}: required field missing`);
        }
      }
      for (const [key, propNode] of Object.entries(node.props)) {
        if (key in record) {
          errors.push(...validateShape(record[key], propNode, `${path}.${key}`));
        }
      }
      return errors;
    }

    default:
      return [`${path}: unsupported schema node`];
  }
}

export interface ValidationResult<T> {
  readonly ok: boolean;
  /** Populated (and schema-valid) when ok === true. */
  readonly value: T | null;
  readonly errors: readonly string[];
}

/**
 * Validate and, if valid, return the value typed as T.
 * The cast is the ONLY place where validated data crosses into typed app code.
 */
export function validateSchema<T>(value: unknown, node: SchemaNode): ValidationResult<T> {
  const errors = validateShape(value, node);
  if (errors.length === 0) {
    return { ok: true, value: value as T, errors: [] };
  }
  return { ok: false, value: null, errors };
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}