-- Postgres has no ALTER TYPE ... DROP VALUE, so removing an enum value
-- requires rebuilding the type: rename the old one, create the new one
-- without "draftsman", repoint the column, drop the old type. Safe only
-- because no User row currently has role = 'draftsman' (verified before
-- this migration was written; the one such row was deleted first).
ALTER TYPE "UserRole" RENAME TO "UserRole_old";

CREATE TYPE "UserRole" AS ENUM ('technician', 'director', 'service_manager', 'admin', 'sales_engineer');

ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text::"UserRole");

DROP TYPE "UserRole_old";
