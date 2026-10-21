# IT Asset Management & Automated Employee Onboarding Platform

A **production-ready, containerized full-stack application** for enterprises to:

✅ **Collect & Manage IT Inventory** — Hardware & software snapshots from Windows PCs  
✅ **Sync Active Directory** — Users, groups, OUs with automatic exclusion filtering  
✅ **Enforce Software Compliance** — Master list matching + delta-update detection  
✅ **Automate Employee Onboarding** — AD user creation → file server provisioning → NTFS permissions in one workflow  

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript + Vite + TailwindCSS |
| **Backend** | NestJS + Express + Prisma ORM |
| **Database** | PostgreSQL 13+ |
| **Infrastructure** | Docker Compose, LDAP, WinRM, PowerShell |

---

## Key Features

### 1. **Inventory Management**
- Automated data collection via PowerShell GPO script
- Hardware snapshot: CPU, RAM, motherboard, disks, git config
- Automatically detect connected monitors and Windows Plug-and-Play peripherals, with manual entry for devices or specifications Windows cannot identify
- Per-device component tracking with category-specific monitor, mouse, and keyboard specifications, customizable fields, and a change history
- Software inventory with version tracking
- Real-time compliance status display

### 2. **Active Directory Integration**
- LDAP sync of users, groups, organizational units
- Configurable exclusion filters (service accounts, admin OUs)
- Manager hierarchy resolution
- Automatic group membership assignment during onboarding

### 3. **Software Compliance Engine**
- **Master List Management:** Admin-defined baseline software versions
- **Compliance Status:** UP_TO_DATE, OUTDATED, MISSING, NOT_TRACKED
- **Delta-Update Alerts:** Automatic notification when one device upgrades before others
- **Semver Comparison:** Intelligent version comparison (handles "23.4" → "23.4.0")

### 4. **Automated Onboarding Workflow**
End-to-end employee provisioning in a single transactional workflow:
1. Create AD user in selected OU (disabled)
2. Set password via LDAPS (unicodePwd, UTF-16LE)
3. Enable account
4. Add to selected groups + set manager
5. Create personal folder on file server
6. Break NTFS inheritance
7. Grant user FullControl, manager Modify access

---

## Directory Structure

```
it-asset-platform/
├── backend/
│   ├── src/
│   │   ├── common/
│   │   │   ├── ldap/          # LDAP client wrapper
│   │   │   ├── winrm/         # WinRM PowerShell executor
│   │   │   └── prisma/        # Database module
│   │   ├── modules/
│   │   │   ├── inventory/     # Collect & ingest device data
│   │   │   ├── active-directory/  # LDAP sync + user creation
│   │   │   ├── file-server/   # Folder creation + NTFS perms
│   │   │   ├── software-compliance/  # Master list + alerts
│   │   │   └── onboarding/    # Orchestration workflow
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── prisma/
│   │   └── schema.prisma      # Database schema
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/             # Dashboard, devices, compliance, onboarding
│   │   ├── components/        # Reusable UI components
│   │   ├── lib/               # API client, utilities
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
├── scripts/
│   └── Collect-Inventory.ps1  # Client-side PowerShell collector
├── docs/
│   └── SETUP.md               # Complete setup guide
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Quick Start

### Prerequisites
- Docker 20.10+
- Docker Compose 2.0+
- Active Directory domain with service account
- Windows file server with WinRM enabled

### 1. Clone & Configure
```bash
git clone <repo>
cd it-asset-platform
cp .env.example .env
# Edit .env with your AD/File Server credentials
```

### 2. Start Containers
```bash
docker-compose up -d
```

### 3. Access the Platform
- **Frontend:** https://YOUR_SERVER_IP:8443
- **API Docs:** http://localhost:3000/api/docs
- **Swagger UI:** http://localhost:3000/api

### 4. Configure AD & File Server
See [SETUP.md](./docs/SETUP.md) for detailed instructions on:
- Creating AD service accounts
- Enabling WinRM
- Setting up folder permissions

---

## API Examples

### Ingest Inventory (PowerShell Client)
```powershell
$payload = @{
  computerName = "WORKSTATION-01"
  loggedInUser = "john.doe"
  osName = "Windows 11"
  osVersion = "23H2"
  cpu = @{ cores = 8; threads = 16; ... }
  software = @( @{ name = "Chrome"; version = "127.0.0" } )
}
Invoke-RestMethod -Uri "http://backend:3000/api/v1/inventory" `
  -Method POST -Body ($payload | ConvertTo-Json) -ContentType "application/json"
```

### Trigger AD Sync
```bash
curl -X POST http://localhost:3000/api/v1/active-directory/sync
```

### Add Master Software
```bash
curl -X POST http://localhost:3000/api/v1/software-compliance/master-list \
  -H "Content-Type: application/json" \
  -d '{ "name": "Google Chrome", "minRequiredVersion": "127.0.0", "isMandatory": true }'
```

### Start Onboarding
```bash
curl -X POST http://localhost:3000/api/v1/onboarding \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Smith",
    "username": "jsmith",
    "email": "jane.smith@corp.local",
    "password": "SecurePass123!",
    "targetOuDn": "OU=Users,DC=corp,DC=local",
    "managerDn": "CN=John Manager,OU=Users,DC=corp,DC=local",
    "departmentFolderId": "dept-finance-id",
    "requestedGroupDns": ["CN=Finance,OU=Groups,DC=corp,DC=local"]
  }'
```

---

## Database Schema Highlights

### Key Tables
- **Device** — Hardware snapshots + metadata
- **DeviceComponent / DeviceComponentHistory** — Manually managed peripherals and their add, update, and removal history
- **InstalledSoftware** — Software inventory per device
- **MasterSoftware** — Admin-defined compliance baseline
- **ComplianceAlert** — Delta-update notifications
- **AdUser, AdGroup, AdOrganizationalUnit** — AD sync cache
- **DepartmentFolder** — File server folder mappings
- **OnboardingRequest** — Employee provisioning workflow records
- **AdminAccount / AdminSession** — Administrator login and persistent sessions

See `backend/prisma/schema.prisma` for full schema.

---

## Security Considerations

### LDAPS & WinRM
- ✅ **LDAPS (port 636):** Encrypted AD communication
- ✅ **WinRM HTTPS (port 5986):** Encrypted remote PowerShell
- ⚠️ **SSL Validation:** Production must use valid certificates, not self-signed

### Credential Management
- Service accounts stored in `.env` (use `.env.local` + .gitignore)
- Consider secrets manager (HashiCorp Vault, AWS Secrets Manager) for production
- Rotate service account passwords regularly
- Set `ADMIN_PASSWORD` to a unique value of at least 12 characters before the first backend startup. `ADMIN_USERNAME` defaults to `admin`.
- The initial admin credentials are seeded once; changing these environment values later does not overwrite the account stored in PostgreSQL.
- Admin passwords are stored as scrypt hashes. Browser sessions use HttpOnly, SameSite=Strict cookies and expire after 24 hours. Changing credentials revokes all active sessions.

### Network
- Firewall allow only backend → AD / File Server
- Frontend behind reverse proxy/WAF
- Run the production frontend and API behind HTTPS so the Secure session cookie is protected in transit.
- Application APIs require an admin session. The PowerShell inventory ingestion endpoint remains unauthenticated for device agents.

---

## Monitoring & Logging

### Backend Logs
```bash
docker logs itam_backend -f
```

### Database Access
```bash
docker exec -it itam_postgres psql -U itam_admin itam_platform
```

### Check Device Inventory
```sql
SELECT computerName, osName, lastSeenAt FROM "Device" ORDER BY lastSeenAt DESC LIMIT 10;
```

### View Compliance Alerts
```sql
SELECT ca.softwareName, ca.message, d.computerName FROM "ComplianceAlert" ca
JOIN "Device" d ON ca.deviceId = d.id
WHERE ca.resolved = false;
```

---

## Extending the Platform

### Add Custom Hardware Metrics
1. Extend PowerShell collector script (`scripts/Collect-Inventory.ps1`)
2. Add fields to `InventoryPayloadDto` (`backend/src/modules/inventory/dto/`)
3. Update Prisma schema + run migration
4. Update frontend device detail view

### Add Email Notifications
```bash
npm install nodemailer  # in backend
# Use in onboarding.service.ts to send welcome email + temp password
```

### Add Audit Logging
```
Create Audit table in schema.prisma
Log all API calls + state changes
Dashboard page showing audit trail
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| LDAP bind fails | Wrong credentials | Verify AD_BIND_DN, AD_BIND_PASSWORD in .env |
| WinRM timeout | Firewall blocked | Check port 5986, enable on file server |
| Onboarding fails at Step 4 | NTFS perms issue | Verify service account has icacls permissions |
| Devices not reporting | PowerShell script not running | Check GPO applied, run manually with `-Verbose` |
| API returns 500 | Database not reachable | `docker logs itam_backend`, check DATABASE_URL |

Full troubleshooting guide in [SETUP.md](./docs/SETUP.md).

---

## Deployment Checklist

- [ ] AD service accounts created + permissions delegated
- [ ] File server WinRM enabled + certificates valid
- [ ] PostgreSQL configured + accessible
- [ ] Docker environment variables set securely
- [ ] LDAPS certificate valid (not self-signed)
- [ ] WinRM certificate valid (not self-signed)
- [ ] Firewall rules allow connectivity
- [ ] Backup strategy defined for PostgreSQL
- [ ] API authentication enabled via secure admin session cookies
- [ ] Rate limiting configured

---

## Contributing

PRs welcome! Some ideas:
- [ ] Add two-factor authentication
- [ ] Support for macOS/Linux device collection
- [ ] Export compliance reports (PDF, Excel)
- [ ] Slack/Teams integration for alerts
- [ ] Scheduled onboarding (bulk import from CSV)

---

## License

MIT

---

## Support

See [SETUP.md](./docs/SETUP.md) for complete setup instructions, troubleshooting, and production deployment guidance.

---

## Device Management

Device management allows administrators to monitor and maintain the full IT estate from a single interface.

### What administrators can do
- View all managed workstations with up-to-date inventory snapshots
- Filter devices by operating system, software, or recent activity
- Inspect detailed hardware, RAM, disk, motherboard, and application data
- Review compliance status for installed software against approved baselines
- Identify stale or missing inventory records and investigate drift quickly

### Inventory lifecycle
1. Client machines report in through the PowerShell collector script
2. Backend stores or updates the device record in PostgreSQL
3. Frontend dashboards show the latest status and version details
4. Admins can drill into a specific device to review installed software and configuration history

### Operational value
This gives IT teams a single operational view of device health, version compliance, and onboarding readiness without manually reconciling spreadsheets or direct AD exports.

### Managed agent API (initial backend)
The backend includes an initial authenticated managed-agent enrollment, check-in, credential lifecycle, and network-inventory API. The existing PowerShell collector and public legacy inventory endpoint remain available. Configuration polling, durable jobs/campaigns, release management, a React administration UI, and the C# Windows agent are not included yet. See [Agent Management API and Network Inventory](./docs/AGENT-MANAGEMENT.md).

---

## Platform Summary

The platform combines inventory collection, directory synchronization, compliance enforcement, and onboarding automation into a single enterprise-ready workflow. It is designed for IT operations teams that need a repeatable way to keep device records current, ensure software standards, and provision employees with minimal manual effort.
