-- Create approval_comments table to store justifications, visibilities, and files/URLs for approval requests.

CREATE TABLE IF NOT EXISTS public.approval_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  comment TEXT,
  visible_to TEXT[] NOT NULL DEFAULT '{}',
  attachment_url TEXT,
  attachment_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.approval_comments ENABLE ROW LEVEL SECURITY;

-- Drop policies explicitly first to prevent duplication errors
DROP POLICY IF EXISTS select_approval_comments ON public.approval_comments;
DROP POLICY IF EXISTS insert_approval_comments ON public.approval_comments;

-- Simplified Select policy: If you can see the request, you can see its comments
CREATE POLICY select_approval_comments ON public.approval_comments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.approval_requests r
    WHERE r.id = request_id
  )
);

-- Insert policy: User must be active on the request (creator or has current/higher role to approve/clarify)
CREATE POLICY insert_approval_comments ON public.approval_comments
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.approval_requests r
    WHERE r.id = request_id
      AND (
        r.created_by = auth.uid()
        OR public.user_can_act_on_approval_request(r.id)
      )
  )
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_approval_comments_request_id ON public.approval_comments(request_id);
