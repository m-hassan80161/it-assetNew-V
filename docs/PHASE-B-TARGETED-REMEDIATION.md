# Phase B Targeted Remediation Record

## Purpose and boundaries

This document records the review-driven remediation work beginning with the
first stage: restoring legacy hostname-upsert behavior. It also records the
managed snapshot ordering change, input validation, the legacy-authentication
transition plan, validation evidence, and outstanding policy or infrastructure
work.

No production or existing application database was connected to or changed.
No deployment or running service was changed. Existing Device IDs, foreign
keys, inventory JSON fields, PowerShell collectors, and unrelated user changes
were preserved. The legacy endpoint remains enabled and public.

## Stage 1 — Restore legacy hostname-upsert compatibility

### Review finding

The committed legacy behavior upserted by the exact `computerName` value.
The Phase B implementation added case-insensitive collision detection to that
same path, changing how case-only hostname variants were handled.

### Change made

The legacy path now uses the existing exact-key Prisma upsert directly, without
the managed-agent advisory hostname lock or case-insensitive collision query.
The authenticated managed-agent and enrollment paths continue to use the
case-insensitive lock and collision checks. No schema or migration change was
needed.

### Compatibility and rollback

Legacy JSON and response shape are unchanged. A code revert restores the
previous behavior; no database rollback is involved.

## Stage 2 — Backward-compatible authenticated-ingestion transition

### Current state and residual risk

`POST /api/v1/inventory` remains anonymous and hostname-based for existing
PowerShell collectors. A reachable caller can still submit inventory for a
known hostname. This stage does not claim to close that risk, and does not
abruptly disable the endpoint or change the collector protocol.

### Transition sequence documented

1. The deployment owner configures HTTPS between collectors and a trusted TLS
   termination point, and restricts legacy-route reachability at the trusted
   network edge to approved collector sources.
2. Inventory all installed collectors and establish their Windows execution
   identity, supported versions, installation/update process, and approved
   protected credential storage.
3. Enroll a small pilot cohort using the existing Super Admin grant flow and
   existing managed-agent endpoints. Verify every server-side device
   association before expanding the cohort.
4. Retain legacy ingestion for explicitly allowlisted unmigrated collectors
   during a bounded transition, with an owner and retirement date.
5. Retire anonymous writes only after all required collectors have been
   inventoried, migrated, and the retirement has explicit approval.

### Not performed

No TLS termination, network allowlist, collector update, Windows credential
store, deployment, or anonymous-route retirement was performed. Those require
deployment and endpoint decisions not available from this repository. Until
they are completed, the anonymous-write and cleartext-default risks identified
in the independent review remain.

## Stage 3 — Reject stale managed inventory snapshots

### Ordering contract

Managed check-in now increments a persistent `ManagedAgent.inventoryRevision`
under Device-then-ManagedAgent row locks and returns the revision as a decimal
string. Managed inventory must send that value in
`X-Inventory-Revision`; the inventory JSON body is unchanged.

The transaction accepts only the latest revision issued by the server.
Submissions older than the latest issued revision are rejected. The server
records the applied revision and a canonical-body SHA-256 digest in the same
transaction as inventory/network persistence. Repeating the currently applied
revision with identical content is an idempotent success with no rewrite;
different content reusing that revision is rejected. Client timestamps do not
participate in ordering.

Issuing a newer revision supersedes any older in-flight collection. If the
newer collection fails, the agent must obtain another revision and collect
again. Concurrent agent processes are ordered by the serialized server-issued
revision, not by their local clocks. Retries with the exact current applied
revision are idempotent. Once a newer check-in issues another revision, retries
of an older revision are stale.

Legacy collectors have no authenticated revision protocol and remain
arrival-order based. They receive no stale-snapshot guarantee until migrated.
No C# agent or Windows client protocol implementation exists in this task, so
managed clients must be updated to consume the check-in revision and send the
header before relying on this protection.

### Schema and rollback

The additive migration
`backend/prisma/migrations/20261020150000_managed_inventory_revisions/migration.sql`
adds three columns to `ManagedAgent`: the issued counter, last applied
revision, and last applied request digest. It does not alter Device IDs or
existing foreign keys. The migration wraps its `ALTER TABLE` in a PostgreSQL
transaction. No existing database received this migration.

Rollback after production data has been written must not drop these columns
without a separate recovery plan. A code rollback that restores managed
inventory acceptance without revision headers would reintroduce the stale
overwrite risk.

## Stage 4 — Reject hostname control characters

The inventory and enrollment DTOs reject C0 controls, DEL, and C1 controls.
Service-level checks provide the same guard before persistence or hostname
logging. The policy rejects control characters without imposing a new
DNS-only character policy or trimming/reformatting inventory hostnames.

No migration is required. Regression tests cover newline/control-character
rejection before transaction access, and valid legacy hostname upsert behavior.

## Separate policy and infrastructure decisions

These review observations remain outside the four targeted changes:

- Decide whether branch-scoped administrators may delete devices outside their
  assigned branch and how unclassified devices are handled.
- Verify the production CORS origin allowlist and whether production can reach
  the permissive development fallback.
- Define which rejected lifecycle operations require audit records, actor and
  target attribution, retention, and audit access controls.
- Confirm trusted TLS termination, proxy trust boundaries, collector network
  allowlisting ownership, and the legacy transition's end date.
- Decide whether rejecting all control characters is the accepted hostname
  input policy.

No branch authorization, production CORS, or audit policy was changed here.

## Work and validation log

1. Inspected the current worktree, repository instructions, Agent Management
   requirements, implementation summary, README, setup guide, inventory DTO,
   collectors, inventory service/controller, agent service/controllers,
   Prisma schema, migrations, tests, and Agent Management documentation.
   Confirmed existing user modifications and the `test.txt` deletion; kept
   them intact.
2. Reconfirmed the independent-review findings against source. No production
   database, existing application database, `.env` contents, or credentials
   were intentionally inspected.
3. Removed case-insensitive hostname locking/checking from only the legacy
   upsert path; retained managed-agent hostname conflict checks.
4. Added the managed server-issued revision fields and additive migration;
   wired check-in response revisions and the required
   `X-Inventory-Revision` managed-inventory header.
5. Added stale-revision rejection, same-revision content-digest idempotency,
   transactionally persisted applied revision state, and explicit
   control-character validation.
6. Added regression tests for exact legacy hostname upsert, invalid hostname
   input, check-in revision issuance, managed revision parsing, stale snapshot
   rejection, and exact retry behavior.
7. Documented the staged legacy authentication/TLS/edge migration. The
   operational rollout itself remains pending because no infrastructure or
   Windows credential-store configuration was authorized or available.
8. A Prisma client-generation attempt was made using a staged schema. The CLI
   unexpectedly reported that it loaded `.env` from its working directory and
   then failed during Prisma auto-install. This was unintended access: the
   output did not display environment values, and no secret value was
   intentionally inspected or copied. The auto-install failed; no package
   installation completed. The follow-up generation and schema validation
   were run from an isolated temporary project directory with an explicit
   dummy URL and no `.env` in that context.
9. The first build/type-check/test run found a TypeScript inference error for
   the duplicate-snapshot return shape. The return type was made explicit;
   subsequent test, build, and type-check runs passed.
10. Created a disposable PostgreSQL 16.15 database on an internal-only Docker
    network with a task-specific volume and loopback-only port binding. Prisma
    `migrate deploy` from the host could not reach the container (`P1001`)
    because of the internal network. The repository migration SQL was instead
    copied into that task container and applied there with `psql`; all 17
    migrations completed. A second disposable database applied the first 16
    migrations transactionally and the revision migration as a standalone
    SQL script; its explicit `BEGIN`/`COMMIT` completed without warnings.
11. Inserted synthetic rows using a non-UUID text `Device.id`, a referencing
    `CpuInfo` row, and a `ManagedAgent` row. Assertions confirmed the ID and
    relationship remained intact and revision fields started at 0/null/null.
    Two concurrent SQL increments both completed and the resulting revision
    was 2. This validates PostgreSQL's atomic increment primitive, not
    concurrent NestJS request behavior.
12. Final backend unit tests, build, TypeScript check, and whitespace check
    passed as specified in the validation results below. No live HTTP suite
    was run for the new revision header/response. Infrastructure TLS/ACL and
    Windows collector behavior remain unverified.

## Files changed in this remediation

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20261020150000_managed_inventory_revisions/migration.sql`
- `backend/src/modules/agents/agent.controller.ts`
- `backend/src/modules/agents/agents.service.ts`
- `backend/src/modules/agents/dto/enroll-agent.dto.ts`
- `backend/src/modules/agents/agents.service.spec.ts`
- `backend/src/modules/inventory/dto/inventory-payload.dto.ts`
- `backend/src/modules/inventory/hostname-conflict.ts`
- `backend/src/modules/inventory/inventory.service.ts`
- `backend/src/modules/inventory/inventory.service.spec.ts`
- `docs/AGENT-MANAGEMENT.md`
- `docs/PHASE-B-TARGETED-REMEDIATION.md`

The existing PowerShell collector, reference payload, legacy route, Compose
configuration, frontend, and user-modified files were not changed by this
remediation.

## Validation results

- Temporary-workspace Prisma Client generation: passed, Prisma Client 5.22.0.
- Temporary-workspace `prisma validate`: passed.
- `npm --prefix backend test -- --runInBand`: passed, 3 suites and 33 tests.
- `npm --prefix backend run build`: passed.
- `backend/node_modules/.bin/tsc --noEmit --project backend/tsconfig.json`:
  passed.
- `git diff --check`: passed.
- Fresh migration SQL application: all 17 repository migration scripts
  completed in the disposable PostgreSQL database. The last migration also
  completed independently in a second disposable database.
- Synthetic data assertions and concurrent SQL revision increments: passed
  as described above.
- Not executed: a full HTTP/API integration test of the check-in revision
  response and managed inventory header, an application-level concurrency
  test, Windows collector validation, production TLS/edge configuration, or
  migration against any existing application database.

## Disposable validation resources

Created solely for this task:

- PostgreSQL 16.15 container:
  `itam-remediation-20261020-db`,
  `af591f49524abef45eac47e089435988c965f5d794358f637102332ec6995d7a`.
- Internal-only Docker network:
  `itam-remediation-20261020-net`,
  `0d994874115b852338c9e0595d5549c1049af302ab5e455b574e0a1133dfc229`.
- Dedicated volume: `itam-remediation-20261020-vol`.
- The database port was bound to loopback only; it was not publicly exposed.
- Temporary schema/client staging: `/tmp/itam-remediation-20261020`.
- The `postgres:16.15` image was pulled because it was not present locally;
  the image remains cached, while task-created database resources were removed.

These exact task-created Docker resources and staging files were removed after
validation. Pre-existing containers, networks, and volumes were not stopped,
removed, or modified.
