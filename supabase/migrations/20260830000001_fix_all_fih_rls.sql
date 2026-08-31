-- Fix is_org_admin function
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'caoh', 'oh', 'ceo', 'fih', 'cao', 'fin')
  ) OR EXISTS (
    SELECT 1 FROM public.app_role_assignments a
    WHERE a.user_id = auth.uid()
      AND a.app_code IN ('finance', 'ok')
      AND a.team_id IS NULL
  );
$$;

-- Fix buckets RLS
DROP POLICY IF EXISTS "Org Admins can view org buckets" ON buckets;
CREATE POLICY "Org Admins can view org buckets"
ON buckets
FOR SELECT
USING (
  is_org_level = true AND public.is_org_admin()
);

DROP POLICY IF EXISTS "Org Admins can manage org buckets" ON buckets;
CREATE POLICY "Org Admins can manage org buckets"
ON buckets
FOR ALL
USING (
  is_org_level = true AND public.is_org_admin()
);

-- Fix bucket_access RLS
DROP POLICY IF EXISTS "Org Admins can manage bucket access" ON bucket_access;
CREATE POLICY "Org Admins can manage bucket access"
ON bucket_access
FOR ALL
USING (
  public.is_org_admin()
);
