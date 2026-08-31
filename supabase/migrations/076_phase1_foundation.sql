-- Add is_global to categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT FALSE;

-- Create bucket_access table
CREATE TABLE IF NOT EXISTS bucket_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bucket_id UUID REFERENCES buckets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    can_transfer BOOLEAN DEFAULT TRUE,
    assigned_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(bucket_id, user_id)
);

-- Enable RLS on bucket_access
ALTER TABLE bucket_access ENABLE ROW LEVEL SECURITY;

-- Policy: Org Admins can manage bucket_access
CREATE POLICY "Org Admins can manage bucket access"
ON bucket_access
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'ceo', 'caoh', 'oh')
  )
);

-- Policy: Users can view their own bucket access
CREATE POLICY "Users can view their own bucket access"
ON bucket_access
FOR SELECT
USING (user_id = auth.uid());

-- Policy: Org Admins can view org buckets
CREATE POLICY "Org Admins can view org buckets"
ON buckets
FOR SELECT
USING (
  is_org_level = true AND
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'ceo', 'caoh', 'oh')
  )
);

-- Policy: Org Admins can manage org buckets
CREATE POLICY "Org Admins can manage org buckets"
ON buckets
FOR ALL
USING (
  is_org_level = true AND
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'ceo', 'caoh', 'oh')
  )
);

-- Policy: Assigned users can view org buckets
CREATE POLICY "Assigned users can view org buckets"
ON buckets
FOR SELECT
USING (
  is_org_level = true AND
  EXISTS (
    SELECT 1 FROM bucket_access
    WHERE bucket_access.bucket_id = buckets.id
    AND bucket_access.user_id = auth.uid()
  )
);
