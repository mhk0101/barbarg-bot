-- Allow multiple BarBargAccount rows with the same username.
-- Accounts are distinguished by accountName/id, not by username.
DROP INDEX IF EXISTS "BarBargAccount_username_key";
