-- Additive and compatible with the preceding application revision.
-- Back up reports first. create_all() does not migrate existing tables.
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS research_json TEXT;
