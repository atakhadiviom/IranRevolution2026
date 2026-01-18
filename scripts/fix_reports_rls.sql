-- Enable RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert reports
CREATE POLICY "Allow anyone to insert reports" ON reports
  FOR INSERT WITH CHECK (true);

-- Allow authenticated users (admins) to select reports
CREATE POLICY "Allow authenticated users to select reports" ON reports
  FOR SELECT TO authenticated USING (true);

-- Allow authenticated users (admins) to update reports (needed for Resolve/Dismiss)
CREATE POLICY "Allow authenticated users to update reports" ON reports
  FOR UPDATE TO authenticated USING (true);

-- Allow authenticated users (admins) to delete reports
CREATE POLICY "Allow authenticated users to delete reports" ON reports
  FOR DELETE TO authenticated USING (true);
