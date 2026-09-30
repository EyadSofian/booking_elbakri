-- A sales supervisor sees every salesperson's sales.
ALTER TABLE "users" ADD COLUMN "seesAllSales" BOOLEAN NOT NULL DEFAULT false;
