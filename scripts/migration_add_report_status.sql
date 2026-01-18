-- SQL Migration: Add status column to reports table
-- Run this in your Supabase SQL Editor

-- 1. Add status column with default 'pending'
ALTER TABLE reports ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- 2. Update RLS policies to allow public to insert with default status
-- (Assuming public insert is already enabled from previous steps)
-- This ensures that even if public tries to set a different status, 
-- we can control it if needed, but for now we just allow the column.

-- 3. Optional: Add a check constraint for allowed statuses
-- ALTER TABLE reports ADD CONSTRAINT check_report_status 
-- CHECK (status IN ('pending', 'resolved', 'dismissed'));
