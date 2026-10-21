# Agent Management Requirements — ITAM Platform

## 1. Objective

Implement a centralized Agent Management module inside the existing IT Asset Management Platform.

The module must manage registered endpoint agents, their connectivity, configuration, inventory synchronization jobs, releases, credentials, and administrative audit events.

The initial target scale is approximately 100–500 endpoints.

The existing platform reportedly uses:

- NestJS on Node.js with the Express HTTP adapter.
- PostgreSQL.
- Prisma.
- React, Vite, TypeScript, and Tailwind CSS.
- An existing Windows PowerShell inventory collector.
- Docker Compose and existing GitHub Actions workflows.

Verify these details against the source code before implementation.

Do not replace the current backend, database schema, frontend architecture, or inventory collector.

The new C# agent must coexist with the existing PowerShell collector until migration is validated.

## 2. Discovery Requirements

Before making application changes, inspect:

- `AGENTS.md`.
- `AGENT_DEVELOPMENT_RULES.md`.
- The master implementation plan, if present.
- `IMPLEMENTATION_SUMMARY.md`.
- `README.md`.
- `ARCHITECTURE.md`, if present.
- `docs/SETUP.md`, if present.
- Existing NestJS modules and controllers.
- Inventory DTOs and services.
- Prisma schema and migrations.
- Existing device, inventory, user, branch, and organizational relationships.
- Authentication and authorization.
- Logging and audit mechanisms.
- Existing frontend routes and components.
- PowerShell collector and reference JSON.
- Docker configuration and GitHub Actions.

The initial discovery phase must not modify application files.

Produce an architecture report and identify compatibility risks before implementation.

## 3. Compatibility Requirements

Preserve:

- Existing inventory API behavior.
- Existing JSON payload structure.
- Existing device and inventory data.
- Existing Prisma relationships.
- Existing Active Directory integration.
- Existing File Server integration.
- Existing Software Compliance behavior.
- Existing Onboarding workflows.
- Existing PowerShell collector behavior.
- Existing frontend pages and navigation.
- Existing Docker and deployment configuration.
- Existing CI/CD workflows.

Extend existing modules where appropriate.

Do not create duplicate inventory tables or device entities without demonstrating why they are necessary.

Do not assume the authentication layer is absent or present without source-code verification.

Do not claim that the implementation summary proves current runtime behavior.

## 4. Device Identity and Network Inventory

### 4.1. Stable Internal Device ID — `device_id`

Every device must have a stable internal identifier represented by a UUID, subject to verification of the existing database schema and identity model.

Example:

`8f1c2a7e-91b4-4d30-a6c5-12e8f07b6391`

Requirements:

- Generate or assign the UUID once when a device is first registered, if the existing system does not already provide a suitable stable identifier.
- Persist the identifier so it remains unchanged across subsequent inventory synchronizations.
- Never generate a new UUID for every inventory submission.
- Keep the internal device identity stable when the hostname, IP address, or network adapters change.
- Preserve existing device IDs, primary keys, foreign keys, inventory history, and relationships wherever possible.
- Inspect the current Prisma schema and device creation/update logic before deciding how the UUID should be stored.
- If an existing stable database ID already serves this purpose, do not introduce a redundant identifier without a documented reason.
- Do not replace an existing primary key or alter its relationships without an explicitly approved migration and compatibility plan.
- A device identity must not depend solely on hostname, MAC address, or IP address.
- A UUID reported by an endpoint is an identifier, not proof of authentication or ownership.
- Prevent repeated inventory submissions from creating duplicate device records.
- Detect identity conflicts and potential cloned machine identities rather than silently merging different devices.

#### Identity persistence and recovery

The agent must preserve its device identity across ordinary restarts and inventory synchronization.

Where safely possible, it must preserve identity across agent reinstallation through a persistent local identity/configuration file or another approved mechanism.

The implementation must define:

- Where the local identity is stored.
- Which users and processes can read or modify it.
- How it is protected from accidental deletion or modification.
- How identity is restored after an agent upgrade or reinstall.
- How missing, invalid, or conflicting identity values are handled.
- How the backend verifies that an authenticated agent is authorized to report for the associated device.

Do not embed a permanent shared secret in the agent executable.

If the local identity is missing or invalid, follow an explicit registration or recovery workflow. Do not silently create duplicate devices or take ownership of an existing device solely because its hostname or MAC address matches.

### 4.2. Hostname — `hostname`

The agent must collect the current hostname from the operating system.

Example:

`STL-FIN01`

Requirements:

- Collect the current Windows hostname using an appropriate API supported by the selected target framework.
- Include the hostname in applicable inventory submissions.
- Update the stored hostname when it changes.
- Preserve the device ID and inventory history after a hostname change.
- Support searching and filtering devices by hostname.
- Do not use the hostname as the permanent internal device ID.
- Handle hostname collection errors without corrupting previously stored device identity.

### 4.3. MAC Addresses — `mac_addresses`

The agent must collect MAC addresses from eligible network interfaces.

Example:

`A4:BB:6D:12:34:56`

Requirements:

- Support multiple network adapters.
- Collect usable MAC addresses from eligible interfaces.
- Normalize MAC addresses into a consistent format.
- Exclude loopback interfaces and unusable MAC addresses.
- Handle Ethernet, Wi-Fi, VPN, and virtual network adapters according to a documented interface-selection policy.
- Avoid duplicate MAC addresses within a single inventory report.
- Do not assume a device has only one MAC address.
- Do not treat a MAC address as a permanent identifier or an authentication credential.
- Treat MAC addresses as supplementary identity-matching information.
- Handle adapter changes without automatically creating a new device.
- Do not merge two devices solely because they report the same MAC address.
- Where supported by the existing data model, associate each address with its corresponding network interface.
- Preserve existing inventory records when MAC addresses change.

If multiple eligible MAC addresses exist, report the appropriate set of addresses rather than selecting an arbitrary address and discarding the others.

If the existing system requires a single preferred MAC address for display or legacy compatibility, define a deterministic selection policy and preserve the complete collection separately where the schema supports it.

### 4.4. IP Addresses — `ip_addresses`

The agent must collect the IP addresses associated with eligible network interfaces.

Example:

`10.22.28.45`

Requirements:

- Collect IPv4 and IPv6 addresses when available and supported.
- Support multiple IP addresses across multiple interfaces.
- Associate addresses with their corresponding network interfaces and MAC addresses where possible.
- Exclude loopback addresses.
- Correctly identify private, public, link-local, APIPA, and other relevant address categories.
- Normalize addresses and avoid duplicate entries within an inventory report.
- Handle DHCP changes, VPN connections, virtual adapters, disconnected interfaces, and network transitions.
- Refresh the reported current addresses during inventory synchronization.
- Do not treat IP addresses as permanent device identifiers.
- Do not create a new device when its IP address changes.
- Distinguish current IP addresses from historical observations if the existing database supports address history.
- Do not assume that the endpoint's local IP is the same as its public IP as observed by the server.
- Do not fabricate an address when collection fails.
- Define and document whether disconnected interfaces are included and how stale addresses are removed from current inventory.

The backend must distinguish between the current set of addresses and any retained historical information. If historical address tracking is not currently supported, do not introduce it without demonstrating the need and obtaining approval for the relevant schema changes.

### 4.5. Device Identity Reconciliation

The identity reconciliation policy must use the stable internal `device_id` as the primary application-level device identity.

Hostname, MAC addresses, IP addresses, and hardware serial number, when available, are supplementary attributes for searching, diagnostics, and identifying potential duplicate records.

Requirements:

- An ordinary hostname change must not create a new device.
- An ordinary IP address change must not create a new device.
- A network adapter replacement must not automatically create a new device.
- A changed MAC address must not automatically create a new device.
- Matching hostname or MAC address alone must not authorize an agent to overwrite another device's inventory.
- Potential duplicate registrations must be detected and handled according to a documented reconciliation policy.
- Conflicting UUIDs or cloned agent identities must not silently merge unrelated devices.
- Re-registration and recovery must preserve existing records and relationships wherever possible.
- Identity reconciliation must be authorized and auditable when administrative intervention is required.

Do not automatically merge existing database records as part of initial implementation. Report suspected duplicates and propose a safe reconciliation process first.

### 4.6. Logical Inventory Model

The logical inventory representation should include:

| Field | Purpose | Expected behavior |
|---|---|---|
| `device_id` | Stable internal UUID | Remains stable across inventory syncs |
| `hostname` | Current device name | Updated when the name changes |
| `mac_addresses` | Eligible network MAC addresses | Supports multiple addresses |
| `ip_addresses` | Current interface IP addresses | Refreshed as network state changes |
| `last_seen` | Most recent accepted report | Updated by the appropriate server-side workflow |
| `agent_version` | Installed agent version | Updated when reported and validated |

This is a logical requirement, not an instruction to add database columns or JSON fields with these exact names without first inspecting the actual API contract and schema.

The existing application may use different property names or data structures. Reuse existing conventions where suitable and document any mapping.

Do not create duplicate device entities or parallel inventory stores solely to accommodate these logical field names.

### 4.7. JSON Contract, Backend, and Database Compatibility

Before implementing identity and network inventory changes:

1. Inspect the existing sample JSON, if available.
2. Inspect the actual backend DTOs, validation rules, services, and persistence logic.
3. Inspect the current device primary key and all relevant foreign-key relationships.
4. Inspect how existing PowerShell and any Python agents identify devices and submit inventory.
5. Determine how the existing API handles missing fields, nullable values, unknown properties, and repeated submissions.
6. Define the smallest backward-compatible change that meets the requirements.
7. Determine whether the current schema supports multiple MAC addresses and IP addresses.
8. Reuse existing fields or related entities where appropriate.
9. Add tests for payload compatibility and device identity persistence.
10. Document any required schema migration and its impact before implementation.

Preserve the existing inventory JSON contract unless an explicitly approved compatibility plan authorizes a change.

Do not silently discard valid inventory fields or change property names, capitalization, data types, or response semantics.

Do not run destructive migrations or modify production data without explicit approval.

### 4.8. Device Identity and Network Inventory Acceptance Criteria

The feature is accepted only when:

- The internal device ID remains stable across repeated inventory submissions.
- The hostname is collected and can change without creating a new device.
- Multiple eligible MAC addresses are collected and normalized correctly.
- Multiple eligible IP addresses are collected and associated with interfaces where possible.
- DHCP or network changes do not create duplicate device records.
- Agent restart and approved reinstall workflows preserve identity where expected.
- Missing or invalid local identity follows a documented recovery process.
- Cloned or conflicting identities are detected and handled safely.
- Existing inventory records and foreign-key relationships remain intact.
- Existing PowerShell inventory submission continues to work.
- The new agent payload passes the actual backend validation.
- Automated tests cover the important identity and network edge cases.
- No unverified assumption about the API contract or database schema is silently introduced.

## 5. Agent Identity and Authentication

Every registered agent must have an independent identity and independently managed credential.

Requirements:

- Agent identity must not rely solely on hostname or IP address.
- Credentials must not be shared permanently across all endpoints.
- Credentials must not be stored in plaintext in the database.
- Credentials must never appear in logs.
- Each agent may access only its authorized configuration, jobs, results, and release information.
- Administrative operations must require appropriate backend authorization.
- Credential rotation, revocation, and recovery must be supported.
- Enrollment must be explicitly authorized.
- Enrollment credentials should be single-use or short-lived where feasible.
- Replay and unauthorized enrollment must be prevented.

Inspect existing authentication before selecting a design.

Reuse suitable existing mechanisms rather than introducing an incompatible parallel system.

If the existing collector lacks authentication, implement a secure enrollment protocol for the new agent without embedding a permanent shared secret in its executable.

Credential rotation must support interrupted exchanges and safe recovery without unnecessarily requiring manual reinstallation of every agent.

Immediate revocation of a compromised credential must remain possible.

Keep these states distinct:

- Registered.
- Enabled or disabled.
- Credential valid or revoked.
- Inventory collection enabled or disabled.
- Automatic synchronization enabled or disabled.

Do not make a credential rotation invalidate every existing agent simultaneously.

## 6. Agent Connectivity and Status

Track real, persisted agent state.

Required information includes:

- Agent identity.
- Associated device.
- Hostname and existing device identifiers.
- Operating system.
- Installed agent version.
- Desired agent version.
- Applied configuration version.
- Last successful check-in.
- Last successful inventory synchronization.
- Last job result.
- Authentication status.
- Configuration status.
- Update status.
- Relevant errors and activity.

Define online status using a configurable heartbeat timeout.

A successful heartbeat is not equivalent to a successful inventory synchronization.

Statistics must be calculated from real database records.

Use pagination for agent lists and indexes for common status queries.

## 7. Configuration Management

Support:

1. Global default configuration.
2. Group or branch configuration.
3. Device-specific overrides.

Configuration precedence must be deterministic:

Global defaults → group or branch configuration → device-specific overrides.

Only explicitly configured override fields may override inherited settings.

Use versioned configuration records and an auditable history.

Expose only settings supported by the actual agent.

Potential settings include:

- Agent enabled/disabled.
- Hardware inventory collection.
- Software inventory collection.
- Automatic inventory synchronization.
- Check-in interval.
- Automatic synchronization interval.
- Supported collection capabilities.
- Update channel.
- Configuration refresh behavior.

Do not expose arbitrary shell commands or arbitrary script execution.

Validate configuration on the backend and agent.

The agent must retain the last known valid configuration when a new configuration fails validation.

Use configuration versions or hashes to avoid retransmitting unchanged payloads unnecessarily.

Keep configuration retrieval scoped to the authenticated agent.

## 8. Polling API

Adapt endpoint names and patterns to the existing NestJS module structure and API conventions.

Implement the required capabilities using existing equivalent routes where available:

- Agent check-in and heartbeat.
- Agent version reporting.
- Applied configuration version reporting.
- Effective configuration retrieval.
- Eligible job retrieval.
- Atomic job claim or acknowledgment.
- Job result reporting.
- Inventory submission using the existing compatible contract.
- Authorized update manifest retrieval.
- Update progress and result reporting.
- Secure credential rotation.

Suggested logical routes include:

- `POST /api/v1/agent/check-in`
- `POST /api/v1/agent/jobs/:jobId/claim`
- `POST /api/v1/agent/jobs/:jobId/result`
- `POST /api/v1/agent/inventory`
- `GET /api/v1/agent/updates/manifest`
- `POST /api/v1/agent/updates/:releaseId/result`

These are suggestions, not a requirement to duplicate existing routes.

Use NestJS controllers, providers, modules, DTOs, validation, guards, and exception handling consistently with the actual project.

Validate request bodies and parameters.

Limit request sizes.

Enforce authorization on every sensitive route.

Do not trust a client-supplied agent ID as proof of identity.

Use HTTPS for agent communication.

Implement timeouts and bounded retry behavior in the agent.

## 9. Inventory Integration

The existing inventory API is documented as `/api/v1/inventory`, but the actual route, method, DTO, and payload must be inspected before integration.

Preserve the current inventory JSON contract.

Do not break the existing PowerShell collector.

If agent-specific authentication is added, associate requests with the authenticated agent through server-side identity mapping.

Do not trust arbitrary agent identifiers supplied in inventory JSON.

Make duplicate ingestion safe using the existing device identity and persistence behavior.

Do not silently discard valid inventory fields.

Integrate the `device_id`, `hostname`, `mac_addresses`, and `ip_addresses` requirements from Section 4 without assuming the existing payload already supports these exact field names.

If the existing C# payload differs from the existing contract, document the mapping and test it before deployment.

If an existing agent does not report one or more of the new fields, preserve backward compatibility and define safe handling for missing information rather than rejecting otherwise valid legacy payloads.

## 10. Database and Prisma

Inspect the current schema and migrations before adding models.

Reuse existing device, inventory, user, and organizational relationships wherever appropriate.

Logical entities may include:

- Agent metadata.
- Agent credentials.
- Versioned configurations.
- Configuration assignments.
- Device-specific overrides.
- Sync campaigns.
- Agent jobs.
- Release metadata.
- Update executions.
- Heartbeat information.
- Audit events.

Create only entities that do not already have a suitable equivalent.

Use:

- Foreign keys.
- Appropriate unique constraints.
- Indexes for agent lookup and job scheduling.
- Explicit timestamps.
- Validated lifecycle states.
- Transaction-safe updates.
- Immutable or versioned history where required.

For device identity and network data:

- Reuse the existing device primary key if it already provides a stable internal identity.
- If a UUID is required, define a safe migration and mapping strategy for existing records.
- Do not regenerate IDs for existing devices during ordinary inventory syncs.
- Do not make hostname, MAC address, or IP address the sole permanent identity.
- Represent multiple MAC addresses and IP addresses according to the verified existing schema and API contract.
- Use appropriate uniqueness constraints only where the actual identity model supports them.
- Avoid globally unique constraints on mutable IP addresses or assumptions that every MAC address is unique forever.
- Preserve existing foreign keys, inventory history, and relationships during migrations.
- Add indexes for identity lookups and network inventory queries where justified.
- Avoid introducing historical network-address tables unless the existing architecture or approved requirements justify them.

Do not store large release artifacts in ordinary relational records without a justified reason.

Generate additive migrations.

Never run `prisma migrate reset`.

Do not delete existing data or edit applied migration history destructively.

Validate migrations against an isolated test database where possible.

Do not apply production migrations without explicit approval.

## 11. Durable Synchronization Campaigns

Provide synchronization campaigns targeting:

- All eligible agents.
- Selected agents.
- A selected group or branch.

Campaign settings must include:

- Batch size.
- Delay between batches.
- Maximum concurrent jobs.
- Maximum retry attempts.

Persist campaign and per-agent job states.

Required states include:

- Pending.
- Running.
- Succeeded.
- Failed.
- Skipped.
- Cancelled.

Provide:

- Campaign progress.
- Per-agent results.
- Retry of failed jobs.
- Cancellation of eligible unstarted work.
- Execution history.
- Failure details.
- Audit events.

Use PostgreSQL-backed scheduling when appropriate for the current architecture and target scale.

Avoid introducing a separate message broker without demonstrating a real need.

Use transactions and atomic claiming. Consider `FOR UPDATE SKIP LOCKED` where compatible with PostgreSQL and the actual Prisma implementation.

Do not hold database transactions open during inventory collection or artifact downloads.

## 12. Job Safety and Reliability

Jobs must support:

- Atomic claims.
- Lease expiration.
- Recovery after worker failure.
- Bounded retries.
- Exponential backoff with jitter.
- Idempotent result processing.
- Duplicate request protection.
- Global and campaign concurrency limits.
- Offline agent handling.
- Prevention of unintended overlapping synchronization jobs for the same agent.
- Safe cancellation of work that has not started.

Expired leases must recover abandoned jobs according to a documented policy.

Do not retry permanent authentication or validation errors indefinitely.

Offline endpoints must not block unrelated agents indefinitely.

Cancellation of a running endpoint operation must be distinguished from cancellation of a queued job.

Campaign progress must reflect persisted job state.

Prevent duplicate inventory records or duplicate side effects when requests are retried.

## 13. React Agent Management UI

Use the existing React, Vite, TypeScript, Tailwind CSS, routing, API client, and reusable component conventions.

Do not rewrite existing pages.

### 13.1. Overview

Display real statistics for:

- Registered agents.
- Online and offline agents.
- Enabled and disabled agents.
- Agents on the current approved release.
- Agents requiring updates.
- Failed updates.
- Failed or overdue sync jobs.
- Last successful inventory synchronization.
- Recent activity and errors.

Distinguish heartbeat status from inventory synchronization status.

### 13.2. Agent list and details

Provide:

- Search by hostname and existing device identifiers.
- Pagination.
- Group or branch filters.
- Operating system filters.
- Agent version filters.
- Connectivity filters.
- Configuration version filters.
- Synchronization status filters.
- Update status filters.

Display last-seen time, current and desired versions, last applied configuration, last successful synchronization, authentication state, and recent errors.

Where supported by the verified schema and API, display:

- Stable internal device ID.
- Current hostname.
- MAC addresses associated with the device.
- Current IP addresses, preferably grouped by network interface.
- Agent identity and credential status without revealing secret values.

Do not assume that a device has one MAC address or one IP address.

Do not display stale historical IP addresses as if they were current.

Do not expose secret credential values.

### 13.3. Configuration UI

Support global, group, and device configuration.

Show inherited values and explicit overrides.

Validate user input.

Require confirmation for important administrative changes.

### 13.4. Campaign UI

Allow administrators to choose targets and configure batch scheduling and concurrency.

Show a confirmation dialog for large campaigns.

Display persisted campaign progress and individual results.

Support safe retry and cancellation.

### 13.5. Release UI

Support release upload, metadata, approval, pilot rollout, progress, failure inspection, and rollback controls where implemented.

Uploading must not automatically deploy a release.

### 13.6. Audit UI

Display authorized administrative and security events.

Never display plaintext credentials.

Enforce backend authorization even if a UI action is hidden.

## 14. Release Management

Inspect the actual installation model and backend before implementing endpoint updates.

Provide release metadata for:

- Version.
- Operating system.
- Architecture.
- Release channel.
- Release notes.
- Artifact size.
- SHA-256 checksum.
- Signature verification status.
- Approval status.
- Rollout status.

Use an explicit lifecycle for release creation, approval, rollout, and rollback.

Require approval before deployment.

Store artifacts privately or in an appropriately access-controlled storage system.

Do not expose permanent storage credentials to endpoints.

Use authenticated downloads or short-lived download URLs.

A checksum alone does not prove artifact authenticity.

Use a trusted digital signature where appropriate, with signing keys protected outside the application database and endpoint agents.

Verify the artifact before executing or installing it.

Validate target platform, version, approval, checksum, signature, and downgrade policy.

Do not execute arbitrary server-supplied scripts.

If a safe updater cannot be implemented without a disruptive installation change, implement the server-side release workflow first and document the limitation.

## 15. Audit and Administrative Security

Record:

- Configuration changes.
- Credential rotation and revocation.
- Enrollment and relevant authentication failures.
- Campaign creation and cancellation.
- Job retries and administrative overrides.
- Release uploads and approvals.
- Rollout initiation and rollback.
- Update success and failure.
- Sensitive administrative operations.

Use existing audit facilities if suitable; otherwise introduce the smallest justified addition.

Do not log credentials or sensitive payloads.

Use the application's existing authentication and authorization framework where suitable.

If the current application lacks sufficient authorization controls, identify this as a security dependency. Do not expose administrative operations publicly while waiting for the broader authentication implementation.

Apply appropriate validation, rate limits, and request-size limits to sensitive endpoints.

## 16. Required Tests

Use the existing backend and frontend test conventions.

### 16.1. Authentication

Test valid, invalid, expired, and revoked credentials; agent isolation; unauthorized administrative actions; credential rotation; interrupted rotation; and enrollment protections.

### 16.2. Configuration

Test global defaults, group overrides, device overrides, precedence, versioning, invalid configurations, and retention of the last known valid configuration.

### 16.3. Jobs

Test campaign creation, concurrency limits, atomic claiming, duplicate prevention, retries, lease expiry, offline agents, cancellation, idempotent results, and inventory ingestion.

### 16.4. Device Identity and Network Inventory

Add automated tests that verify:

- UUID generation or assignment occurs only during initial registration when required.
- The same device retains its ID across repeated inventory submissions.
- Hostname changes do not create a new device.
- IP address changes do not create a new device.
- MAC address changes do not automatically create a new device.
- Multiple MAC addresses are collected, normalized, and represented correctly.
- Multiple IP addresses are collected and associated with the appropriate interfaces where possible.
- Duplicate addresses within a single report are handled correctly.
- Missing or invalid MAC addresses follow the documented policy.
- Missing or corrupted local identity follows the approved recovery process.
- Reinstallation preserves identity when the supported installation model permits it.
- Conflicting or cloned identities do not silently merge different devices.
- Existing device IDs, primary keys, foreign keys, and inventory history remain intact.
- Legacy PowerShell and other supported agents continue to submit valid inventory.
- The C# agent payload is accepted by the actual backend contract.
- Invalid or unauthenticated submissions cannot overwrite another device's identity or inventory.

### 16.5. Releases

Test upload validation, version/platform validation, checksums, signatures where configured, access restrictions, approval, failure reporting, and rollback where implemented.

### 16.6. Regression

Run existing inventory, authentication, onboarding, compliance, and other relevant tests.

Run Prisma validation and migration checks.

Run backend and frontend builds and lint checks where available.

Do not reset the database or use production data.

Do not claim tests passed unless they were executed successfully.

## 17. Implementation Order

Follow this sequence:

1. Repository discovery and architecture report.
2. Inventory JSON contract verification and tests.
3. Device identity and network inventory design, including the UUID persistence and recovery policy.
4. C# agent DTOs and inventory collectors.
5. C# logging, resilience, and local configuration.
6. MSI packaging and GitHub Actions foundation.
7. Agent Management database and authentication foundation.
8. Agent check-in, heartbeat, and configuration polling.
9. C# integration with the verified backend.
10. Durable synchronization campaigns and jobs.
11. React Agent Management pages.
12. Release metadata, approval, and controlled rollout.
13. Secure updater integration where supported.
14. Regression testing, security review, and final diff review.

Do not start implementation before the initial discovery report.

Do not skip the JSON contract phase.

Do not deploy or run a mass campaign without explicit approval.

Do not change existing device identity or database primary keys until the migration plan is reviewed and approved.

## 18. Phase Completion Reports

At the end of every phase, report:

- Files added or modified.
- Implemented functionality.
- Database and migration changes.
- API changes.
- Tests executed and actual results.
- Compatibility checks.
- Security risks.
- Known limitations.
- Remaining work.
- Whether the next phase can safely proceed.

If the complete project cannot be finished safely in one session, leave the repository in a coherent and testable state.

Never report incomplete functionality as production-ready.

## 19. Acceptance Criteria

The module is complete only when:

- Existing inventory ingestion still works.
- Existing PowerShell collection remains intact.
- The C# agent follows the verified JSON contract.
- The device has a stable internal identity that persists across inventory syncs.
- Hostname, MAC addresses, and IP addresses are collected according to the approved requirements.
- Hostname and IP changes do not create duplicate device records.
- Multiple network interfaces and addresses are handled correctly.
- Device identity recovery and conflict handling are documented and tested.
- Existing device records, inventory history, and relationships remain intact.
- Agent status and last-seen information are persisted and accurate.
- Configuration precedence works as specified.
- Credentials are independently managed and revocable.
- Credential rotation has a safe recovery path.
- Jobs are durable, concurrency-controlled, and idempotent.
- Campaign progress reflects persisted state.
- Release approval is separate from rollout.
- Artifact integrity and authenticity are verified before installation where supported.
- Existing database data and migrations are preserved.
- Existing frontend, backend, and deployment workflows remain functional.
- Relevant tests pass or remaining failures are documented.
- All unsupported or unverified behavior is clearly identified.