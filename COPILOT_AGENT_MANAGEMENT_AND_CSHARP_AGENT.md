# Master Task: Centralized ITAM Agent Management + Production-Ready C# Windows Agent

## Mission

You are working inside the existing IT Asset Management Platform repository.

Your mission is to understand, extend, test, and document the existing ITAM application while introducing a new C#/.NET Windows endpoint inventory agent, a reproducible MSI installer, automated GitHub Actions packaging, and centralized Agent Management integrated with the existing backend.

The existing platform uses React, Node.js/Express, PostgreSQL, Prisma, Docker, and GitHub Actions. The existing endpoint collector is implemented separately in Python.

**The highest priorities are backward compatibility, data integrity, security, and verifiable implementation.**

You must preserve the existing application, Python agent, inventory API, database records, authentication, deployment configuration, and working functionality unless a change is demonstrably necessary and has been safely planned.

The C# agent must be developed alongside the existing Python agent. Do not remove, replace, disable, or destructively modify the Python implementation during migration.

This is an implementation task, not merely a design or code-generation exercise. Inspect the repository, implement changes incrementally, execute available tests, review the final diff, and report the actual results.

---

# 1. Mandatory Rules

## 1.1 Repository-first development

Before modifying any application file:

1. Inspect the repository structure and relevant files.
2. Read all applicable instructions, including `AGENTS.md`, `CLAUDE.md`, `README.md`, and any specialized development documents.
3. Locate the complete reference JSON file and inspect every field.
4. Inspect the existing Python agent and its installation, configuration, scheduling, authentication, and upload mechanisms.
5. Inspect the existing backend inventory API and its actual payload requirements.
6. Inspect the Prisma schema, migrations, authentication, authorization, logging, frontend routes, Docker configuration, and GitHub Actions workflows.
7. Identify the oldest Windows versions and architectures that are actually required and supported.
8. Document architectural assumptions and compatibility risks.

Do not start coding before completing the discovery report.

Do not create, overwrite, or replace project instruction files before inspecting their current contents.

## 1.2 Protect existing functionality

Never:

- Run `prisma migrate reset`.
- Delete or reset production or development databases.
- Delete existing inventory records or tables.
- Modify real production secrets or environment variables.
- Commit credentials, tokens, private keys, signing keys, or passwords.
- Replace working API routes when an additive extension is sufficient.
- Change unrelated application dependencies, ports, Docker images, deployment targets, or CI/CD workflows.
- Publish a production release or deploy software to endpoints without explicit approval.
- Trigger a mass synchronization campaign or mass update without explicit approval.
- Claim that code, tests, packaging, installation, deployment, or compatibility works unless verified.
- Invent missing API contracts, authentication protocols, JSON fields, or hardware values.

Use small, reviewable changes. Preserve unrelated user changes in the working tree.

Before potentially destructive operations, explain the risk and request approval.

## 1.3 Instructions and documentation

Use these instruction files when appropriate:

- `AGENTS.md`: general repository-wide rules for Copilot.
- `AGENT_DEVELOPMENT_RULES.md`: C# agent development, JSON contract, collectors, service, installer, tests, and packaging requirements.
- `agent-management-requirements.md`: centralized Agent Management requirements.

Inspect whether these files already exist.

If they exist, merge relevant additions without destroying existing instructions. If they do not exist, create them only as appropriate during the implementation phase, after discovery and with clearly scoped responsibilities.

Keep the master implementation plan in this document. Specialized instruction files should contain reusable development rules rather than duplicate the entire master task.

Do not assume the existence of an `AGENTS.md` file merely because this document refers to it.

---

# 2. Phase Zero: Complete Repository Discovery

**This phase must not modify application files.**

Inspect and document the following.

## 2.1 Backend

Identify:

- Node.js version and package manager.
- Express application entry point.
- Router organization and middleware.
- Authentication and authorization mechanisms.
- Inventory ingestion routes and validation.
- Existing device identity and inventory models.
- JSON parsing, normalization, and persistence behavior.
- Error handling and response conventions.
- Existing logging and audit facilities.
- Background jobs, schedulers, and workers.
- Existing file-upload and artifact-storage mechanisms.
- Environment variable conventions.

## 2.2 Database

Inspect:

- Complete Prisma schema.
- Existing migrations and migration history.
- Users, roles, permissions, devices, inventory, branches, and organizational relationships.
- Primary keys, foreign keys, unique constraints, and indexes.
- Existing database transaction patterns.
- Current migration strategy.
- Existing entities that can be extended instead of duplicated.

## 2.3 Frontend

Inspect:

- React application structure.
- Routing and navigation.
- Authentication and role-based access.
- Existing dashboards, tables, pagination, forms, dialogs, and notifications.
- Reusable components and styling conventions.
- Existing API client and error-handling patterns.

## 2.4 Existing Python agent

Locate the actual implementation, including its entry point, dependencies, packaging, and installation scripts.

Determine:

- How inventory is collected.
- How device identity is established.
- How JSON is constructed.
- The exact upload endpoint and HTTP method.
- Whether authentication exists and how it works.
- How scheduling and retries work.
- Whether the agent is a script, executable, service, scheduled task, or another mechanism.
- Supported Python and Windows versions.
- Configuration storage and file permissions.
- Logging and diagnostic procedures.
- Existing update or self-repair mechanisms.
- How its installation can coexist with the new C# agent.

Do not infer these properties from filenames alone. Follow the actual execution flow.

## 2.5 Reference JSON

Find the complete supplied JSON reference.

Inspect:

- Every property.
- Exact property names and casing.
- Nesting.
- Arrays and item structure.
- Primitive data types.
- Nullable properties.
- Optional fields.
- Empty arrays and missing values.
- The relationship between the reference JSON and the actual backend ingestion contract.

The following are examples of expected fields, not a complete schema:

- `domain`
- `osName`
- `loggedInUser`
- `motherboard`
- `computerName`
- `osVersion`
- `gitConfig`
- `software`
- `ramModules`
- `disks`
- `osBuild`
- `cpu`

Do not assume these examples describe every field in the reference file.

If multiple reference JSON files exist, determine which one is authoritative and document any differences.

If the reference JSON is missing or ambiguous, do not invent its structure. Continue with the repository investigation and report the blocker before implementing the serialization contract.

## 2.6 Infrastructure and CI/CD

Inspect:

- Dockerfiles and Compose configuration.
- Nginx and reverse-proxy configuration.
- Environment variables and secrets handling.
- Existing GitHub Actions workflows.
- Branch and release conventions.
- Backend and frontend build commands.
- Existing tests and test databases.
- Deployment scripts and rollback practices.
- Repository permissions and artifact conventions.

## 2.7 Required discovery report

Before changing application files, produce a concise report containing:

1. Existing architecture and data flow.
2. Relevant files and entry points.
3. Python agent lifecycle and installation method.
4. Existing JSON and inventory API contract.
5. Current authentication and authorization model.
6. Current database schema and migration strategy.
7. Existing testing and CI/CD procedures.
8. Proposed C# agent architecture and framework selection.
9. Proposed Agent Management architecture.
10. Files likely to change.
11. Compatibility, security, and deployment risks.
12. Phased implementation and verification plan.
13. Missing decisions that require my approval.

Once discovery is complete, proceed incrementally if the design is sufficiently understood.

Ask me only when a missing decision materially affects security, data integrity, compatibility, operating-system support, or a potentially disruptive installation change.

---

# 3. Target Architecture

Build on the existing architecture rather than replacing it.

Expected components:

- Existing React frontend.
- Existing Node.js/Express backend.
- Existing PostgreSQL database and Prisma.
- Existing Python agent retained during migration.
- New C#/.NET Windows agent.
- Windows MSI installer.
- GitHub Actions build, test, publish, and package workflow.
- Existing reverse proxy and deployment configuration.
- PostgreSQL-backed job scheduling where suitable.

Expected initial scale: approximately 100–500 endpoints.

Prefer outbound HTTPS polling from endpoints.

Do not introduce Redis, RabbitMQ, Kafka, or another external message broker without demonstrating a real requirement that cannot reasonably be met by PostgreSQL and the current application architecture.

Keep the C# agent's inventory contract separate from its internal implementation models.

Keep agent identity and credentials separate from inventory data.

Keep release artifacts outside ordinary relational records unless the existing architecture provides a justified alternative.

---

# 4. Phase One: Establish the Inventory Contract

Complete this phase before implementing hardware collectors or changing the backend inventory behavior.

## 4.1 Canonical contract

Treat the supplied JSON as the canonical compatibility reference, subject to verification against the actual backend.

Create explicit C# DTOs representing the real contract.

Requirements:

- Preserve property names and casing exactly.
- Preserve nesting and array structure.
- Preserve compatible primitive data types.
- Preserve nullable values where permitted.
- Use consistent numeric types and units.
- Serialize missing data according to the actual contract.
- Never substitute fabricated inventory values.
- Never serialize arbitrary internal objects directly.
- Do not silently rename or remove existing properties.
- Do not modify the backend's accepted payload to match an incorrect assumption.

Use `System.Text.Json` or another justified serializer with explicit serialization options.

Avoid reliance on implicit naming conventions that could change property casing.

## 4.2 Contract tests

Add automated tests that validate:

- Required property names.
- Property casing.
- Object nesting.
- Array structure.
- Numeric and string types.
- Null handling.
- Empty collections.
- Optional properties.
- Representative serialized output.
- Compatibility with the existing API's actual accepted payload.

Where possible, compare the generated JSON structurally with the reference fixture instead of comparing whitespace or property order.

Do not use the reference machine's hardware values as production collector output.

Do not modify the reference fixture merely to make a failing implementation pass.

If the backend accepts a wrapper object or requires additional fields, document the mapping and test it.

**Phase-one exit condition:** the JSON contract and backend ingestion requirements are documented and covered by executable tests before real collection and upload are implemented.

---

# 5. Phase Two: Build the C# Windows Agent

## 5.1 Technology selection

Use:

- C#.
- A supported .NET LTS release.
- `Microsoft.Extensions.Hosting`.
- `Microsoft.Extensions.DependencyInjection`.
- `Microsoft.Extensions.Logging`.
- `Microsoft.Extensions.Configuration`.
- `System.Text.Json` or an equivalent justified serializer.
- `HttpClientFactory` or a correctly managed `HttpClient`.
- Windows APIs, CIM/WMI, registry APIs, or other suitable Windows inventory mechanisms.
- A maintained MSI packaging solution such as WiX Toolset.
- GitHub Actions for reproducible builds.

Select the .NET target framework and runtime only after checking the oldest required Windows versions and architectures.

Do not assume the latest .NET runtime supports every legacy Windows endpoint.

If Windows 7 or another unsupported OS is present, explicitly investigate framework compatibility and support limitations. Do not promise support that the selected runtime does not provide.

Prefer self-contained deployment where appropriate. Document any native operating-system prerequisites that cannot be bundled.

Keep dependencies minimal.

## 5.2 Application architecture

Prefer a modular architecture with separate components for:

- Application startup and hosted service lifecycle.
- Configuration loading and validation.
- Inventory collection orchestration.
- Individual inventory collectors.
- DTOs and JSON serialization.
- HTTP/API integration.
- Authentication and credential storage.
- Retry and timeout handling.
- Job execution.
- Logging and log rotation.
- Update verification and updater integration, where supported.

Inject dependencies to make collectors and API interactions independently testable.

Prevent overlapping inventory runs.

Support graceful shutdown and cancellation.

Avoid broad exception suppression.

## 5.3 Operating system and device identity

Collect available values for:

- Computer name.
- Domain or workgroup.
- Windows product name.
- OS version.
- OS build.
- System architecture.
- Logged-in interactive user, when available.

Do not confuse the service account with the currently logged-in interactive user.

Handle multiple sessions, disconnected sessions, service accounts, and endpoints with no interactive user.

Follow the reference JSON's exact representation of unavailable values.

## 5.4 Motherboard

Collect:

- Manufacturer.
- Model.
- Serial number.

Handle missing values, restricted WMI access, and provider errors without terminating the entire inventory run.

## 5.5 CPU

Collect:

- Processor model.
- Physical core count.
- Logical processor count.
- Architecture.
- Clock speed in the correct unit.

Do not confuse logical processors with physical cores.

Document the source of CPU information and any platform-specific limitations.

## 5.6 RAM

Collect installed memory modules when available:

- Slot or device locator.
- Capacity in GB.
- Speed in MHz.
- Serial number.

Handle unavailable or malformed properties independently.

Do not terminate collection because a RAM module lacks a serial number.

## 5.7 Disks

Collect:

- Model.
- Serial number when available.
- Total capacity.
- Free capacity.
- Disk type when reliably identifiable.

Determine whether the reference contract measures physical disk capacity or logical volume capacity.

Use the definition required by the existing contract.

Do not label an unknown disk as an SSD or HDD without reliable evidence.

Represent unknown information according to the schema.

## 5.8 Installed software

Use appropriate registry-based inventory sources, including relevant 32-bit and 64-bit uninstall registry locations.

Collect:

- Publisher.
- Display name.
- Display version.
- Installation date when available.

Do not use `Win32_Product` as the default inventory mechanism.

Handle:

- Missing registry values.
- Malformed installation dates.
- Duplicate entries.
- Per-user versus machine-wide entries where relevant.
- Localized values.
- Access-denied errors.

Do not treat arbitrary files as installed applications.

## 5.9 Additional reference fields

Inspect the actual implementation and reference JSON to determine how fields such as `gitConfig` and any additional properties are populated.

Do not fabricate data.

If a field cannot be collected reliably, follow the established nullable or optional representation.

## 5.10 Independent collector failures

Each collector should fail independently when possible.

A failure to collect one hardware property must not prevent the remaining collectors from completing.

Record:

- Collector name.
- Start and completion time.
- Duration.
- Success, partial success, or failure.
- Sanitized diagnostic information.

Return partial inventory when the contract and backend permit it.

**Phase-two exit condition:** the C# agent dynamically collects inventory and passes contract tests without requiring a connection to production.

---

# 6. Phase Three: Logging, Resilience, and Local Configuration

## 6.1 Log location

Preferred log directory:

`C:\ProgramData\ITAM\Agent\Logs\`

Use a configurable root if the existing deployment requires another location.

Create the directory during installation or safe first startup.

Configure appropriate ownership and permissions for the selected service identity.

Do not grant unrestricted write access to all users.

## 6.2 Structured logging

Log the following:

- Application startup and shutdown.
- Agent version.
- Agent identity, using a non-secret identifier.
- Configuration version.
- Inventory run and correlation identifiers.
- Collector start, completion, duration, and outcome.
- API request method and sanitized endpoint.
- HTTP status and request duration.
- Retry attempts and reasons.
- Authentication failures.
- JSON serialization and upload outcomes.
- Job execution and result reporting.
- Configuration polling.
- Update verification, installation, health checks, and rollback when supported.
- Directory and permission failures.
- Unexpected exceptions and stack traces.

Never log:

- Passwords.
- Bearer tokens.
- Refresh tokens.
- Authorization headers.
- Private keys.
- Enrollment secrets.
- Other sensitive credentials.

Sanitize exception messages if they might contain request headers, URLs containing secrets, or sensitive payloads.

Use bounded log rotation and retention.

Prevent logs from consuming unlimited disk space.

Provide a documented diagnostic collection procedure.

## 6.3 Error handling

Handle:

- Network timeouts.
- DNS and connection failures.
- Authentication and authorization errors.
- Invalid server responses.
- Serialization errors.
- WMI/CIM failures.
- Registry access errors.
- Disk write failures.
- Cancellation.
- Configuration validation failures.
- Update verification failures.

Retry transient failures using bounded exponential backoff with jitter.

Do not retry permanent authentication or validation failures indefinitely.

Apply timeouts to HTTP and external operations.

Do not swallow unexpected exceptions silently.

Use clear startup or one-shot diagnostic exit codes where applicable.

## 6.4 Local bootstrap configuration

Store only necessary bootstrap settings, such as:

- Backend base URL.
- Agent identifier.
- Enrollment information when required.
- Supported local operational settings.
- Configuration version.

Do not embed permanent shared credentials in source code, the executable, or the MSI.

Use protected OS storage for persistent secrets, such as Windows DPAPI where supported and appropriate.

Document the behavior on operating systems that do not support the selected protection mechanism.

Validate configuration before applying it.

Do not allow remote configuration to execute arbitrary commands, PowerShell, or arbitrary downloaded code.

---

# 7. Phase Four: Windows Background Execution and MSI

## 7.1 Installation model

Inspect the existing Python agent's installation method before selecting the final C# service architecture.

Do not assume the existing agent is a Windows Service.

The new C# agent must coexist with the Python agent until compatibility and migration are verified.

Do not reuse the Python service name or configuration paths without investigation.

If a Windows Service is appropriate, implement a Worker Service or equivalent long-running process.

Use a dedicated service identity with the minimum necessary privileges.

Do not default to LocalSystem unless specific, documented requirements justify it.

## 7.2 MSI requirements

Create a reproducible Windows MSI containing the required application and runtime components.

The installer must support:

- Normal installation.
- Silent installation.
- Upgrade.
- Uninstall.
- Service registration where applicable.
- Controlled service startup.
- Configuration directory creation.
- Log directory creation.
- Appropriate permissions.
- Version metadata.
- Installer error reporting.
- Upgrade rollback.
- Preservation of configuration and diagnostic logs.
- Avoidance of duplicate service instances.

Do not delete user data or logs unexpectedly during uninstall.

Do not modify the existing Python installation automatically.

Do not introduce an incompatible migration of deployed endpoints without explicit approval.

## 7.3 Documented commands

Document the exact commands supported by the built installer for:

- Installing.
- Silent installing.
- Upgrading.
- Uninstalling.
- Creating verbose MSI logs.
- Checking service status.
- Reviewing Event Viewer logs.
- Locating application logs.

Validate command syntax against the actual generated MSI and service name.

Do not document untested installer options as verified.

**Phase-four exit condition:** the MSI is generated reproducibly, contains the expected files, and can be validated in an appropriate Windows test environment or through clearly documented static/package checks.

---

# 8. Phase Five: Secure Agent Identity and Authentication

## 8.1 Inspect before designing

Inspect the current backend and existing Python agent authentication first.

Do not assume a shared password, API token, or pre-existing enrollment mechanism.

Design the new C# agent's integration around the actual backend contract.

## 8.2 Agent identity

Each registered agent must have an independently identifiable credential.

Requirements:

- Unique agent identity.
- Independent authentication.
- No shared permanent credential across all devices.
- Hostname or IP address alone must never prove identity.
- No hardcoded permanent credentials.
- No plaintext credential storage on the server.
- No credential leakage in logs.
- Appropriate credential rotation and revocation.
- Authorization limited to that agent's permitted resources.
- Audited administrative credential operations.

## 8.3 Enrollment

If the backend lacks agent authentication, implement a secure enrollment design rather than a shared secret embedded in the executable.

Use single-use or short-lived enrollment credentials where feasible.

Require an authorized administrative action or other trusted enrollment process before accepting a device as a registered agent.

Do not create a public unauthenticated endpoint that allows arbitrary devices to register themselves as trusted.

Protect enrollment against replay and unauthorized reuse.

## 8.4 Rotation and recovery

Support secure credential rotation without requiring manual reinstallation of every endpoint.

The protocol must:

1. Authenticate the existing agent.
2. Authorize the rotation.
3. Issue a replacement credential through a protected exchange.
4. Persist the replacement securely on the endpoint.
5. Confirm successful activation.
6. Revoke the previous credential only when safe.
7. Recover from interrupted rotation.
8. Permit immediate administrative revocation of a compromised agent.

Use a recoverable rotation state machine or equivalent design.

Do not invalidate every deployed credential simultaneously during a migration.

If the Python agent requires a separate migration protocol, do not force it onto the new protocol without a tested compatibility plan.

## 8.5 Distinct control states

Keep these concepts separate:

- Agent registration.
- Credential validity.
- Agent enabled/disabled state.
- Inventory collection enabled/disabled state.
- Automatic synchronization enabled/disabled state.
- Administrative revocation.

Disabling collection must not prevent the agent from receiving configuration changes if management connectivity remains enabled.

If an agent is fully disabled, document the authorized recovery or re-enrollment procedure.

All communication must use HTTPS.

**Phase-five exit condition:** authentication and enrollment behavior are documented, implemented, and covered by tests without breaking existing agents.

---

# 9. Phase Six: Centralized Agent Management Backend

## 9.1 Existing application integration

Extend the current Express backend, Prisma schema, and authentication model.

Do not replace the existing inventory endpoint.

Reuse existing device and organizational relationships when appropriate.

Do not create duplicate inventory tables.

Logical entities may include:

- Agent metadata.
- Agent credentials.
- Versioned configuration.
- Group or branch configuration assignments.
- Device-specific overrides.
- Sync campaigns.
- Agent jobs.
- Agent releases.
- Update execution records.
- Heartbeat metadata.
- Audit records.

Create only the models that are necessary after inspecting existing equivalents.

Use foreign keys, unique constraints, indexes, timestamps, and validated status transitions.

Keep historical configuration and release metadata traceable.

## 9.2 Agent overview

Implement a React Agent Management section showing real database-backed statistics:

- Total registered agents.
- Online and offline agents.
- Enabled and disabled agents.
- Current approved release adoption.
- Agents requiring updates.
- Failed updates.
- Failed or overdue sync jobs.
- Last successful inventory synchronization.
- Recent agent activity and errors.

Define online status using a configurable heartbeat timeout.

A recent check-in must not be confused with a successful inventory synchronization.

## 9.3 Agent list and details

Provide:

- Search by hostname and existing device identifiers.
- Pagination.
- Group or branch filtering.
- Operating system filtering.
- Agent version filtering.
- Online status filtering.
- Configuration version filtering.
- Sync status filtering.
- Update status filtering.
- Last-seen timestamp.
- Current and desired agent versions.
- Last applied configuration version.
- Last successful inventory synchronization.
- Credential status.
- Authorized administrative actions.

Use the application's existing UI conventions and permission checks.

## 9.4 Configuration management

Support three configuration layers:

1. Global defaults.
2. Group or branch overrides.
3. Device-specific overrides.

Only explicitly configured override fields may replace inherited values.

Calculate effective configuration using deterministic precedence.

Version configurations and audit changes.

Expose only settings that the agent actually supports.

Potential settings include:

- Agent enabled/disabled.
- Hardware collection enabled/disabled.
- Software collection enabled/disabled.
- Automatic synchronization enabled/disabled.
- Check-in interval.
- Automatic synchronization interval.
- Configuration refresh behavior.
- Supported collection capabilities.
- Update channel.

Validate server-side and client-side.

The agent must validate a downloaded configuration before applying it and retain its last known valid configuration if the new one is invalid.

Configuration must never enable arbitrary shell execution.

Deliver configuration efficiently using version-based polling rather than resending large unchanged payloads.

## 9.5 Agent polling API

Adapt routes to existing conventions. Suggested logical capabilities include:

- Check-in and heartbeat.
- Configuration retrieval.
- Job retrieval.
- Atomic job claiming or acknowledgment.
- Job result reporting.
- Inventory upload through the existing compatible contract.
- Update manifest retrieval.
- Update progress and completion reporting.
- Credential rotation.

Suggested route examples, subject to actual discovery:

- `POST /api/v1/agent/check-in`
- `POST /api/v1/agent/jobs/:jobId/claim`
- `POST /api/v1/agent/jobs/:jobId/result`
- `POST /api/v1/agent/inventory`
- `GET /api/v1/agent/updates/manifest`
- `POST /api/v1/agent/updates/:releaseId/result`

Do not create duplicate routes if equivalent capabilities already exist.

Every endpoint must enforce the correct authentication and authorization.

An authenticated agent may access only its own configuration, jobs, results, and authorized release information.

Validate all input and limit request size.

Return consistent errors without leaking internal secrets or stack traces.

Use timeouts, retry guidance, and safe error handling.

## 9.6 Inventory compatibility

Preserve the current inventory JSON contract and ingestion behavior.

If the backend needs to associate the request with an agent identity, use authenticated server-side identity mapping rather than trusting a client-supplied agent ID.

Make duplicate ingestion safe using existing identifiers and appropriate idempotency controls.

Do not modify unrelated inventory processing.

Older agents must continue working during a controlled migration whenever technically feasible.

**Phase-six exit condition:** the backend supports authenticated check-in and configuration delivery, and existing inventory ingestion remains compatible.

---

# 10. Phase Seven: Durable Sync Campaigns and Job Scheduling

## 10.1 Campaign capabilities

Implement administrator-triggered synchronization for:

- All eligible agents.
- Selected agents.
- A selected group or branch.

Provide:

- Batch size.
- Delay between batches.
- Maximum concurrent jobs.
- Maximum retry attempts.
- Campaign progress.
- Pending, running, succeeded, failed, skipped, and cancelled counts.
- Per-agent results.
- Cancellation of unstarted work.
- Safe retry of failed jobs.

Show a confirmation dialog before campaigns targeting many devices.

## 10.2 Durable jobs

Use PostgreSQL-backed jobs if appropriate for the current architecture and expected scale.

Each campaign and job must have durable records and explicit lifecycle states.

Jobs must support:

- Safe scheduling.
- Atomic claiming.
- Lease expiry.
- Bounded retries.
- Exponential backoff with jitter.
- Idempotent completion.
- Duplicate claim prevention.
- Offline agent handling.
- Cancellation of eligible unstarted work.
- Audit history.
- Per-agent execution results.

Use database transactions and locking, such as `FOR UPDATE SKIP LOCKED`, when compatible with the existing PostgreSQL and Prisma implementation.

Do not hold transactions open while agents collect inventory or download artifacts.

Enforce campaign-level and global concurrency limits.

Do not permit concurrent workers to claim the same job.

Prevent multiple campaigns from unintentionally creating overlapping sync jobs for the same agent.

Offline endpoints must not block campaign progress indefinitely.

Jobs should become available on the agent's next successful poll.

Distinguish an unstarted job cancellation from cancellation of an operation already executing on an endpoint.

Document limitations of in-progress cancellation.

## 10.3 Idempotency and recovery

Protect against:

- Duplicate campaign requests.
- Duplicate polling.
- Repeated result submissions.
- Expired job leases.
- Worker crashes.
- Offline endpoints.
- Retried inventory uploads.

Use unique constraints, transaction-safe state transitions, and idempotency keys where appropriate.

Frontend progress must reflect persisted database states, not locally fabricated progress.

**Phase-seven exit condition:** campaigns, retries, concurrency limits, leases, and persisted results have tests demonstrating their behavior.

---

# 11. Phase Eight: Secure Release Management and Updates

## 11.1 Inspect the actual installation model

Before implementing endpoint self-update, determine whether the Python agent and new C# agent use scripts, executables, services, scheduled tasks, or another mechanism.

Do not assume PyInstaller or a particular service manager is installed.

The C# service must not overwrite its own running executable unsafely.

If required, use a separately managed updater or supervisor.

If a safe endpoint updater cannot be delivered without disruptive installation changes, implement the server-side release-management workflow first and document the remaining requirement.

## 11.2 Release management

Provide administrative capabilities to:

- Upload a release.
- Record version.
- Record target operating system and architecture.
- Select stable or pilot channel.
- Store release notes.
- Calculate artifact size.
- Calculate SHA-256 checksum server-side.
- Verify a trusted digital signature when supported.
- Mark a release pending approval.
- Approve a release separately.
- Start a controlled rollout.
- Track update results.
- Roll back the desired release.

Uploading must not deploy the release automatically.

Separate release creation, approval, rollout, and rollback.

Use private or access-controlled artifact storage.

Do not store large binaries in ordinary relational rows without justification.

Do not expose permanent storage credentials to endpoint agents.

Use authenticated downloads or short-lived download URLs.

## 11.3 Authenticity and integrity

A checksum verifies integrity only relative to the expected checksum. It does not establish authenticity by itself.

Use a trusted signing mechanism where appropriate.

Protect signing keys outside the application database and endpoint agents.

The agent must trust a pinned public verification key or another suitable trust mechanism.

The updater must verify the artifact before execution or installation.

Validate:

- Version.
- Platform.
- Architecture.
- Release approval.
- Artifact integrity.
- Signature.
- Allowed downgrade behavior.

Never execute arbitrary scripts received from the server.

## 11.4 Safe installation and rollback

Where supported, the updater must:

1. Download to a temporary location.
2. Validate the manifest.
3. Verify the signature and checksum.
4. Confirm the target version and platform.
5. Preserve the previous working version.
6. Stop or coordinate the service safely.
7. Install or replace files safely.
8. Restart the agent.
9. Perform a health check.
10. Report the outcome.
11. Restore the previous working version if the new release fails.

Track states such as:

- Available.
- Downloading.
- Verifying.
- Installing.
- Health-check pending.
- Succeeded.
- Failed.
- Rolled back.

Prevent unauthorized downgrades and repeated update loops.

Do not claim rollback support unless the updater implements and tests it.

## 11.5 Gradual rollout

Support pilot and staged rollout.

Do not automatically update every endpoint after uploading or approving a release.

Define measurable rollout safety criteria, including failure thresholds and health-check results.

Require explicit approval before a production-wide rollout.

**Phase-eight exit condition:** release metadata, approval, authenticated access, and any implemented update mechanism are tested. Unsupported endpoint update scenarios are explicitly documented.

---

# 12. Phase Nine: React Administration Interface

Integrate with existing navigation, authentication, UI components, and API clients.

## 12.1 Overview page

Display real statistics and recent events.

Distinguish:

- Agent connectivity.
- Inventory synchronization.
- Configuration application.
- Update status.

## 12.2 Agent list and details

Provide searchable, paginated results and the required filters.

Show the effective configuration, inherited configuration layers, version history, last-seen information, recent jobs, update state, and authentication state where authorized.

Avoid exposing credential material.

## 12.3 Configuration page

Support global defaults, group assignments, and device overrides.

Show which values are inherited and which are explicitly overridden.

Validate forms and require confirmation for important changes.

Do not show unsupported agent settings.

## 12.4 Sync campaigns

Provide campaign creation, target selection, batch configuration, confirmation, progress, job history, retry, and safe cancellation.

Use server-persisted campaign data.

## 12.5 Releases

Provide upload, metadata, approval, rollout, progress, failure inspection, and rollback controls.

Require appropriate administrative permissions.

## 12.6 Activity and audit logs

Record and display:

- Configuration changes.
- Credential rotation and revocation.
- Campaign creation and cancellation.
- Release upload and approval.
- Rollout operations.
- Update success and failure.
- Administrative actions.
- Relevant security events.

Never log or display plaintext credentials.

**Phase-nine exit condition:** all displayed statistics and state changes are backed by real API/database behavior rather than demonstration data.

---

# 13. Phase Ten: GitHub Actions Build and MSI Packaging

Create a dedicated workflow for the C# agent, following repository conventions.

Do not unnecessarily modify existing application workflows.

## 13.1 Required workflow stages

1. Checkout the repository.
2. Install the selected .NET SDK.
3. Restore dependencies.
4. Run configured formatting and style checks.
5. Build in Release mode.
6. Run unit tests.
7. Run JSON contract tests.
8. Publish for the selected Windows runtime and architecture.
9. Generate the MSI using the selected packaging tool.
10. Validate MSI existence, architecture, and version metadata.
11. Calculate SHA-256 checksum.
12. Upload the MSI and checksum as workflow artifacts.
13. Preserve useful test results and logs on failure.

The workflow must fail if required compilation, tests, packaging, or artifact validation fails.

## 13.2 Security

Use pinned or appropriately controlled GitHub Actions versions consistent with repository policy.

Use least-privilege workflow permissions.

Do not expose secrets to untrusted pull-request builds.

Do not execute untrusted code with production credentials.

Do not automatically publish a production release or trigger endpoint updates on every push.

If code signing is configured, use an appropriately protected signing process.

Never claim an artifact is signed unless signature verification confirms it.

## 13.3 Artifact delivery

The workflow must produce:

- MSI installer.
- SHA-256 checksum.
- Relevant test results.
- Useful build and packaging logs.

Upload the artifacts to the GitHub Actions workflow run.

Document how a developer downloads them.

Do not claim that an MSI was generated unless the packaging job actually completed and the artifact was validated.

Do not create a production release automatically unless explicitly approved.

**Phase-ten exit condition:** a successful workflow produces a validated downloadable MSI and checksum.

---

# 14. Required Testing

Use the existing repository's test framework and conventions where possible.

Use isolated test databases and fixtures.

Do not run destructive tests against production data.

## 14.1 C# agent

Test:

- JSON property names and casing.
- Array and nested object structure.
- Null handling.
- Numeric units and types.
- Missing hardware properties.
- Independent collector failures.
- Software registry enumeration.
- Software deduplication.
- Serialization.
- HTTP authentication errors.
- Network timeouts.
- Retry limits.
- Malformed server responses.
- Configuration validation.
- Credential rotation integration where available.
- Update checksum and signature verification.
- Cancellation and graceful shutdown.
- Logging and log rotation.

Mock hardware sources and HTTP dependencies so unit tests do not depend on a specific physical machine.

## 14.2 Backend authentication

Test:

- Valid agent credentials.
- Invalid credentials.
- Revoked credentials.
- Agent-to-agent isolation.
- Unauthorized administrative actions.
- Credential rotation.
- Interrupted rotation and recovery.
- Enrollment expiration and reuse protection.

## 14.3 Configuration

Test:

- Global defaults.
- Group overrides.
- Device overrides.
- Correct precedence.
- Explicit versus absent overrides.
- Configuration version changes.
- Invalid configuration rejection.
- Last known valid configuration retention.

## 14.4 Jobs and campaigns

Test:

- Campaign creation.
- Batch scheduling.
- Global and campaign concurrency limits.
- Atomic job claiming.
- Duplicate claim prevention.
- Retry behavior.
- Lease expiration.
- Offline agents.
- Cancellation.
- Idempotent completion.
- Duplicate inventory ingestion protection.
- Worker crash recovery.

## 14.5 Release management

Test:

- Upload validation.
- Version and platform validation.
- Checksum calculation.
- Signature verification.
- Unauthorized downloads.
- Approval requirements.
- Failed update reporting.
- Health-check failure.
- Rollback where implemented.
- Downgrade restrictions.

## 14.6 Regression and deployment

Run, where available:

- Existing backend tests.
- Existing inventory API tests.
- Existing authentication tests.
- Prisma schema validation.
- Migration validation.
- Backend build and lint.
- Frontend build and lint.
- C# build and tests.
- Python agent tests.
- MSI packaging checks.
- Existing Docker builds.
- Existing CI checks.

Do not reset databases to make tests pass.

Do not claim an unavailable Windows test environment was tested.

Separate unit-test results, static checks, package validation, integration tests, and actual Windows installation tests.

Clearly document any test that could not be run.

---

# 15. Security Review Requirements

Before completion, inspect the final implementation for:

- Broken access control.
- Cross-agent resource access.
- Credential leakage.
- Insecure enrollment.
- Replay attacks.
- Unsafe credential rotation.
- Missing request validation.
- Unrestricted file uploads.
- Path traversal.
- Unrestricted artifact downloads.
- SSRF through user-controlled artifact URLs.
- Arbitrary command execution.
- Unsafe update execution.
- Insecure cryptographic storage.
- Missing rate limits on sensitive operations.
- Missing audit records.
- Race conditions in job claiming.
- Duplicate campaign execution.
- Unsafe database migrations.
- Exposure of internal errors.
- Excessive logging of sensitive data.
- Incorrect file permissions.
- Unsafe rollback or downgrade behavior.

Use the existing security mechanisms where appropriate.

Do not introduce an entirely separate authentication system without a documented reason.

Do not rely on frontend permissions alone. Enforce authorization on the backend.

Do not trust client-supplied agent identity, version, or authorization status without validating it.

---

# 16. Database Migration Requirements

Inspect the actual Prisma migration workflow.

Generate additive migrations wherever possible.

Preserve existing rows and relationships.

Use suitable constraints and indexes.

Ensure migration order and deployment compatibility.

Do not edit already-applied production migrations in a way that changes their historical meaning.

Do not execute a production migration without approval.

Where possible, verify the migration against an isolated test database initialized from the existing schema and migration history.

Report any migration requiring downtime, data transformation, or a coordinated agent rollout.

Do not add models simply because they appear in this specification. Reuse existing equivalents where appropriate.

---

# 17. Documentation Requirements

Create or update appropriate documentation for:

## Architecture

- Existing and new application components.
- Python and C# agent coexistence.
- JSON contract.
- API routes.
- Authentication.
- Configuration.
- Job scheduling.
- Release and update architecture.

## C# development

- Required SDK.
- Restore and build commands.
- Unit-test commands.
- JSON contract-test commands.
- Local inventory diagnostics.
- Configuration and logging.

## MSI installation

- Prerequisites.
- Interactive installation.
- Silent installation.
- Upgrade.
- Uninstall.
- Service verification.
- Installer verbose logging.
- Event Viewer troubleshooting.
- Diagnostic log collection.

## GitHub Actions

- Workflow triggers.
- Build and test stages.
- Artifact locations.
- MSI and checksum download.
- Approved release procedure.
- Signing configuration, if supported.

## Agent Management API

- Route definitions.
- Authentication requirements.
- Request and response schemas.
- Enrollment.
- Credential rotation.
- Heartbeats.
- Configuration polling.
- Job lifecycle.
- Inventory upload.
- Release downloads.
- Update reporting.

## Operational guidance

- Pilot rollout.
- Campaign concurrency.
- Failed job recovery.
- Agent revocation.
- Configuration recovery.
- Release approval.
- Rollback limitations.
- Migration from Python to C#.
- Troubleshooting and security considerations.

Do not document hypothetical capabilities as implemented.

---

# 18. Implementation Order and Phase Gates

Follow this order. Do not skip ahead merely to generate a large amount of code.

## Phase 1 — Discovery

Inspect the repository, existing Python agent, reference JSON, API, schema, authentication, UI, infrastructure, and CI/CD.

Deliver the architecture report and implementation plan.

Do not modify application files.

## Phase 2 — Contract and compatibility

Define and test the existing inventory JSON contract.

Document the API mapping and coexistence strategy.

## Phase 3 — C# inventory collection

Implement DTOs, serialization, independent collectors, logging, and resilience.

Run tests before implementing production integration.

## Phase 4 — MSI and CI foundation

Implement reproducible publishing and MSI packaging.

Add GitHub Actions build, test, package, and artifact upload.

Validate package metadata and document any unavailable Windows testing.

## Phase 5 — Backend Agent Management foundation

Implement the required additive database changes, secure identity, authentication, check-in, heartbeat, and versioned configuration delivery.

Keep the existing inventory endpoint working.

## Phase 6 — Secure C# integration

Integrate enrollment, authentication, configuration polling, inventory upload, and version reporting with the actual backend contract.

Test in a controlled environment.

## Phase 7 — Sync campaigns

Implement durable jobs, atomic claiming, concurrency limits, retries, leases, cancellation, and persisted results.

## Phase 8 — React administration

Implement overview, agent list, details, configuration management, and campaign UI.

## Phase 9 — Release management

Implement release metadata, private artifact delivery, approval, pilot rollout, and the compatible update protocol.

Do not implement unsafe self-update behavior merely to satisfy a checklist.

## Phase 10 — Hardening and regression

Run available tests, inspect security, validate migrations, build the frontend and backend, package the C# agent, and review the complete diff.

## Phase 11 — Controlled acceptance

Prepare a pilot deployment plan.

Do not deploy, publish, trigger mass synchronization, or update endpoints without explicit approval.

---

# 19. Rules at the End of Every Phase

At the end of each phase, report:

1. What was investigated or implemented.
2. Files added or modified.
3. Database/schema changes.
4. APIs or contracts introduced.
5. Tests actually executed and their real results.
6. Compatibility checks completed.
7. Security implications.
8. Known limitations.
9. Remaining work.
10. Whether the next phase can safely proceed.

Keep the repository in a coherent state between phases.

If the task cannot be completed safely in one session, stop at a tested and reviewable checkpoint. Do not leave the repository in a broken state or falsely report completion.

---

# 20. Final Acceptance Criteria

The overall project is complete only when the following have been verified.

## Existing application

- Existing inventory ingestion continues to work.
- Existing authentication remains compatible.
- Existing database records are preserved.
- Existing Python agent behavior remains intact.
- Existing Docker and CI/CD workflows remain functional.
- No unrelated application behavior was changed unnecessarily.

## C# agent

- The agent is implemented in C#.
- It dynamically collects supported inventory values.
- Its JSON matches the complete reference contract and backend requirements.
- Partial collector failures do not unnecessarily terminate collection.
- Configuration and logging are validated.
- Network retries and timeouts behave as expected.
- Secrets are stored and transmitted securely.
- The selected framework's Windows compatibility is documented and verified as far as the environment permits.

## MSI and CI/CD

- The MSI is generated reproducibly.
- The package contains the required components.
- Installation, upgrade, and uninstall behavior are verified as far as the environment permits.
- GitHub Actions builds and tests the agent.
- The workflow packages and validates the MSI.
- The MSI and SHA-256 checksum are downloadable workflow artifacts.
- No production release or deployment occurs without approval.

## Agent Management

- Administrators can view real agent status.
- Check-in and inventory synchronization are distinguished.
- Global, group, and device configuration precedence works.
- Configuration versions and audit records are persisted.
- Each agent has an independently managed credential.
- Credential rotation and revocation are implemented safely.
- Jobs and campaigns have durable state.
- Concurrency, retries, leases, and duplicate protection are tested.
- Releases require approval before rollout.
- Artifact authenticity and integrity are verified before execution or installation where the update mechanism is implemented.
- Failed updates are reported and rollback works where claimed.
- Backend authorization protects administrative and agent-specific operations.

## Verification and reporting

- Relevant tests pass, or failures and blockers are explicitly documented.
- Migration safety is evaluated.
- The final diff is reviewed.
- Remaining risks and unimplemented acceptance criteria are listed honestly.
- No feature is described as complete without evidence.

---

# 21. Start Here

**Start with Phase 1: repository discovery only.**

Inspect the actual repository and complete reference JSON. Read all applicable instructions before modifying files.

Produce the architecture report and implementation plan first.

Do not immediately create the C# project, database models, new API routes, MSI, or frontend pages.

Once discovery is complete, proceed phase by phase if compatibility, security, and data integrity are sufficiently understood.

If a critical design decision remains unresolved, explain the uncertainty and ask for approval before making the potentially breaking change.

The final objective is a production-minded centralized ITAM Agent Management system and a new C# Windows agent with a reproducible MSI and GitHub Actions packaging, developed alongside the existing Python agent without breaking the current platform.