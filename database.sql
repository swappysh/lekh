-- Lekh Database Setup
-- Run these commands in your Supabase SQL Editor

-- Create the documents table
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Add index for session-based queries
CREATE INDEX idx_documents_session_id ON documents(session_id);

-- Enable Row Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policy that allows access to all documents for authenticated users
-- The application layer will filter by session_id
CREATE POLICY "Allow authenticated access" ON documents
  FOR ALL USING (true);