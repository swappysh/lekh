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

-- Private entries are deletable via /api/private-delete; in-session autosave still just updates.
-- (Historically a BEFORE DELETE trigger raised unconditionally. Drop it and its function so
-- the older databases pick up the change too.)
DROP TRIGGER IF EXISTS documents_prevent_update_delete ON documents;
DROP TRIGGER IF EXISTS documents_prevent_delete ON documents;
DROP FUNCTION IF EXISTS prevent_documents_delete();

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

-- Password change: rotate the author keypair and re-wrap every entry's data key
-- in one transaction. Called only by /api/rotate-key through the service role.
--
-- p_doc_keys maps document id -> {"old_hash": <sha256 hex of the data key the client
-- read>, "new": <re-wrapped data key>}. An entry whose stored key no longer hashes to
-- old_hash was rewritten after the client read it (every autosave makes a fresh data
-- key), so the whole swap is refused instead of pairing new content with a stale key.
--
-- Writers and rotation are serialized by the users row: private_append takes
-- FOR SHARE, this takes FOR UPDATE, so an append cannot land encrypted to the old key.
CREATE OR REPLACE FUNCTION rotate_user_key(
  p_username TEXT,
  p_old_public_key TEXT,
  p_new_public_key TEXT,
  p_encrypted_private_key TEXT,
  p_salt TEXT,
  p_doc_keys JSONB
)
RETURNS VOID AS $$
DECLARE
  current_key TEXT;
  unmatched INTEGER;
BEGIN
  SELECT public_key INTO current_key
  FROM users
  WHERE username = p_username
  FOR UPDATE;

  IF current_key IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  IF current_key <> p_old_public_key THEN
    RAISE EXCEPTION 'key changed';
  END IF;

  SELECT COUNT(*) INTO unmatched
  FROM documents d
  WHERE d.username = p_username
    AND (
      NOT (p_doc_keys ? d.id)
      OR jsonb_typeof(p_doc_keys -> d.id) IS DISTINCT FROM 'object'
      OR jsonb_typeof(p_doc_keys -> d.id -> 'new') IS DISTINCT FROM 'string'
      OR (p_doc_keys -> d.id ->> 'old_hash')
           IS DISTINCT FROM encode(sha256(convert_to(d.encrypted_data_key, 'UTF8')), 'hex')
    );

  IF unmatched > 0 THEN
    RAISE EXCEPTION 'entries changed';
  END IF;

  UPDATE documents d
  SET encrypted_data_key = p_doc_keys -> d.id ->> 'new'
  WHERE d.username = p_username;

  UPDATE users
  SET public_key = p_new_public_key,
      encrypted_private_key = p_encrypted_private_key,
      salt = p_salt
  WHERE username = p_username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION rotate_user_key(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION rotate_user_key(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION rotate_user_key(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- Private append: compare the writer's public key and upsert in one transaction.
-- FOR SHARE on the users row makes rotate_user_key (FOR UPDATE) wait for in-flight
-- appends and vice versa, so a write encrypted to a rotated-out key cannot land.
--
-- Snapshot ids are world-readable, so reusing an id must not let an outsider replace
-- the row. Each browser session also sends a random writer secret; the API route
-- stores only its sha256 (p_writer_hash) and an update must present the same hash.
-- The hash is public but not reversible, so only the original writer can keep
-- autosaving a row. Rows with no hash (written before this change, or by a tokenless
-- tab since) are
-- immutable here, except until the fixed cutoff below, when a tokenless writer may
-- touch a tokenless row updated in the last hour: that keeps tabs loaded before the
-- deploy autosaving. A tokenless overwrite refreshes updated_at, so without a hard
-- cutoff that branch would never close.
--
-- TODO(remove after 2026-11-06 12:00 UTC): delete the tokenless branch from the
-- WHERE clause below, make writerToken required in pages/api/private-append.js, and
-- drop the 'Optional while old tabs drain' note in lib/constants.js, the
-- p_writer_hash: null route test and the transition bullet in ENCRYPTION.md.
-- The cutoff is an absolute time: set it to the deploy time plus a day before
-- running this on a new environment, or the branch is already closed (tabs loaded
-- before the deploy then lose autosave after their first save).
--
-- Run this section in one transaction so there is no moment without a
-- private_append function. The column add is inside it because the function needs it.
BEGIN;

-- sha256 of the per-session writer secret that created the row. Only the holder of
-- the secret may update the row again through private_append.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS writer_hash TEXT;

DROP FUNCTION IF EXISTS private_append(TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION private_append(
  p_username TEXT,
  p_public_key TEXT,
  p_client_snapshot_id TEXT,
  p_encrypted_content TEXT,
  p_encrypted_data_key TEXT,
  p_writer_hash TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  current_key TEXT;
  written INTEGER;
BEGIN
  SELECT public_key INTO current_key
  FROM users
  WHERE username = p_username
  FOR SHARE;

  IF current_key IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  IF current_key <> p_public_key THEN
    RAISE EXCEPTION 'key changed';
  END IF;

  INSERT INTO documents (id, username, encrypted_content, encrypted_data_key, client_snapshot_id, writer_hash, updated_at)
  VALUES (
    p_username || ':' || p_client_snapshot_id,
    p_username,
    p_encrypted_content,
    p_encrypted_data_key,
    p_client_snapshot_id,
    p_writer_hash,
    NOW()
  )
  ON CONFLICT (username, client_snapshot_id) DO UPDATE
  SET encrypted_content = EXCLUDED.encrypted_content,
      encrypted_data_key = EXCLUDED.encrypted_data_key,
      updated_at = EXCLUDED.updated_at
  WHERE (documents.writer_hash IS NOT NULL AND documents.writer_hash = EXCLUDED.writer_hash)
     OR (documents.writer_hash IS NULL
         AND EXCLUDED.writer_hash IS NULL
         AND NOW() < TIMESTAMPTZ '2026-11-06 12:00:00+00'
         AND documents.updated_at > NOW() - INTERVAL '1 hour');

  GET DIAGNOSTICS written = ROW_COUNT;
  IF written = 0 THEN
    RAISE EXCEPTION 'not the writer';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION private_append(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private_append(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private_append(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- PostgREST caches function signatures.
NOTIFY pgrst, 'reload schema';

COMMIT;

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
