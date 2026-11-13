import { Ajv2020 } from 'ajv/dist/2020.js';
import { default as formats } from 'ajv-formats';
import type { ErrorObject, ValidateFunction, AnySchema } from 'ajv';
import document from './generated/openapi.json' with { type: 'json' };
import type { components } from './generated/types.js';
export type { components, operations, paths } from './generated/types.js';

export type Schemas = components['schemas'];
export type SchemaName = keyof Schemas;
export type SchemaValue<N extends SchemaName> = Schemas[N];
export type Role = Schemas['User']['role'];

type Schema = {
  $ref?: string;
  type?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
};

// Consumers receive immutable metadata; validators never strip, coerce, or fill input.
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const openapiDocument = freeze(document);
export const schemaNames = Object.freeze(Object.keys(document.components.schemas) as SchemaName[]);
const schemaId = 'https://huoyoupu.local/contracts';
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, coerceTypes: false, removeAdditional: false, useDefaults: false });
// ajv-formats' CommonJS declaration needs its explicit default under NodeNext.
const addFormats = formats as unknown as (instance: Ajv2020) => void;
addFormats(ajv);
ajv.addKeyword({ keyword: 'x-allowed-groupings', valid: true });
ajv.addKeyword({ keyword: 'components', schemaType: 'object', valid: true });
ajv.addSchema({ $id: schemaId, components: document.components } as AnySchema);
const validators = new Map<SchemaName, ValidateFunction>();
for (const name of schemaNames) {
  const validate = ajv.getSchema(`${schemaId}#/components/schemas/${name}`);
  if (!validate) throw new Error(`Missing contract schema: ${name}`);
  validators.set(name, validate);
}

export function getSchemaValidator<N extends SchemaName>(name: N): ValidateFunction<Schemas[N]> {
  const validator = validators.get(name);
  if (!validator) throw new Error(`Unknown contract schema: ${name}`);
  return validator as ValidateFunction<Schemas[N]>;
}

export function validateSchema<N extends SchemaName>(name: N, value: unknown): value is Schemas[N] {
  return getSchemaValidator(name)(value);
}

export class ContractValidationError extends Error {
  readonly schema: string;
  readonly issues: readonly ErrorObject[];
  constructor(schema: string, issues: readonly ErrorObject[]) {
    super(`Value does not satisfy ${schema}`);
    this.name = 'ContractValidationError';
    this.schema = schema;
    // Do not include received values or SQL/stack details in public HTTP responses.
    this.issues = structuredClone(issues);
  }
}

export function parseSchema<N extends SchemaName>(name: N, value: unknown): Schemas[N] {
  const validate = getSchemaValidator(name);
  if (!validate(value)) throw new ContractValidationError(name, validate.errors ?? []);
  return value;
}

export type OrderResponseKind = 'detail' | 'page' | 'revision' | 'revisions';
type OrderResponseNames = {
  admin: { detail: 'OrderAdmin'; page: 'OrderPageAdmin'; revision: 'OrderAdmin'; revisions: 'OrderRevisionPage' };
  employee: { detail: 'OrderPublic'; page: 'OrderPagePublic'; revision: 'OrderPublic'; revisions: 'OrderRevisionPage' };
};
export type OrderResponse<R extends Role, K extends OrderResponseKind> = Schemas[OrderResponseNames[R][K]];
const orderOperations = { detail: 'getOrder', page: 'listOrders', revision: 'getOrderRevision', revisions: 'listOrderRevisions' } as const;

export function orderResponseSchema<R extends Role, K extends OrderResponseKind>(role: R, kind: K): OrderResponseNames[R][K] {
  if (role !== 'admin' && role !== 'employee') throw new Error('Unknown role');
  const operationId = orderOperations[kind];
  for (const pathItem of Object.values(document.paths)) {
    for (const candidate of Object.values(pathItem)) {
      const op = candidate as unknown as { operationId?: string; 'x-response-schema-by-role'?: Record<Role, string>; responses?: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }> };
      if (op.operationId !== operationId) continue;
      const ref = op['x-response-schema-by-role']?.[role] ?? op.responses?.['200']?.content?.['application/json']?.schema?.$ref;
      if (!ref?.startsWith('#/components/schemas/')) throw new Error(`Missing role response schema: ${operationId}`);
      return ref.slice('#/components/schemas/'.length) as OrderResponseNames[R][K];
    }
  }
  throw new Error(`Missing order response operation: ${operationId}`);
}

/** Validate the selected role directly. An admin DTO must fail employee validation. */
export function parseOrderResponse<R extends Role, K extends OrderResponseKind>(role: R, kind: K, value: unknown): OrderResponse<R, K> {
  return parseSchema(orderResponseSchema(role, kind), value) as OrderResponse<R, K>;
}

// Only the selected schema's declared properties are copied, including nested rows.
function project(schema: Schema, value: unknown): unknown {
  if (schema.$ref) {
    const name = schema.$ref.slice('#/components/schemas/'.length) as SchemaName;
    return project(document.components.schemas[name] as Schema, value);
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items) return value.map(item => project(schema.items!, item));
  if (schema.type === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(schema.properties ?? {}).filter(([key]) => Object.hasOwn(value, key)).map(([key, child]) => [key, project(child, (value as Record<string, unknown>)[key])]));
  }
  return value;
}

/** Explicit projection is separate from strict validation; it never mutates its source. */
export function projectOrderResponse<R extends Role, K extends OrderResponseKind>(role: R, kind: K, value: unknown): OrderResponse<R, K> {
  const name = orderResponseSchema(role, kind);
  return parseOrderResponse(role, kind, project(document.components.schemas[name] as Schema, value));
}

import type { operations } from './generated/types.js';
export type OperationId = keyof operations;
type Parameter = { name: string; in: 'path' | 'query' | 'header'; required?: boolean; schema: AnySchema };
type Response = { $ref?: string; content?: Record<string, { schema: AnySchema }> };
type Operation = {
  operationId: OperationId;
  parameters?: ({ $ref: string } | Parameter)[];
  requestBody?: { required?: boolean; content: Record<string, { schema: AnySchema }> };
  responses: Record<string, Response>;
  'x-response-schema-by-role'?: Record<Role, string>;
  'x-roles': (Role | 'public')[];
};
const operationMap = new Map<OperationId, Operation>();
const requestValidators = new Map<OperationId, ValidateFunction>();
const responseValidators = new Map<string, ValidateFunction>();
function absoluteRefs<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replaceAll('"#/components/', `"${schemaId}#/components/`)) as T;
}
for (const pathItem of Object.values(document.paths)) {
  for (const candidate of Object.values(pathItem)) {
    const operation = candidate as unknown as Operation;
    if (!operation.operationId) continue;
    operationMap.set(operation.operationId, operation);
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [location, field] of [['path', 'path'], ['query', 'query'], ['header', 'headers']] as const) {
      const params = (operation.parameters ?? []).map(parameter => '$ref' in parameter ? (document.components.parameters as Record<string, Parameter>)[parameter.$ref.split('/').at(-1)!]! : parameter).filter(parameter => parameter.in === location);
      properties[field] = { type: 'object', properties: Object.fromEntries(params.map(parameter => [parameter.name, parameter.schema])), required: params.filter(parameter => parameter.required).map(parameter => parameter.name), additionalProperties: false };
      if (params.some(parameter => parameter.required)) required.push(field);
    }
    if (operation.requestBody) {
      properties.body = operation.requestBody.content['application/json']!.schema;
      if (operation.requestBody.required) required.push('body');
    }
    requestValidators.set(operation.operationId, ajv.compile(absoluteRefs({ type: 'object', properties, required, additionalProperties: false })));
    for (const [status, definition] of Object.entries(operation.responses)) {
      const response = definition.$ref ? (document.components.responses as Record<string, Response>)[definition.$ref.split('/').at(-1)!]! : definition;
      for (const role of ['admin', 'employee', 'public'] as const) {
        const roleRef = Number(status) < 300 && role !== 'public' ? operation['x-response-schema-by-role']?.[role] : undefined;
        const schema = roleRef ? { $ref: roleRef } : response.content?.['application/json']?.schema;
        // No content means the only accepted JS value is undefined (e.g. HTTP 204).
        if (schema) responseValidators.set(`${operation.operationId}:${status}:${role}`, ajv.compile(absoluteRefs(schema)));
      }
    }
  }
}
export const operationIds = Object.freeze([...operationMap.keys()]);
type ParametersFor<O extends OperationId, P extends 'path' | 'query' | 'header'> = operations[O] extends { parameters: infer T } ? P extends keyof T ? T[P] : never : never;
type BodyFor<O extends OperationId> = operations[O] extends { requestBody: { content: { 'application/json': infer T } } } ? T : never;
export type OperationRequest<O extends OperationId> = {
  path?: ParametersFor<O, 'path'>;
  query?: ParametersFor<O, 'query'>;
  headers?: ParametersFor<O, 'header'>;
  body?: BodyFor<O>;
};

/** Parameters are decoded JSON values. Pass only declared headers, using OpenAPI casing. */
export function parseOperationRequest<O extends OperationId>(operationId: O, value: unknown): OperationRequest<O> {
  const validate = requestValidators.get(operationId);
  if (!validate) throw new Error(`Unknown operation: ${operationId}`);
  if (!validate(value)) throw new ContractValidationError(`${operationId}:request`, validate.errors ?? []);
  return value as OperationRequest<O>;
}

/** Call after authentication; success authorization is checked before response validation. */
type ResponseBody<O extends OperationId, S extends number> = S extends keyof operations[O]['responses']
  ? operations[O]['responses'][S] extends { content: { 'application/json': infer T } } ? T : undefined
  : never;
export type OperationResponse<O extends OperationId, S extends number, R extends Role | 'public'> = S extends 200
  ? O extends 'getOrder' | 'getOrderRevision' ? R extends Role ? OrderResponse<R, 'detail'> : never
    : O extends 'listOrders' ? R extends Role ? OrderResponse<R, 'page'> : never : ResponseBody<O, S>
  : ResponseBody<O, S>;
export function parseOperationResponse<O extends OperationId, S extends number, R extends Role | 'public'>(operationId: O, status: S, role: R, value: unknown): OperationResponse<O, S, R> {
  const operation = operationMap.get(operationId);
  if (!operation) throw new Error(`Unknown operation: ${operationId}`);
  if (role !== 'admin' && role !== 'employee' && role !== 'public') throw new Error('Unknown role');
  if (!Object.hasOwn(operation.responses, String(status))) throw new Error(`Undocumented status: ${operationId}:${status}`);
  if (status < 300 && !operation['x-roles'].includes('public') && !operation['x-roles'].includes(role)) throw new Error(`Role cannot access operation: ${operationId}`);
  const validate = responseValidators.get(`${operationId}:${status}:${role}`);
  if (validate ? !validate(value) : value !== undefined) throw new ContractValidationError(`${operationId}:${status}:${role}`, validate?.errors ?? []);
  return value as OperationResponse<O, S, R>;
}
