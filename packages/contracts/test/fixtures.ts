import { openapiDocument, type SchemaName } from '../src/index.js';

type Schema = { $ref?: string; const?: unknown; enum?: unknown[]; examples?: unknown[]; oneOf?: Schema[]; anyOf?: Schema[]; type?: string; properties?: Record<string, Schema>; required?: string[]; items?: Schema; minItems?: number; minLength?: number; minimum?: number; exclusiveMinimum?: number; format?: string; pattern?: string; not?: unknown };
export const schemas = openapiDocument.components.schemas as unknown as Record<SchemaName, Schema>;
// Deterministic valid structural witnesses exercise every schema without inventing business facts.
export function witness(schema: Schema): unknown {
  if (schema.$ref) return fixture(schema.$ref.split('/').at(-1) as SchemaName);
  if (Object.hasOwn(schema, 'const')) return schema.const;
  if (schema.enum) return schema.enum[0];
  if (schema.examples) return schema.examples[0];
  if (schema.oneOf || schema.anyOf) return witness((schema.oneOf ?? schema.anyOf)![0]!);
  if (schema.type === 'object') return Object.fromEntries(Object.keys(schema.properties ?? {}).map(key => [key, witness(schema.properties![key]!)]));
  if (schema.type === 'array') return Array.from({ length: schema.minItems ?? 1 }, () => witness(schema.items!));
  if (schema.type === 'integer' || schema.type === 'number') return schema.minimum ?? (schema.exclusiveMinimum === undefined ? 0 : schema.exclusiveMinimum + 1);
  if (schema.type === 'boolean') return false;
  if (schema.type === 'null') return null;
  if (schema.type === 'string') {
    if (schema.format === 'uuid') return '00000000-0000-4000-8000-000000000001';
    if (schema.format === 'date-time') return '2026-11-10T00:00:00+08:00';
    if (schema.pattern) {
      if (schema.pattern.includes('[0-9]{2}')) return schema.not ? '0.01' : '0.00';
      if (schema.pattern.includes('[0-9]{1,6}')) return '0';
      if (schema.pattern.includes('[0-9]{1,2}')) return '0';
      throw new Error(`Unhandled fixture pattern: ${schema.pattern}`);
    }
    return 'x'.repeat(schema.minLength ?? 0);
  }
  throw new Error(`Unhandled witness schema ${JSON.stringify(schema)}`);
}
export function fixture(name: SchemaName): any { return witness(schemas[name]); }
