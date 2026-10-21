# AGENTS.md — ITAM Repository Instructions

## 1. Project Context

This repository contains an existing IT Asset Management Platform.

According to the current implementation summary, the platform includes:

- Backend: NestJS running on Node.js, using Express as its HTTP platform.
- Database: PostgreSQL managed through Prisma.
- Frontend: React, Vite, TypeScript, and Tailwind CSS.
- Inventory collector: an existing Windows PowerShell script.
- Inventory API: documented as `/api/v1/inventory`, subject to verification against the source code.
- Existing modules: Inventory, Active Directory, File Server, Software Compliance, and Onboarding.
- Deployment: Docker Compose, Dockerfiles, environment configuration, and GitHub Actions where present.
- Documentation: README, setup instructions, architecture documentation, and implementation summary.

This summary is initial context, not proof that every listed feature currently works. Inspect the repository before making implementation decisions.

The project will be extended with:

1. Centralized Agent Management.
2. A new C#/.NET Windows inventory agent.
3. A Windows MSI installer.
4. Automated GitHub Actions build, test, and packaging.
5. Secure agent authentication, configuration polling, job scheduling, and release management where compatible with the actual implementation.

The existing PowerShell collector and all existing application functionality must remain intact during the migration.

## 2. Mandatory Specialized Instructions

Before implementing changes, read:

- `AGENT_DEVELOPMENT_RULES.md`
- `agent-management-requirements.md`
- `IMPLEMENTATION_SUMMARY.md`
- `README.md`
- `ARCHITECTURE.md`, if present.
- `docs/SETUP.md`, if present.
- Any applicable `CLAUDE.md` or additional scoped `AGENTS.md` files.

If a referenced file does not exist, continue with the available instructions and report the missing documentation where relevant. Do not invent its contents.

For the combined implementation task, follow the master plan supplied by the user. If a master implementation prompt is saved in the repository, read it as well.

When instructions overlap, follow the stricter applicable security and compatibility requirement. Ask for clarification if two requirements create an unresolved conflict.

## 3. Discovery Before Coding

For any substantial change:

1. Inspect the existing source code and project structure.
2. Trace the affected functionality from frontend to backend to database.
3. Inspect relevant Prisma models and migration history.
4. Inspect the existing API routes, DTOs, validation, authentication, and authorization.
5. Inspect existing tests and build commands.
6. Identify compatibility risks and the smallest safe implementation.
7. Report the architecture and implementation plan before modifying application files when the task explicitly requires discovery first.

For the combined Agent Management and C# agent project, the initial discovery phase must not modify application files.

Do not assume a technology, file path, API contract, service name, authentication mechanism, or installation method solely from this document.

## 4. Backward Compatibility

Preserve:

- Existing inventory ingestion and JSON payload structure.
- Existing device and inventory records.
- Existing Prisma relationships and migrations.
- Existing Inventory, Active Directory, File Server, Software Compliance, and Onboarding behavior.
- Existing PowerShell collector behavior.
- Existing API routes and response contracts.
- Existing frontend pages and navigation.
- Existing Docker configuration and deployment conventions.
- Existing environment variable names and secrets.
- Existing GitHub Actions workflows.

Prefer additive changes over replacements.

Do not migrate existing endpoints or collectors to a new protocol without a tested compatibility plan.

Do not remove the PowerShell collector when adding the C# agent.

Do not assume authentication or authorization is absent or present without inspecting the source code.

## 5. Database Safety

- Never run `prisma migrate reset`.
- Never reset or wipe a database to make tests pass.
- Never delete existing production data.
- Never modify production records during tests.
- Inspect existing migrations before adding new ones.
- Prefer additive, transaction-safe schema changes.
- Preserve historical migration meaning.
- Validate migrations using an isolated test database when available.
- Do not execute production migrations without explicit approval.

Reuse existing models where appropriate. Avoid duplicate device, inventory, user, or organizational entities.

## 6. Security

Never commit or expose:

- Passwords.
- API tokens.
- Agent credentials.
- Enrollment secrets.
- JWT secrets.
- Private keys.
- Signing keys.
- Production environment files.
- Authorization headers.

Never log plaintext secrets.

Enforce authorization on the backend, not only in React.

Validate input, enforce request size limits, sanitize errors, and protect file uploads.

Do not introduce arbitrary remote command execution through agent configuration or job payloads.

Use HTTPS for agent communication and authenticated, authorized access to protected endpoints.

Do not disable existing security controls to make tests pass.

Do not assume the platform has RBAC, JWT middleware, audit logging, or other controls merely because they are listed as planned improvements. Verify what actually exists.

## 7. C# Agent and Collector Compatibility

Follow `AGENT_DEVELOPMENT_RULES.md`.

The new C# agent must:

- Use the complete verified inventory JSON contract.
- Collect values dynamically from each endpoint.
- Handle individual collector failures safely.
- Use structured, bounded local logging.
- Use secure credential storage where supported.
- Validate configuration before applying it.
- Avoid arbitrary remote code execution.
- Be packaged reproducibly.
- Be tested independently of physical hardware where possible.

Keep the existing PowerShell collector operational until migration has been explicitly validated.

Do not assume a Windows version, .NET runtime, Windows Service, MSI framework, or updater without investigation.

## 8. Agent Management

Follow `agent-management-requirements.md`.

Implement real, database-backed agent status, configuration, jobs, campaigns, release metadata, and audit events.

Do not use hardcoded demonstration statistics.

Use authenticated polling, independent agent identities, safe credential rotation, durable job states, bounded retries, leases, concurrency limits, and configuration precedence.

Use PostgreSQL-backed job scheduling if it meets the requirements of the existing architecture.

Do not introduce external infrastructure without a demonstrated need.

Do not start a mass campaign, production rollout, or destructive operation without explicit approval.

## 9. Implementation Discipline

Work in small, reviewable phases.

For each phase:

1. Summarize the intended change.
2. Identify the files that will be changed.
3. Implement only the agreed scope.
4. Run the relevant tests and build checks.
5. Review the diff for unrelated changes.
6. Report actual results and remaining risks.

Do not claim tests passed unless they ran successfully.

Do not claim Windows installation or update behavior was verified when only static inspection or a Linux build was performed.

If a required environment is unavailable, clearly document what was tested and what remains unverified.

Never hide compilation failures, failing tests, missing dependencies, or incomplete functionality.

## 10. Git and Deployment Safety

- Preserve unrelated user modifications.
- Inspect `git status` before significant changes.
- Do not discard changes using destructive Git commands.
- Do not force-push.
- Do not rewrite shared history.
- Do not publish a release automatically.
- Do not deploy to production without explicit approval.
- Do not expose repository secrets to untrusted pull-request workflows.

## 11. Required Final Report

At each completed phase, report:

- Changes implemented.
- Files added or modified.
- Database and migration changes.
- API and JSON contract changes.
- Tests actually executed and their results.
- Compatibility checks.
- Security considerations.
- Known limitations.
- Remaining tasks.
- Any approval required before proceeding.

The objective is a safe, incremental extension of the existing ITAM platform, not an unnecessary rewrite.