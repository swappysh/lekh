-- Lekh Database Setup
-- Run these commands in your Supabase SQL Editor

-- Core tables
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  username TEXT,
  encrypted_content TEXT NOT NULL,
  encrypted_data_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  client_snapshot_id TEXT
);

CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  salt TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collaborative_documents (
  username TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_operations (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  position INTEGER NOT NULL,
  content TEXT,
  length INTEGER,
  version INTEGER NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  client_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS active_editors (
  username TEXT NOT NULL,
  client_id TEXT NOT NULL,
  cursor_position INTEGER DEFAULT 0,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (username, client_id)
);

CREATE TABLE IF NOT EXISTS public_snapshots (
  username TEXT NOT NULL,
  snapshot_minute TIMESTAMPTZ NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0,
  source_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (username, snapshot_minute)
);

-- Migration-safe column adds for older environments
ALTER TABLE documents ADD COLUMN IF NOT EXISTS client_snapshot_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE collaborative_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_documents_username_created_at
  ON documents(username, created_at DESC);

-- De-duplicate historical private session rows before enforcing upsert key
WITH ranked_documents AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY username, client_snapshot_id
      ORDER BY
        COALESCE(updated_at, created_at) DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS rank
  FROM documents
  WHERE client_snapshot_id IS NOT NULL
)
DELETE FROM documents
WHERE id IN (
  SELECT id
  FROM ranked_documents
  WHERE rank > 1
);

DROP INDEX IF EXISTS idx_documents_username_client_snapshot_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_username_client_snapshot_unique
  ON documents(username, client_snapshot_id);

CREATE INDEX IF NOT EXISTS idx_document_operations_username_version
  ON document_operations(username, version);

CREATE INDEX IF NOT EXISTS idx_document_operations_timestamp
  ON document_operations(timestamp);

CREATE INDEX IF NOT EXISTS idx_active_editors_last_seen
  ON active_editors(last_seen);

CREATE INDEX IF NOT EXISTS idx_public_snapshots_username_minute
  ON public_snapshots(username, snapshot_minute DESC);

-- Private entries are non-deletable; updates are allowed for in-session autosave
CREATE OR REPLACE FUNCTION prevent_documents_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'documents rows cannot be deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_prevent_update_delete ON documents;
DROP TRIGGER IF EXISTS documents_prevent_delete ON documents;
CREATE TRIGGER documents_prevent_delete
  BEFORE DELETE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION prevent_documents_delete();

CREATE OR REPLACE FUNCTION prevent_invalid_documents_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    WHERE users.username = NEW.username
  ) THEN
    RAISE EXCEPTION 'username does not exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM users
    WHERE users.username = NEW.username
      AND users.is_public = TRUE
  ) THEN
    RAISE EXCEPTION 'public usernames cannot insert into documents';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_prevent_invalid_insert ON documents;
CREATE TRIGGER documents_prevent_invalid_insert
  BEFORE INSERT ON documents
  FOR EACH ROW
  EXECUTE FUNCTION prevent_invalid_documents_insert();

-- Public snapshot materialization from collaborative document updates
CREATE OR REPLACE FUNCTION refresh_public_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  snapshot_time TIMESTAMPTZ;
  source_time TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    WHERE users.username = NEW.username
      AND users.is_public = TRUE
  ) THEN
    RETURN NEW;
  END IF;

  source_time := COALESCE(NEW.updated_at, NOW());
  snapshot_time := date_trunc('minute', source_time);

  INSERT INTO public_snapshots (
    username,
    snapshot_minute,
    content,
    version,
    source_updated_at,
    updated_at
  ) VALUES (
    NEW.username,
    snapshot_time,
    NEW.content,
    NEW.version,
    source_time,
    NOW()
  )
  ON CONFLICT (username, snapshot_minute)
  DO UPDATE SET
    content = EXCLUDED.content,
    version = EXCLUDED.version,
    source_updated_at = EXCLUDED.source_updated_at,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS collaborative_documents_snapshot_trigger ON collaborative_documents;
CREATE TRIGGER collaborative_documents_snapshot_trigger
  AFTER INSERT OR UPDATE ON collaborative_documents
  FOR EACH ROW
  EXECUTE FUNCTION refresh_public_snapshot();

-- Backfill snapshots from current public collaborative docs
INSERT INTO public_snapshots (
  username,
  snapshot_minute,
  content,
  version,
  source_updated_at,
  updated_at
)
SELECT
  c.username,
  date_trunc('minute', COALESCE(c.updated_at, NOW())) AS snapshot_minute,
  c.content,
  c.version,
  COALESCE(c.updated_at, NOW()) AS source_updated_at,
  NOW() AS updated_at
FROM collaborative_documents c
JOIN users u ON u.username = c.username
WHERE u.is_public = TRUE
ON CONFLICT (username, snapshot_minute)
DO UPDATE SET
  content = EXCLUDED.content,
  version = EXCLUDED.version,
  source_updated_at = EXCLUDED.source_updated_at,
  updated_at = NOW();

-- Realtime tables
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE document_operations;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE active_editors;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE collaborative_documents;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END;
$$;

-- Cleanup function for active editors
CREATE OR REPLACE FUNCTION cleanup_inactive_editors()
RETURNS void AS $$
BEGIN
  DELETE FROM active_editors
  WHERE last_seen < NOW() - INTERVAL '2 minutes';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_cleanup_editors()
RETURNS trigger AS $$
BEGIN
  PERFORM cleanup_inactive_editors();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cleanup_editors_trigger ON active_editors;
CREATE TRIGGER cleanup_editors_trigger
  AFTER INSERT ON active_editors
  EXECUTE FUNCTION trigger_cleanup_editors();

-- Row level security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaborative_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_editors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_snapshots ENABLE ROW LEVEL SECURITY;

-- users: readable by anyone; writes only via service role
DROP POLICY IF EXISTS users_select_all ON users;
CREATE POLICY users_select_all
  ON users
  FOR SELECT
  USING (TRUE);

-- documents: readable by anyone; writes only via service role API
DROP POLICY IF EXISTS documents_select_all ON documents;
CREATE POLICY documents_select_all
  ON documents
  FOR SELECT
  USING (TRUE);

-- collaborative_documents: editable only for public usernames
DROP POLICY IF EXISTS collaborative_documents_select_public ON collaborative_documents;
CREATE POLICY collaborative_documents_select_public
  ON collaborative_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.username = collaborative_documents.username
        AND users.is_public = TRUE
    )
  );

DROP POLICY IF EXISTS collaborative_documents_insert_public ON collaborative_documents;
CREATE POLICY collaborative_documents_insert_public
  ON collaborative_documents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.username = collaborative_documents.username
        AND users.is_public = TRUE
    )
  );

DROP POLICY IF EXISTS collaborative_documents_update_public ON collaborative_documents;
CREATE POLICY collaborative_documents_update_public
  ON collaborative_documents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.username = collaborative_documents.username
        AND users.is_public = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.username = collaborative_documents.username
        AND users.is_public = TRUE
    )
  );

-- document_operations: editable only for public usernames
DROP POLICY IF EXISTS document_operations_select_public ON document_operations;
CREATE POLICY document_operations_select_public
  ON document_operations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.username = document_operations.username
        AND users.is_public = TRUE
    )
  );

DROP POLICY IF EXISTS document_operations_insert_public ON document_operations;
CREATE POLICY document_operations_insert_public
  ON document_operations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.username = document_operations.username
        AND users.is_public = TRUE
    )
  );

-- active_editors: editable only for public usernames
DROP POLICY IF EXISTS active_editors_select_public ON active_editors;
CREATE POLICY active_editors_select_public
  ON active_editors
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.username = active_editors.username
        AND users.is_public = TRUE
    )
  );

DROP POLICY IF EXISTS active_editors_insert_public ON active_editors;
CREATE POLICY active_editors_insert_public
  ON active_editors
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.username = active_editors.username
        AND users.is_public = TRUE
    )
  );

DROP POLICY IF EXISTS active_editors_update_public ON active_editors;
CREATE POLICY active_editors_update_public
  ON active_editors
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.username = active_editors.username
        AND users.is_public = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.username = active_editors.username
        AND users.is_public = TRUE
    )
  );

DROP POLICY IF EXISTS active_editors_delete_public ON active_editors;
CREATE POLICY active_editors_delete_public
  ON active_editors
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.username = active_editors.username
        AND users.is_public = TRUE
    )
  );

-- public_snapshots: readable by anyone for public usernames
DROP POLICY IF EXISTS public_snapshots_select_public ON public_snapshots;
CREATE POLICY public_snapshots_select_public
  ON public_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.username = public_snapshots.username
        AND users.is_public = TRUE
    )
  );

DROP POLICY IF EXISTS public_snapshots_insert_public ON public_snapshots;
CREATE POLICY public_snapshots_insert_public
  ON public_snapshots
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.username = public_snapshots.username
        AND users.is_public = TRUE
    )
  );

DROP POLICY IF EXISTS public_snapshots_update_public ON public_snapshots;
CREATE POLICY public_snapshots_update_public
  ON public_snapshots
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.username = public_snapshots.username
        AND users.is_public = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.username = public_snapshots.username
        AND users.is_public = TRUE
    )
  );
