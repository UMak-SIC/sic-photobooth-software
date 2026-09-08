-- 008_add_event_description.sql
-- Add description column to events table
-- Authoritative Implementation Contract: Event Management

ALTER TABLE events ADD COLUMN IF NOT EXISTS description TEXT;

