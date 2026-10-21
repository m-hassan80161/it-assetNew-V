# Managed Agent API and Network Inventory

This document describes the initial backend Agent Management foundation. It does
not describe a Windows service or installer; the existing PowerShell collectors
remain supported through the legacy inventory endpoint.

## Device identity and enrollment

The server binds a managed agent to an existing `Device.id`, or creates a device
only when a Super Admin explicitly authorizes device creation in an enrollment
grant. The client does not submit a target device ID during enrollment. A
hostname is inventory data, not an identity credential; it cannot redirect an
agent to another device.

Enrollment grants are single-use, expire after 15 minutes, and are returned
once to the authenticated administrator. The server stores only a SHA-256
verifier. The grant must be delivered to the endpoint through an approved
protected process. Agent credentials are generated with 256 bits of randomness,
returned once, and stored on the server only as SHA-256 verifiers. They are
bearer credentials and must be sent only over HTTPS.

For an existing device, the administrator issues a grant bound to its
`deviceId`. For a new device, the administrator explicitly sets
`allowDeviceCreate: true` and omits `deviceId`. Repeated inventory requests
resolve the device from the authenticated server-side registration. The server
never uses client-supplied agent IDs, UUIDs, MAC addresses, or IP addresses to
select the device.

The first registration is unique per device. Revocation clears active and
pending credential verifiers immediately. Recovery requires an administrator
to issue a new grant for a revoked registration; recovery reuses the same
registration and `Device.id`. Conflicting hostnames are rejected, audited
without recording the hostname, and never trigger a device merge.

Credential rotation requires both the current active credential and a
short-lived administrator-issued rotation grant. The replacement credential is
stored as pending until the agent authenticates with it to confirm. The old
credential remains valid until confirmation; the pending credential expires
after 10 minutes. If delivery or confirmation is interrupted, the administrator
can issue a new rotation grant after the pending credential expires.

Administrators can disable, re-enable, or revoke registrations. Disabled
registrations cannot authenticate but retain their credential verifier so an
administrator can re-enable them. Device deletion is rejected while its
registration is enabled. A disabled or revoked registration can be deleted
with its device; its registration and lifecycle audit events remain, while the
device relationship is detached.

## API surface

Administrative endpoints require the existing session authentication and
`SUPER_ADMIN` role:

- `GET /api/v1/agents?skip=0&take=50` — paginated registration status.
- `POST /api/v1/agents/enrollment-grants` — issue a new-device or
  device-bound enrollment grant.
- `POST /api/v1/agents/:id/rotation-grants` — authorize credential rotation.
- `POST /api/v1/agents/:id/recovery-grants` — authorize recovery after
  revocation.
- `POST /api/v1/agents/:id/disable`, `/enable`, and `/revoke` — change
  registration state.

Agent endpoints use `Authorization: Bearer <credential>`:

- `POST /api/v1/agent/enroll`
- `POST /api/v1/agent/check-in` — returns a server-issued
  `inventoryRevision` as a decimal string.
- `POST /api/v1/agent/inventory` — requires the matching
  `X-Inventory-Revision` header.
- `POST /api/v1/agent/credentials/rotate`
- `POST /api/v1/agent/credentials/confirm`

The legacy public `POST /api/v1/inventory` remains hostname-upsert based for
existing collectors. It does not accept `networkInterfaces`; network snapshots
must be submitted through the authenticated managed-agent endpoint.

## Optional network snapshot contract

The managed-agent inventory body may include this camelCase property:

```json
{
  "networkInterfaces": [
    {
      "name": "Ethernet",
      "interfaceType": "ETHERNET",
      "macAddress": "A4:BB:6D:12:34:56",
      "ipAddresses": [
        { "address": "10.22.28.45", "prefixLength": 24 },
        { "address": "fe80::1234", "prefixLength": 64 }
      ]
    }
  ]
}
```

`networkInterfaces` is optional. If omitted, stored network state is preserved.
An explicit empty array means a complete snapshot with no eligible interfaces
and clears current network state. `null` is invalid. Each interface requires a
trimmed `name`, `interfaceType`, and `ipAddresses` array. Allowed
`interfaceType` values are `ETHERNET`, `WIFI`, `VPN`, `VIRTUAL`, and `OTHER`.
`macAddress` may be omitted or `null` when no usable MAC is available; otherwise
it must be a six-octet unicast address. MACs are normalized to uppercase
colon-separated notation. A missing MAC is never fabricated.

Each IP address requires a textual `address` and integer `prefixLength`.
Prefix lengths are 0–32 for IPv4 and 0–128 for IPv6. The server canonicalizes
IPv4/IPv6 text and derives address family and scope; clients do not supply or
control the stored classification. Unspecified, loopback, and multicast
addresses, IPv4-mapped IPv6 addresses, and scoped IPv6 text containing a zone
identifier are rejected. APIPA (`169.254.0.0/16`) and IPv6 link-local addresses
are accepted. Scope values stored by the server are `PRIVATE`, `PUBLIC`,
`LINK_LOCAL`, `APIPA`, `UNIQUE_LOCAL`, `SHARED`, `DOCUMENTATION`, or `RESERVED`.

Within one interface, repeated canonical IPs with the same prefix are
deduplicated; conflicting prefixes are rejected. Duplicate interface names
(case-insensitive) are rejected. An address may appear on more than one
interface, and MAC addresses are not globally unique. An interface with
`ipAddresses: []` is retained without current address rows.

The endpoint collector must include operational Ethernet, Wi-Fi, VPN, and
virtual adapters; exclude loopback and disconnected interfaces; and omit the
entire `networkInterfaces` property if enumeration failed or was incomplete.
The backend validates the full snapshot before opening the inventory
transaction, then replaces the current interface/address rows in the same
transaction as the associated inventory update. It keeps no address history
and does not add a server-observed public IP.

## Managed snapshot ordering

Each authenticated check-in increments a persisted per-registration
`inventoryRevision` while holding the Device and ManagedAgent row locks in that
order. The response includes the revision as a decimal string. The agent must
use that revision in `X-Inventory-Revision` with its completed inventory
snapshot; the existing JSON body is unchanged.

The server applies a snapshot only when its revision is the latest issued
revision. A revision older than the latest issued value is rejected as stale.
The applied revision and a SHA-256 digest of the canonical request body are
stored in the same transaction as the inventory update. An exact retry of the
currently applied revision returns success without writing the snapshot again;
different content reusing that revision is rejected. If a newer revision was
issued but collection failed, the agent must request another revision and
collect again. Client timestamps are not used to determine ordering.

The revision protocol is required only on the authenticated managed-agent
inventory endpoint. Legacy `POST /api/v1/inventory` payloads and hostname
upsert behavior remain unchanged and do not gain stale-snapshot protection.

## Legacy ingestion transition and remaining exposure

The legacy endpoint remains public for existing PowerShell collectors and
continues accepting their existing payload. Its submitted hostname remains the
legacy lookup key; therefore anonymous inventory overwrite remains possible
until an approved transition is completed.

Before migrating collectors, the deployment owner must provide HTTPS from
collector to a trusted TLS termination point and restrict the legacy route at
the trusted network edge to approved collector sources. The application itself
does not enforce HTTPS or implement a network allowlist. Migrate and verify
collectors in small cohorts using the existing authorized managed-agent
enrollment flow and protected credential storage. Keep the legacy route
available only for explicitly allowlisted unmigrated clients during the
transition. Do not disable anonymous writes until all collectors are
inventoried, migrated, and the retirement step is explicitly approved.

No collector migration, TLS configuration, edge rule, or legacy-route
retirement is performed by this code change. Legacy reports also remain
arrival-order based; the managed revision protocol does not order legacy
submissions.

## Current implementation boundary

The backend currently provides enrollment, check-in metadata, credential
rotation/recovery/revocation, current network snapshots, and lifecycle audit
records. It does not yet provide configuration precedence/versioning, durable
sync campaigns/jobs, release metadata or rollout, a management UI, or a C#
agent/Windows credential store. Those require later approved implementation
phases. No endpoint should interpret absent functionality as success.
