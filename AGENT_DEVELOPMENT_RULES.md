## 5.1. Stable Device Identity and Network Inventory

### Device ID — `device_id`

The agent must support a persistent UUID-based device identity according to the verified backend contract and approved enrollment protocol.

Requirements:

- Generate or obtain the device UUID during initial registration, not during every inventory run.
- Persist the UUID locally using a dedicated identity/configuration mechanism.
- Reuse the same UUID across service restarts, inventory synchronizations, and supported agent upgrades.
- Preserve the UUID across agent reinstallation where the installation and recovery design safely permits it.
- Do not derive the permanent device ID from the hostname, MAC address, or IP address.
- Do not generate a replacement UUID automatically whenever a network adapter, hostname, or IP address changes.
- Do not silently replace a missing, invalid, or conflicting identity.
- Handle missing local identity through the documented enrollment or recovery process.
- Protect the local identity file against unauthorized modification using appropriate Windows file-system permissions.
- Never treat the UUID itself as an authentication credential or proof of device ownership.
- Do not embed permanent shared secrets in the executable or MSI.
- Ensure the backend associates the authenticated agent with its authorized device using server-side identity mapping.

Before implementation, inspect the existing device identifier, registration protocol, inventory DTOs, and backend persistence logic. Reuse the existing stable identity mechanism if one already exists and satisfies these requirements.

Do not change database primary keys or replace existing device identifiers without an explicitly approved migration and compatibility plan.

### Hostname — `hostname`

Collect the current hostname from Windows using an appropriate API supported by the selected .NET target.

Requirements:

- Include the hostname in the inventory payload when supported by the verified contract.
- Refresh the hostname during inventory collection.
- Handle hostname changes without changing the persistent device UUID.
- Do not use hostname as the sole identity or authentication mechanism.
- Handle collection failures without corrupting the stored device identity.
- Do not report the Windows service account as the interactive user merely because the agent runs as a service.

### MAC Addresses — `mac_addresses`

Collect eligible MAC addresses from the system's network interfaces.

Requirements:

- Support multiple network interfaces.
- Normalize MAC addresses into a consistent format, such as `A4:BB:6D:12:34:56`, if compatible with the existing contract.
- Exclude loopback interfaces and unusable MAC addresses.
- Apply a documented selection policy for Ethernet, Wi-Fi, VPN, and virtual adapters.
- Avoid duplicate MAC entries in a single report.
- Do not assume that the device has only one MAC address.
- Do not use MAC addresses as permanent device IDs or authentication credentials.
- Do not create a new device solely because its MAC addresses change.
- Do not assume a matching MAC address proves two reports belong to the same physical device.
- Associate MAC addresses with their respective network interfaces where supported by the payload contract.
- Do not fabricate a MAC address when collection fails.

If the existing contract supports only one MAC address, report this limitation and propose a backward-compatible extension. Do not silently change the JSON structure.

### IP Addresses — `ip_addresses`

Collect the current IP addresses associated with eligible network interfaces.

Requirements:

- Collect IPv4 and IPv6 addresses when available and supported.
- Support multiple IP addresses and network interfaces.
- Associate each address with its interface and MAC address where possible.
- Exclude loopback addresses.
- Identify private, public, link-local, and APIPA addresses accurately where relevant.
- Normalize addresses and remove duplicates within a single report.
- Handle DHCP changes, VPN connections, virtual adapters, disconnected interfaces, and network transitions.
- Do not use an IP address as a permanent device identifier.
- Do not create a new device because an IP address changes.
- Do not confuse local interface addresses with the public IP observed by the server.
- Do not fabricate missing addresses.
- Follow the verified contract for representing empty collections, missing fields, and null values.

Keep the current interface addresses separate from historical address observations unless historical tracking is explicitly supported by the existing architecture.

### JSON Contract and Backend Compatibility

The existing inventory JSON contract remains authoritative.

Before adding or changing these fields:

1. Inspect the complete reference JSON, the PowerShell collector, backend DTOs, validation rules, and database schema.
2. Determine whether the existing payload already contains equivalent identity or network fields.
3. Reuse existing property names and structures when appropriate.
4. Define any required mapping between the agent's internal DTOs and the existing API contract.
5. Add contract tests covering property names, casing, types, arrays, nullability, and missing values.
6. Coordinate changes with the backend and database only through the approved implementation plan.
7. Preserve compatibility with the existing PowerShell collector.
8. Do not modify the reference JSON merely to make the implementation pass.
9. Do not add speculative fields or invent undocumented API routes.

If the contract cannot represent multiple MAC addresses or IP addresses, report the limitation and request approval before changing the contract.

### Identity Persistence and Recovery

The implementation must document and test:

- Where the UUID is stored locally.
- How the identity is protected using Windows file-system permissions.
- How the UUID survives service restarts and supported upgrades.
- What happens when the identity file is missing or corrupted.
- How reinstallation preserves or safely re-establishes identity.
- How cloned identities or conflicting registrations are detected.
- How agent authentication is associated with the correct device.
- How the agent behaves when enrollment or identity recovery cannot complete.

Do not automatically claim an existing device based only on a matching hostname, MAC address, IP address, or locally stored UUID.

### Required Tests

Add automated tests for:

- Stable UUID across repeated inventory runs.
- Stable UUID across service restarts and supported upgrades.
- Hostname changes without identity changes.
- Multiple MAC addresses and consistent normalization.
- Multiple IP addresses and interface association.
- DHCP and network adapter changes.
- Missing or unusable MAC addresses.
- Missing or corrupted local identity.
- Enrollment and recovery failures.
- Conflicting or cloned identities.
- JSON contract compatibility with the verified reference payload.
- Backward compatibility with existing PowerShell submissions.

Inject network interface providers and identity storage dependencies where practical so tests do not require physical hardware.

Never use production device records or production credentials in tests.

Do not claim reinstallation, Windows permission behavior, or hardware collection has been verified unless it has actually been tested in an appropriate Windows environment.