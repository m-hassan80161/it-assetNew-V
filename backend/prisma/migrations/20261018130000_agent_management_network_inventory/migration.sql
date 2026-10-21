CREATE TYPE "AgentRegistrationStatus" AS ENUM ('ENABLED', 'DISABLED', 'REVOKED');
CREATE TYPE "AgentGrantPurpose" AS ENUM ('ENROLLMENT', 'RECOVERY', 'ROTATION');
CREATE TYPE "NetworkInterfaceType" AS ENUM ('ETHERNET', 'WIFI', 'VPN', 'VIRTUAL', 'OTHER');
CREATE TYPE "NetworkAddressFamily" AS ENUM ('IPV4', 'IPV6');
CREATE TYPE "NetworkAddressScope" AS ENUM (
    'PRIVATE',
    'PUBLIC',
    'LINK_LOCAL',
    'APIPA',
    'UNIQUE_LOCAL',
    'SHARED',
    'DOCUMENTATION',
    'RESERVED'
);

CREATE TABLE "ManagedAgent" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "status" "AgentRegistrationStatus" NOT NULL DEFAULT 'ENABLED',
    "credentialHash" TEXT,
    "pendingCredentialHash" TEXT,
    "pendingCredentialExpiresAt" TIMESTAMP(3),
    "credentialVersion" INTEGER NOT NULL DEFAULT 1,
    "agentVersion" TEXT,
    "operatingSystem" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "lastInventoryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedAgent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentEnrollmentGrant" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "AgentGrantPurpose" NOT NULL,
    "deviceId" TEXT,
    "allowDeviceCreate" BOOLEAN NOT NULL DEFAULT false,
    "createdByAdminId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEnrollmentGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentAuditEvent" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "deviceId" TEXT,
    "actorAdminId" TEXT,
    "actorUsername" TEXT,
    "eventType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NetworkInterface" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "interfaceType" "NetworkInterfaceType" NOT NULL,
    "macAddress" TEXT,

    CONSTRAINT "NetworkInterface_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NetworkAddress" (
    "id" TEXT NOT NULL,
    "networkInterfaceId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "family" "NetworkAddressFamily" NOT NULL,
    "prefixLength" INTEGER NOT NULL,
    "scope" "NetworkAddressScope" NOT NULL,

    CONSTRAINT "NetworkAddress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagedAgent_deviceId_key" ON "ManagedAgent"("deviceId");
CREATE UNIQUE INDEX "ManagedAgent_credentialHash_key" ON "ManagedAgent"("credentialHash");
CREATE UNIQUE INDEX "ManagedAgent_pendingCredentialHash_key" ON "ManagedAgent"("pendingCredentialHash");
CREATE INDEX "ManagedAgent_status_lastSeenAt_idx" ON "ManagedAgent"("status", "lastSeenAt");

CREATE UNIQUE INDEX "AgentEnrollmentGrant_tokenHash_key" ON "AgentEnrollmentGrant"("tokenHash");
CREATE INDEX "AgentEnrollmentGrant_deviceId_purpose_idx" ON "AgentEnrollmentGrant"("deviceId", "purpose");
CREATE INDEX "AgentEnrollmentGrant_expiresAt_consumedAt_idx" ON "AgentEnrollmentGrant"("expiresAt", "consumedAt");

CREATE INDEX "AgentAuditEvent_agentId_createdAt_idx" ON "AgentAuditEvent"("agentId", "createdAt");
CREATE INDEX "AgentAuditEvent_deviceId_createdAt_idx" ON "AgentAuditEvent"("deviceId", "createdAt");
CREATE INDEX "AgentAuditEvent_actorAdminId_createdAt_idx" ON "AgentAuditEvent"("actorAdminId", "createdAt");

CREATE INDEX "NetworkInterface_deviceId_idx" ON "NetworkInterface"("deviceId");
CREATE UNIQUE INDEX "NetworkAddress_networkInterfaceId_address_key" ON "NetworkAddress"("networkInterfaceId", "address");
CREATE INDEX "NetworkAddress_address_idx" ON "NetworkAddress"("address");

ALTER TABLE "ManagedAgent"
ADD CONSTRAINT "ManagedAgent_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentEnrollmentGrant"
ADD CONSTRAINT "AgentEnrollmentGrant_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentAuditEvent"
ADD CONSTRAINT "AgentAuditEvent_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "ManagedAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentAuditEvent"
ADD CONSTRAINT "AgentAuditEvent_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NetworkInterface"
ADD CONSTRAINT "NetworkInterface_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NetworkAddress"
ADD CONSTRAINT "NetworkAddress_networkInterfaceId_fkey"
FOREIGN KEY ("networkInterfaceId") REFERENCES "NetworkInterface"("id") ON DELETE CASCADE ON UPDATE CASCADE;
