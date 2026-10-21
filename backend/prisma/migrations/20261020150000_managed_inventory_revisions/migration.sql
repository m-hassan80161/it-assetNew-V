BEGIN;

ALTER TABLE "ManagedAgent"
ADD COLUMN "inventoryRevision" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "lastAppliedInventoryRevision" BIGINT,
ADD COLUMN "lastAppliedInventoryHash" TEXT;

COMMIT;
