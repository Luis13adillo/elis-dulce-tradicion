-- =====================================================
-- Error Logs Table for Security and Debugging
-- =====================================================

CREATE TABLE IF NOT EXISTS error_logs (
  id SERIAL PRIMARY KEY,
  error_code VARCHAR(50) NOT NULL,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  request_path VARCHAR(500),
  request_method VARCHAR(10),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  request_body JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_code ON error_logs(error_code);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_ip_address ON error_logs(ip_address);

-- Partition by month for large datasets (optional, for production)
-- CREATE TABLE error_logs_2024_01 PARTITION OF error_logs
--   FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- RLS Policies
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view error logs
CREATE POLICY "Admins can view error logs" ON error_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- System can insert error logs (no user context needed)
CREATE POLICY "System can insert error logs" ON error_logs
  FOR INSERT WITH CHECK (true);

-- Only admins can delete error logs (for cleanup)
CREATE POLICY "Admins can delete error logs" ON error_logs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- Function to clean up old error logs (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_error_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM error_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (run daily via cron or pg_cron extension)
-- SELECT cron.schedule('cleanup-error-logs', '0 2 * * *', 'SELECT cleanup_old_error_logs()');
