-- ═══════════════════════════════════════
-- Appointments table for WhatsApp Reminder System
-- Run this in your Supabase SQL Editor (or via supabase db push)
-- ═══════════════════════════════════════

-- Create the appointments table with all required columns
CREATE TABLE IF NOT EXISTS appointments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name  text NOT NULL,
  phone_number   text NOT NULL,
  appointment_at timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'scheduled',
  reminder_sent  boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security on the table
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to read all appointments (internal tool)
CREATE POLICY "Allow anonymous select"
  ON appointments
  FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to insert new appointments
CREATE POLICY "Allow anonymous insert"
  ON appointments
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anonymous users to update appointments (for status changes, reminder flags)
CREATE POLICY "Allow anonymous update"
  ON appointments
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Enable Realtime for the appointments table so the dashboard auto-updates
ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
