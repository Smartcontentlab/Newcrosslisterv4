---
name: Orval schema naming
description: Rule for naming OpenAPI body schemas to avoid TS2308 export collisions in api-zod barrel
---

## The rule

Every request body schema in `components/schemas` must use **entity-shaped names** (e.g. `ItemInput`, `ItemPatch`, `ListingInput`) — never `CreateItemBody` or `UpdateItemBody`.

## Why

Orval auto-derives a Zod schema named `<OperationIdPascal>Body` (e.g. `createItem` → `CreateItemBody`) in `generated/api.ts`. It also emits a TypeScript interface for any `$ref`'d schema into `generated/types/`. The `lib/api-zod` barrel does `export * from` both files. If your component is named `CreateItemBody`, both files export a member with that name → TS2308 collision → typecheck:libs fails.

## How to apply

Name body schemas after the entity + `Input` / `Patch` / `Update`:
- `ItemInput` (not `CreateItemBody`)
- `ItemPatch` (not `UpdateItemBody`)

Also avoid naming response schemas `<OperationId>Response` — confirmed collision on `AiChatResponse` (operationId: `aiChat`). Renamed to `AssistantReply`.
