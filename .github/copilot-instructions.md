# GitHub Copilot Instructions — IT Asset Management Platform

## 1. Project Mission

This repository contains an existing IT Asset Management Platform (ITAM). The objective is to extend it safely with centralized endpoint Agent Management and, where explicitly approved, develop a new C#/.NET Windows inventory agent with a Windows installer and CI workflow.

**The existing application must remain stable and backward-compatible.**

Treat this repository as an existing system, not a greenfield project. Understand the current implementation before proposing or making changes.

## 2. Mandatory Instruction Files

Before making changes, inspect and follow these files when present:

- `AGENTS.md` — repository-wide agent behavior and workflow rules.
- `AGENT_DEVELOPMENT_RULES.md` — endpoint agent engineering and delivery rules.
- `agent-management-requirements.md` — functional and technical requirements.
- `IMPLEMENTATION_SUMMARY.md` — project overview, subject to verification against source code.
- `README.md`, `docs/SETUP.md`, `docs/ARCHITECTURE.md`, and relevant API documentation.
- Existing database schemas, migrations, DTOs, sample payloads, tests, and GitHub Actions workflows.

Do not assume these files exist. If one is missing, report it and continue only as permitted by the active task.

If instructions conflict, preserve security and data integrity first, follow the explicit task scope and approved decisions, and ask for clarification when the conflict affects compatibility, API contracts, authentication, or destructive operations.

## 3. First Action: Read-Only Repository Discovery

For a new feature or a task that may affect architecture, APIs, the database, endpoint agents, or deployment:

1. Inspect the repository structure and Git status.
2. Identify the actual backend and frontend frameworks from source files and dependencies.
3. Trace the relevant request flow from frontend to API, service, database, and endpoint agent.
4. Read existing schemas, DTOs, validation rules, API routes, migrations, and tests.
5. Locate all existing inventory collectors and agents, including Python, PowerShell, or other implementations.
6. Inspect the real inventory JSON contract and compare it with backend validation and existing sample payloads.
7. Review authentication, authorization, secret management, logging, and deployment configuration.
8. Produce a discovery report and implementation plan before modifying files.

Do not assume that the documentation accurately describes the current source code. Verify all important claims.

During an explicitly read-only discovery phase, do not create, edit, delete, rename, or move files. Do not install packages, execute database migrations, change configuration, or deploy the application.

Wait for explicit user approval before moving from discovery to implementation.

## 4. Project Architecture Must Be Verified

The project may contain technologies such as:

- A Node.js backend using Express or NestJS.
- React, Vite, and Tailwind CSS.
- PostgreSQL and Prisma ORM.
- Docker Compose and Nginx.
- Existing Python or PowerShell inventory collectors.
- GitHub Actions CI/CD workflows.

These are investigation targets, not assumptions. The actual repository source code, dependency manifests, runtime configuration, and tests are authoritative.

Do not introduce a replacement framework or duplicate architectural layer simply because it is more familiar.

Reuse established project conventions, shared services, validation utilities, API clients, logging, and test patterns wherever appropriate.

## 5. Stability and Backward Compatibility

- Do not rewrite or replace existing modules unnecessarily.
- Do not remove existing API endpoints, fields, DTO properties, database columns, or response behaviors without explicit approval.
- Do not replace existing Python or PowerShell agents with a new C# agent automatically.
- Keep existing agents operational during development and migration.
- Introduce new agent types and capabilities explicitly when required.
- Preserve the current inventory ingestion contract unless a documented, approved migration says otherwise.
- Prefer additive, reversible changes over broad refactoring.
- Avoid unrelated formatting changes, dependency upgrades, file moves, and architectural cleanup.
- Do not silently change API response formats, HTTP status codes, authentication expectations, or data meanings.
- Add compatibility tests for existing workflows affected by a change.

If a requested feature cannot be implemented safely without a breaking change, explain the issue and propose a staged migration before proceeding.

## 6. Inventory JSON Contract

The existing inventory payload is a compatibility boundary.

Before modifying inventory collection or ingestion:

1. Locate the existing sample payload, including `scripts/sample-inventory-payload.json` if present.
2. Inspect the actual backend DTOs, validators, services, database mappings, and API behavior.
3. Inspect payloads generated by each existing endpoint agent.
4. Compare field names, capitalization, data types, nullable values, nested structures, date formats, arrays, and missing-field behavior.
5. Add tests based on verified existing payloads.
6. Preserve backward compatibility unless a contract change is explicitly approved.

Do not invent a new JSON schema based only on the implementation summary or assumptions.

If the sample payload is missing, incomplete, or conflicts with the backend implementation, report the discrepancy and request clarification before making a contract-changing decision.

## 7. Security Requirements

Security is mandatory for all new backend, frontend, agent, installer, and CI/CD work.

- Never hardcode passwords, API tokens, private keys, signing credentials, or production secrets.
- Treat credentials shown in documentation or examples as illustrative placeholders, never as real values to reuse.
- Never print secrets into logs, test output, generated documentation, screenshots, or error responses.
- Use environment variables or the project's approved secret-management mechanism for sensitive configuration.
- Validate all externally supplied input on the server.
- Enforce authentication and authorization on administrative and agent-management endpoints.
- Do not rely on hiding frontend buttons as an authorization mechanism.
- Do not trust a claimed device ID, hostname, or agent version as proof of agent identity.
- Do not allow unrestricted agent registration, arbitrary remote command execution, or unauthenticated management operations.
- Protect agent credentials and update packages against unauthorized disclosure or tampering.
- Use secure transport where supported and required by the deployment architecture.
- Avoid exposing sensitive inventory fields to unauthorized users.
- Apply least privilege to database users, services, CI jobs, and endpoint agents.
- Record relevant administrative actions without logging secrets.
- Follow the existing authentication design where suitable; if adequate protection is missing, identify and address that prerequisite before enabling sensitive operations.

Do not weaken security controls to make a test pass.

## 8. Centralized Agent Management

When implementing Agent Management, inspect the current system and use the approved requirements document.

Potential capabilities include:

- Agent inventory and status.
- Agent version and last-seen information.
- Controlled configuration management.
- Controlled synchronization requests.
- Bounded polling and batching to prevent simultaneous load spikes.
- Agent lifecycle and update status.
- Release metadata and verified package distribution.
- Administrative audit logs.
- Appropriate authentication, authorization, and error handling.

Implement only capabilities supported by the verified architecture and explicitly approved scope.

A UI control must not claim an operation succeeded until the backend confirms it. Distinguish requested, queued, running, succeeded, failed, timed out, and unsupported states where applicable.

Do not introduce unrestricted remote shell execution or arbitrary commands as a shortcut for implementing management features.

## 9. Endpoint Agent Development

If a new C#/.NET agent is approved:

- Inspect the existing agents and contract before choosing an implementation strategy.
- Determine target framework compatibility from the actual supported Windows versions and runtime requirements.
- Keep the agent implementation separate from the existing backend unless the approved architecture explicitly requires otherwise.
- Preserve existing agents and their installation procedures.
- Use structured, privacy-conscious logging and robust error handling.
- Handle network failures, timeouts, retries, and server errors safely.
- Avoid infinite retry loops, excessive polling, uncontrolled concurrency, and resource-intensive collection.
- Avoid collecting unnecessary sensitive data.
- Use deterministic, testable collection and serialization logic.
- Verify the generated payload against the existing inventory contract.
- Do not claim compatibility with an operating system or PowerShell/.NET runtime without verifying it.

If building an MSI, select an installer technology compatible with the approved target framework and deployment requirements. Test installation, upgrade, repair where supported, and uninstall behavior.

## 10. Database and API Changes

Before changing the database:

1. Inspect the current Prisma schema, migration history, relationships, constraints, indexes, and existing data assumptions.
2. Explain the purpose and compatibility impact of each schema change.
3. Prefer additive migrations when practical.
4. Do not reset, drop, truncate, or overwrite existing data.
5. Never run migrations against production without explicit approval.
6. Never assume a database is empty or disposable.
7. Test migrations and rollback or recovery procedures in an appropriate non-production environment.
8. Verify that existing API routes and payloads continue to work.

Follow the project's established API routing, validation, response, error-handling, and documentation conventions.

## 11. Frontend Requirements

- Follow the existing React architecture, routing, UI components, styling, and API client.
- Avoid unnecessary redesigns or unrelated page changes.
- Handle loading, empty, success, error, timeout, and unauthorized states.
- Validate user input and rely on server-side authorization.
- Do not expose secrets in client-side code.
- Make status indicators accurately reflect backend state.
- Add appropriate tests for important new behavior.
- Maintain accessibility and responsive behavior consistent with the application.

## 12. Testing and Verification

Before reporting a change as complete:

- Run relevant existing tests.
- Add tests for new behavior and important failure paths.
- Verify API compatibility and payload serialization where relevant.
- Validate database changes in a safe test environment.
- Run the applicable build, type checks, linting, and packaging checks.
- Inspect the final Git diff for unintended changes.
- Verify that no secrets or environment-specific addresses were introduced.

For endpoint agents and installers, test applicable collection, serialization, network failure, installation, upgrade, and uninstall scenarios.

For CI/CD, inspect the existing workflows before editing them. Preserve existing triggers, required checks, deployment safeguards, and branch conventions unless a change is approved.

**Report only tests and commands that were actually executed.** Clearly distinguish passed, failed, skipped, and untested checks. Never fabricate test results.

If a check cannot be run because the environment or dependencies are unavailable, explain the limitation and provide the exact command needed to run it.

## 13. GitHub Actions and CI/CD

- Reuse the existing workflow structure when appropriate.
- Pin or constrain dependencies and actions according to existing repository policy.
- Use GitHub Actions secrets or approved secret stores for credentials.
- Never commit secrets, signing keys, private certificates, or generated credentials.
- Avoid exposing sensitive values in workflow logs.
- Use least-privilege workflow permissions.
- Separate build, test, package, and deployment responsibilities where practical.
- Generate checksums or signatures for release artifacts when required by the approved release design.
- Do not automatically deploy to production or modify production infrastructure without explicit approval.

## 14. Dependency and File Changes

Before adding a dependency, explain why existing libraries are insufficient and assess maintenance, compatibility, security, and licensing.

Do not upgrade major dependency versions as an incidental part of a feature.

Do not delete or overwrite a file merely because it appears unused. Search references and verify its role first.

Do not change `.gitignore`, workflow permissions, environment files, or build settings to conceal errors.

## 15. Implementation Workflow

Use this sequence for substantial work:

### Phase 1 — Discovery
Inspect the source, report findings, identify risks, and list unknowns. No modifications.

### Phase 2 — Plan
List the intended files, API and schema changes, security controls, tests, compatibility implications, and rollback strategy. Wait for approval.

### Phase 3 — Small, Scoped Implementation
Implement only the approved phase. Avoid unrelated refactoring.

### Phase 4 — Verification
Run appropriate tests and inspect the diff. Fix directly related defects without expanding scope.

### Phase 5 — Report
Summarize changes, test results, migration requirements, security implications, remaining risks, and manual steps.

Do not skip approval gates defined by the active task or `AGENTS.md`.

## 16. Communication and Reporting

Use concise, direct technical explanations. Clearly separate verified facts from assumptions and recommendations.

At the end of each implementation phase, report:

1. What changed.
2. Which files changed and why.
3. Tests and commands actually run.
4. Results and failures.
5. Backward-compatibility and security implications.
6. Database migration or configuration requirements.
7. Remaining issues and next steps.

Ask for clarification whenever an unresolved decision could cause data loss, security exposure, a breaking API change, or replacement of existing functionality.

## 17. Final Priority

**Understand first. Plan second. Obtain approval. Implement incrementally. Test honestly. Preserve existing behavior.**

When uncertain, do not guess and do not make a destructive change. Inspect the repository and ask.


## Device Identity and Network Inventory

The approved device identity model is:

- `device_id`: persistent internal UUID that remains stable across inventory syncs.
- `hostname`: current, changeable operating-system hostname.
- `mac_addresses`: collection of eligible MAC addresses used as supplementary matching information.
- `ip_addresses`: collection of current IP addresses associated with eligible network interfaces.

Never use hostname or IP address as the sole permanent device identifier. Never assume a MAC address is unique, permanent, or sufficient to authenticate a device.

Before modifying these fields, inspect the existing database schema, inventory JSON contract, backend upsert logic, and existing agent implementations. Preserve existing device records, relationships, inventory history, and API compatibility. Do not invent field names or change the payload format without an approved compatibility plan.

For identity-related changes, first report the current implementation, proposed changes, migration requirements, and tests. Wait for approval before implementing breaking or destructive changes.
