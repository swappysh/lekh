-- Lekh Database Setup
-- Run these commands in your Supabase SQL Editor

-- Create the documents table
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  username TEXT,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Create the users table
CREATE TABLE users (
  username TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable Row Level Security for simple access
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
