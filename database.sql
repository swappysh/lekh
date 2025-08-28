-- Lekh Database Setup
-- Run these commands in your Supabase SQL Editor

-- Create the documents table
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  username TEXT,
  encrypted_content TEXT NOT NULL,
  encrypted_data_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Create the users table  
CREATE TABLE users (
  username TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  salt TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create collaborative documents table for public pages
CREATE TABLE collaborative_documents (
  username TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create operations table for collaborative editing
CREATE TABLE document_operations (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  operation_type TEXT NOT NULL, -- 'insert' or 'delete'
  position INTEGER NOT NULL,
  content TEXT,
  length INTEGER, -- for delete operations
  version INTEGER NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  client_id TEXT NOT NULL
);

-- Create active editors table for presence
CREATE TABLE active_editors (
  username TEXT NOT NULL,
  client_id TEXT NOT NULL,
  cursor_position INTEGER DEFAULT 0,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (username, client_id)
);

-- Disable Row Level Security for simple access
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE collaborative_documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE document_operations DISABLE ROW LEVEL SECURITY;
ALTER TABLE active_editors DISABLE ROW LEVEL SECURITY;

-- Add indexes for better query performance
CREATE INDEX idx_document_operations_username_version ON document_operations(username, version);
CREATE INDEX idx_active_editors_last_seen ON active_editors(last_seen);
CREATE INDEX idx_document_operations_timestamp ON document_operations(timestamp);

-- Enable Realtime for collaborative tables
ALTER PUBLICATION supabase_realtime ADD TABLE document_operations;
ALTER PUBLICATION supabase_realtime ADD TABLE active_editors;
ALTER PUBLICATION supabase_realtime ADD TABLE collaborative_documents;

-- Create a function to clean up old active editors
CREATE OR REPLACE FUNCTION cleanup_inactive_editors()
RETURNS void AS $$
BEGIN
  DELETE FROM active_editors 
  WHERE last_seen < NOW() - INTERVAL '2 minutes';
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to clean up on inserts
CREATE OR REPLACE FUNCTION trigger_cleanup_editors()
RETURNS trigger AS $$
BEGIN
  PERFORM cleanup_inactive_editors();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cleanup_editors_trigger
  AFTER INSERT ON active_editors
  EXECUTE FUNCTION trigger_cleanup_editors();
