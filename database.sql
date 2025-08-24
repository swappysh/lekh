-- Lekh Database Setup
-- Run these commands in your Supabase SQL Editor

-- Create the documents table
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Disable Row Level Security completely
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;