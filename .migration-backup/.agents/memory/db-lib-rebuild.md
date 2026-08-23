---
name: DB lib rebuild
description: Must rebuild lib declarations after adding new schema tables, before building artifact that imports from @workspace/db
---

## The rule

After adding new tables to `lib/db/src/schema/` and re-exporting from `lib/db/src/schema/index.ts`, run:

```bash
pnpm run typecheck:libs
```

before running `pnpm --filter @workspace/api-server run typecheck` or the build.

## Why

`lib/db` is a composite TypeScript project that emits declaration files. Artifact packages (like `api-server`) import from `@workspace/db` which resolves to these declaration files. If you skip `typecheck:libs`, the old declarations still don't export the new tables, and the artifact typecheck reports "Module '@workspace/db' has no exported member 'itemsTable'" even though the source is correct.

**How to apply:** Any time you add/rename tables in lib/db/src/schema/, run typecheck:libs first. The codegen script (`pnpm --filter @workspace/api-spec run codegen`) also runs typecheck:libs, so if you run codegen after a schema change it handles this automatically.
