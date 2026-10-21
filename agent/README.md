# ITAM C# Agent

The C# agent currently provides the verified inventory wire-contract DTOs,
hardware-independent collection orchestration and tests, and a Windows-only
one-shot collector. It does not enroll an endpoint, store credentials, upload
inventory, run as a Windows service, install an MSI, or update either existing
PowerShell collector.

## Verified backend contract

The required inventory properties are `computerName`, `cpu`, `motherboard`,
`ramModules`, `disks`, and `software`. Optional legacy-compatible properties
are `loggedInUser`, `osName`, `osVersion`, `osBuild`, `domain`, `components`,
and `gitConfig`.

`networkInterfaces` is an optional managed-agent extension, not part of the
legacy public ingestion contract. It preserves the relationship between an
interface, its MAC address, and its IP addresses. Supported interface types
are `ETHERNET`, `WIFI`, `VPN`, `VIRTUAL`, and `OTHER`; the backend derives
address family and scope.

Null optional properties are omitted. Required arrays are emitted even when
empty. `networkInterfaces: null` is represented as omission; an explicitly
empty `networkInterfaces: []` is retained because the backend interprets it
as a successful snapshot that clears current network state. An interface with
`ipAddresses: []` remains present without current address records.

The request body intentionally contains no client-selected `deviceId`.
Managed inventory is authenticated and associated with its device by the
server-side agent registration. The managed inventory endpoint additionally
requires the server-issued `X-Inventory-Revision` header obtained from agent
check-in. This revision is transport metadata and is not part of the JSON
contract.

## Contract checks

With the .NET 10 SDK installed, run the dependency-free tests with:

```powershell
dotnet run --project agent/tests/Itam.Agent.ContractTests/Itam.Agent.ContractTests.csproj
```

The test project reads the existing `scripts/sample-inventory-payload.json`
without modifying it. The comparison is structural and checks property names,
nesting, arrays, number and string values, optional values, and network
snapshot semantics.

## Collection checks and local collection

Run the hardware-independent collector tests with:

```powershell
dotnet run --project agent/tests/Itam.Agent.CollectorTests/Itam.Agent.CollectorTests.csproj
```

Build the Windows adapter with the .NET 10 SDK, then run it on a supported
Windows endpoint:

```powershell
dotnet run --project agent/src/Itam.Agent.Windows/Itam.Agent.Windows.csproj -- collect
dotnet run --project agent/src/Itam.Agent.Windows/Itam.Agent.Windows.csproj -- validate-config C:\ProgramData\ITAM\Agent\settings.json
```

The command writes one inventory JSON document to standard output. Inventory
contains device and network details; handle or redirect this output only to a
protected location.

Optional local settings use strict JSON with `backendBaseUrl` and
`logDirectory`; the URL must be HTTPS and cannot contain credentials, a query,
or a fragment. `maxLogFileSizeBytes` defaults to 5 MiB (allowed range 1 KiB to
20 MiB), and `retainedLogFiles` defaults to five backups (allowed range one to
ten). Unknown properties are rejected. No credentials or device ID are stored
in this configuration. Example:

```json
{
  "backendBaseUrl": "https://itam.example.invalid/api/v1",
  "logDirectory": "C:\\ProgramData\\ITAM\\Agent\\Logs",
  "maxLogFileSizeBytes": 5242880,
  "retainedLogFiles": 5
}
```

Use `collect <settings.json>` to enable bounded JSON-lines event logging.
Log records contain only enumerated event/component/outcome values, timestamps,
durations, optional status codes, and a correlation UUID; they do not contain
inventory payloads, URLs, exception messages, authorization headers, or
credentials. The configured directory must already exist and be secured by
the installer or administrator. The logger does not create directories or
change ACLs. `BoundedRetryPolicy` is available for future transient API
operations, with no more than ten attempts, at most one-minute delays, and
bounded jitter; the one-shot collector does not yet make API requests.

## MSI and CI packaging

The installer project is pinned to WiX Toolset SDK 5.0.2 (MS-RL licensed).
The GitHub Actions workflow runs the contract and collector tests, publishes a
self-contained `win-x64` build, creates the MSI, and exercises installation,
major upgrade, and uninstall on a disposable Windows runner. It uploads the
unsigned MSI with a SHA-256 checksum for 14 days; it does not publish a
release, deploy the agent, or use signing credentials.

The MSI is per-machine and installs the one-shot executable under
`Program Files\ITAM\Inventory Agent`. It does not register a service, create a
default configuration file, create a log directory, or modify the existing
PowerShell collector. The administrator must provision a protected settings
file and log directory before using configured collection. This installer
does not yet deploy a managed, authenticated endpoint agent.

Build the MSI after publishing the self-contained Windows payload:

```powershell
dotnet publish agent/src/Itam.Agent.Windows/Itam.Agent.Windows.csproj `
  --configuration Release --runtime win-x64 --self-contained true `
  -p:PublishSingleFile=false --output "$env:TEMP\itam-agent-publish"
dotnet build agent/installer/Itam.Agent.Installer.wixproj `
  --configuration Release `
  "-p:PublishDirectory=$env:TEMP\itam-agent-publish"
```

The package version is maintained in `agent/Directory.Build.props` and should
be incremented for releases. The x64 MSI and WiX package build have not been
executed on a Windows host in this development environment. The workflow's
Windows install/upgrade/uninstall validation is therefore pending its first
GitHub Actions run.

After a successful workflow run, download the `itam-windows-inventory-agent`
artifact from the run's **Artifacts** section in GitHub Actions. The expected
Windows Installer commands (also exercised by that workflow) are:

```powershell
msiexec.exe /i ITAM.InventoryAgent.msi /qn /norestart /l*v install.log
msiexec.exe /x ITAM.InventoryAgent.msi /qn /norestart /l*v uninstall.log
```

No Windows Service is installed, so service-status and Event Viewer service
commands do not apply. Application event logs are written only when a
validated settings file is supplied to `collect`; use its configured
`logDirectory`. The MSI transaction log is the installer's diagnostic record.

Collection uses Windows CIM/WMI for hardware and OS data, the 32-bit and
64-bit machine uninstall registry views for software, and .NET network
interface APIs for current addresses. Physical disk capacity is reported;
free space is summed from drive-letter volumes mapped to each physical disk.
Disk type is based on WMI media and bus types; unsupported or missing type
information is reported as `UNKNOWN`, not inferred from a model name.

When a successful CPU or motherboard query has no usable descriptive fields,
the collector follows the existing collector's `Unknown`/zero sentinel
behavior. A query failure is different: it prevents a complete payload from
being emitted.

Every collector runs independently and reports success or a sanitized error
type to standard error. Because the backend replaces RAM, disk, and software
collections as complete snapshots, the command emits no payload if one of
those required collectors fails. A failed network collection is omitted from
the payload so the backend preserves its previous network snapshot; a
successful empty network collection emits `networkInterfaces: []`.

Network selection includes non-loopback Ethernet, Wi-Fi, VPN, virtual, and
other adapters with a usable MAC or current unicast IP. Disconnected adapters
are included when they still have a usable MAC. Loopback, unspecified,
multicast, and loopback IP addresses are excluded. IPv6 scope identifiers
are removed, and link-local IPv6 addresses are retained with their prefix.
Only six-byte, unicast MAC addresses are sent because that is the accepted
backend format. Duplicate interface names or an invalid/oversized snapshot
cause the network snapshot to be omitted rather than partially submitted.

The collector deliberately omits `loggedInUser` and `gitConfig` until their
collection can be tied safely to the interactive user's session rather than
the future service account. The optional `components` field is also omitted.

`Itam.Agent.Windows` uses Microsoft's `System.Management` NuGet package
(MIT-licensed) only for its Windows WMI adapter. The package is isolated from
the contract and collector-test projects. The documented endpoint environment
is Windows 10/11 and Windows Server 2016+. No physical Windows endpoint has
yet been used to validate WMI provider availability, hardware results,
registry access, or actual OS compatibility.
