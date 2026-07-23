-- Migration 045: Secure Messages RLS and Budget Comment Visibility Rules

-- 1. Recreate insert_messages policy to restrict team messages to team members and privileged roles
DROP POLICY IF EXISTS insert_messages ON public.messages;
CREATE POLICY insert_messages ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (recipient_type = 'team' AND (
        EXISTS (
          SELECT 1 FROM public.user_teams ut
          WHERE ut.team_id::text = messages.recipient_id AND ut.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.role IN ('fin', 'fip', 'oh', 'caoh', 'ceo', 'admin')
        )
      ))
      OR recipient_type = 'role'
      OR (recipient_type = 'user' AND public.can_chat_with(auth.uid(), recipient_id::uuid))
      OR (recipient_type = 'group' AND public.is_group_member(messages.recipient_id::uuid, auth.uid()))
    )
  );

-- 2. Recreate select_messages policy to enforce visible_to role restrictions on budget discussions
DROP POLICY IF EXISTS select_messages ON public.messages;
CREATE POLICY select_messages ON public.messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR (recipient_type = 'user' AND recipient_id = auth.uid()::text AND public.can_chat_with(sender_id, auth.uid()))
    OR (recipient_type = 'team' AND EXISTS (
      SELECT 1 FROM public.user_teams ut
      WHERE ut.team_id::text = messages.recipient_id AND ut.user_id = auth.uid()
    ))
    OR (recipient_type = 'group' AND public.is_group_member(messages.recipient_id::uuid, auth.uid()))
    OR (recipient_type = 'role' AND (
      EXISTS (
        SELECT 1 FROM public.request_role_assignments rra
        WHERE rra.role_code = messages.recipient_id AND rra.user_id = auth.uid() AND rra.is_active = true
      )
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('caoh', 'oh', 'admin') AND (
          (messages.recipient_id = 'CAO' AND u.role IN ('caoh', 'admin'))
          OR (messages.recipient_id = 'FIH' AND u.role IN ('oh', 'admin'))
        )
      )
    ))
    OR (metadata->>'link_type' = 'budget' AND EXISTS (
      SELECT 1 FROM public.approval_requests r
      WHERE r.id::text = messages.metadata->>'link_id'
      AND (
        messages.metadata->'visible_to' IS NULL
        OR messages.metadata->'visible_to' = '[]'::jsonb
        OR messages.metadata->'visible_to' ? 'ALL'
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(messages.metadata->'visible_to') AS role_code
          WHERE public.user_has_approval_role(auth.uid(), role_code, r.team_id)
        )
      )
    ))
  );
