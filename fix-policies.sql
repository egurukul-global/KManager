ALTER POLICY "Org Admins can manage bucket access" ON bucket_access USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'ceo', 'caoh', 'oh', 'fih')
  )
);

ALTER POLICY "Org Admins can view org buckets" ON buckets USING (
  is_org_level = true AND
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'ceo', 'caoh', 'oh', 'fih')
  )
);

ALTER POLICY "Org Admins can manage org buckets" ON buckets USING (
  is_org_level = true AND
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'ceo', 'caoh', 'oh', 'fih')
  )
);
