-- KManager baseline schema, reconstructed from the LIVE Supabase database on 2026-09-06.
-- This replaces the untrustworthy 87-file migration history (only 33 of 96 live tables
-- had any matching CREATE TABLE in that history - see PROGRESS.md Phase 3.5).
-- Scope: KManager's own 50 tables only. This Supabase project also hosts
-- unrelated apps (an LMS, a chanting app, an ops tracker, a password vault) - their
-- tables/functions are deliberately excluded, verified by checking actual function
-- bodies and app code usage, not by guessing from table names.
-- Intended target: self-hosted Postgres + PostgREST (matches the existing RLS +
-- auth.uid()-via-JWT-claims design, which is native PostgREST behavior, not Supabase-
-- proprietary). auth.uid()/auth.jwt() helper functions still need to be defined on the
-- new server - see the note near the top of the Functions section below.

-- ============================================================
-- Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Roles (required by PostgREST convention - anon/authenticated/service_role)
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- ============================================================
-- auth.uid() / auth.jwt() - PostgREST-compatible reimplementation of what Supabase provides
-- ============================================================

-- Supabase's own auth.uid()/auth.jwt() are just thin wrappers over the exact same
-- request.jwt.claims GUC that vanilla PostgREST sets per request when using JWT auth -
-- this is why the existing RLS design ports over almost unchanged. Recreating them here
-- so every policy/function below that calls auth.uid() keeps working as-is.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('request.jwt.claims', true), '{}')::jsonb;
$$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid;
$$;

-- ============================================================
-- Tables - bare columns only (constraints added in a later pass, after all tables exist)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_role_assignments (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  app_code text NOT NULL,
  role_code text NOT NULL,
  user_id uuid NOT NULL,
  team_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid
);
CREATE TABLE IF NOT EXISTS public.app_roles (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  app_code text NOT NULL,
  role_code text NOT NULL,
  role_name text NOT NULL,
  can_be_global boolean DEFAULT false,
  can_be_team boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.approval_flow_definitions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  request_type text NOT NULL,
  team_id uuid,
  user_id uuid,
  priority integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.approval_flow_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  flow_id uuid NOT NULL,
  step_order integer NOT NULL,
  role_code text NOT NULL,
  is_final boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS public.approval_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid NOT NULL,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.approval_request_reconciliation_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid NOT NULL,
  reconciliation_line_id uuid NOT NULL,
  reconciliation_submission_id uuid,
  bucket_id uuid NOT NULL,
  bucket_name text,
  currency text,
  closing_balance numeric(18,2),
  actual_balance numeric(18,2),
  difference numeric(18,2),
  usd_equivalent numeric(18,2),
  comments text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  request_number text NOT NULL,
  request_type text DEFAULT 'budget'::text NOT NULL,
  team_id uuid,
  status text DEFAULT 'DRAFT'::text NOT NULL,
  title text,
  amount_usd numeric(14,2),
  created_by uuid NOT NULL,
  group_number text,
  is_deleted boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  current_step_order integer,
  current_role_code text,
  budget_plan_id uuid,
  transfer_id uuid,
  step_approved boolean DEFAULT false NOT NULL,
  rejected_at timestamp with time zone,
  completed_at timestamp with time zone,
  reconciliation_submission_id uuid,
  clarified_by_role text
);
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.bucket_access (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  bucket_id uuid,
  user_id uuid,
  can_transfer boolean DEFAULT true,
  assigned_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  can_view_balance boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.buckets (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  name text NOT NULL,
  type text DEFAULT 'cash'::text NOT NULL,
  currency text DEFAULT 'USD'::text NOT NULL,
  balance numeric(15,2) DEFAULT 0 NOT NULL,
  team_id uuid NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  custodian_id uuid,
  _pending boolean DEFAULT false,
  owner_user_id uuid,
  is_protected boolean DEFAULT false NOT NULL,
  is_org_level boolean DEFAULT false NOT NULL,
  is_system_bucket boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL
);
CREATE TABLE IF NOT EXISTS public.budget_calendar_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  budget_period_date date NOT NULL,
  submission_deadline date NOT NULL,
  label text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  is_deleted boolean DEFAULT false NOT NULL,
  status text DEFAULT 'open'::text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.budget_categories (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  budget_id uuid NOT NULL,
  category_id uuid NOT NULL,
  allocated_amount numeric(15,2) DEFAULT 0 NOT NULL,
  spent_amount numeric(15,2) DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS public.budget_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  team_id uuid NOT NULL,
  name text NOT NULL,
  total_amount numeric DEFAULT 0,
  spent_amount numeric DEFAULT 0,
  currency text DEFAULT 'USD'::text,
  start_date date,
  end_date date,
  status text DEFAULT 'draft'::text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  deleted_at timestamp with time zone,
  categories jsonb DEFAULT '[]'::jsonb,
  budget_type text DEFAULT 'monthly'::text NOT NULL,
  calendar_entry_id uuid,
  budget_period_date date,
  approval_status text DEFAULT 'DRAFT'::text,
  approval_request_id uuid,
  open_budgets_explanation jsonb,
  recon_cash_balance numeric(14,2),
  recon_bank_balance numeric(14,2),
  recon_remaining_funds numeric(14,2),
  submission_team_info jsonb,
  submission_housing_info jsonb,
  submission_accomplishments jsonb,
  submission_income_report jsonb,
  submission_social_media jsonb,
  submission_coursing jsonb,
  paid_amount numeric(14,2),
  funding_notes text,
  template_id bigint,
  approved_amount numeric(14,2)
);
CREATE TABLE IF NOT EXISTS public.budget_type_template_assignments (
  id bigint DEFAULT nextval('budget_type_template_assignments_id_seq'::regclass) NOT NULL,
  template_id bigint NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  budget_type text
);
CREATE TABLE IF NOT EXISTS public.budget_type_templates (
  id bigint DEFAULT nextval('budget_type_templates_id_seq'::regclass) NOT NULL,
  name character varying(150) NOT NULL,
  description text,
  template_data jsonb DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  deleted_by uuid,
  deleted_at timestamp with time zone,
  is_deleted boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.budget_types (
  id bigint DEFAULT nextval('budget_types_id_seq'::regclass) NOT NULL,
  team_id uuid,
  name character varying(100) NOT NULL,
  label character varying(150) NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  deleted_by uuid,
  deleted_at timestamp with time zone,
  is_deleted boolean DEFAULT false,
  code text
);
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  team_id uuid,
  is_deleted boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  description text,
  deleted_at timestamp with time zone,
  is_global boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.category_master (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  is_mandatory boolean DEFAULT true NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  is_deleted boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS public.chat_group_members (
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE TABLE IF NOT EXISTS public.chat_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE TABLE IF NOT EXISTS public.chat_permissions (
  user_id uuid NOT NULL,
  allow_opposite_gender boolean DEFAULT false NOT NULL,
  cross_team_access text DEFAULT 'none'::text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  allowed_users uuid[] DEFAULT '{}'::uuid[],
  allowed_roles text[] DEFAULT '{}'::text[],
  allowed_teams uuid[] DEFAULT '{}'::uuid[]
);
CREATE TABLE IF NOT EXISTS public.chat_preferences (
  user_id uuid NOT NULL,
  chat_target_type text NOT NULL,
  chat_target_id text NOT NULL,
  is_pinned boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE TABLE IF NOT EXISTS public.daily_reconciliation (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  team_id uuid NOT NULL,
  reconciliation_date date NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  is_deleted boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric(15,6) NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  team_id uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  source text,
  reference text
);
CREATE TABLE IF NOT EXISTS public.expense_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  team_id uuid NOT NULL,
  expense_id uuid,
  file_url text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  deleted_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.expense_receipts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  team_id uuid NOT NULL,
  receipt_number text NOT NULL,
  receipt_date date NOT NULL,
  vendor text,
  location text,
  currency text NOT NULL,
  items jsonb DEFAULT '[]'::jsonb NOT NULL,
  tax_percent numeric(12,4) DEFAULT 0,
  tax_amount numeric(12,2) DEFAULT 0,
  discount numeric(12,2) DEFAULT 0,
  subtotal numeric(12,2) DEFAULT 0 NOT NULL,
  total numeric(12,2) DEFAULT 0 NOT NULL,
  grand_total numeric(12,2) DEFAULT 0 NOT NULL,
  receipt_hash text,
  image_url text,
  expense_id uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  deleted_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  item text NOT NULL,
  description text,
  budget_id uuid,
  category_id uuid,
  bucket_id uuid,
  local_amount numeric(15,2) NOT NULL,
  currency text DEFAULT 'USD'::text NOT NULL,
  rate numeric(10,6) DEFAULT 1 NOT NULL,
  usd_amount numeric(15,2) NOT NULL,
  payment_status text DEFAULT 'paid'::text NOT NULL,
  vendor_info text,
  receipt_url text,
  created_by uuid NOT NULL,
  team_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  vendor_name text,
  is_deleted boolean DEFAULT false,
  payee text,
  total_usd numeric(12,2) DEFAULT 0,
  status text DEFAULT 'draft'::text,
  approved_by uuid,
  approved_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  _pending boolean DEFAULT false,
  deleted_at timestamp with time zone,
  balance_impact boolean DEFAULT true NOT NULL,
  linked_transfer_id uuid,
  is_frozen boolean DEFAULT false NOT NULL,
  is_submitted boolean DEFAULT true,
  is_reviewed boolean DEFAULT false,
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  subcategory_id uuid
);
CREATE TABLE IF NOT EXISTS public.income (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  team_id uuid NOT NULL,
  date date NOT NULL,
  payment_from text,
  payment_bucket text,
  amount_usd numeric,
  currency text DEFAULT 'USD'::text,
  exchange_rate numeric DEFAULT 1,
  local_amount numeric,
  description text,
  budget_allocations jsonb DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  bucket_id uuid,
  _pending boolean DEFAULT false,
  balance_impact boolean DEFAULT true NOT NULL,
  linked_transfer_id uuid,
  deleted_at timestamp with time zone,
  source text DEFAULT 'manual'::text
);
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sender_id uuid,
  recipient_type text NOT NULL,
  recipient_id text NOT NULL,
  body text NOT NULL,
  attachment_url text,
  attachment_name text,
  allow_replies boolean DEFAULT true NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  read_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.ok_admins (
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ok_app_access (
  user_id uuid NOT NULL,
  team_id uuid NOT NULL,
  app_code text NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ok_app_admins (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  app_code text NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_by uuid
);
CREATE TABLE IF NOT EXISTS public.ok_home_pins (
  user_id uuid NOT NULL,
  app_code text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ok_menu_access (
  user_id uuid NOT NULL,
  team_id uuid NOT NULL,
  app_code text NOT NULL,
  menu_key text NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ok_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  team_id uuid,
  title text NOT NULL,
  body text DEFAULT ''::text NOT NULL,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  action_page text,
  action_id text,
  category text
);
CREATE TABLE IF NOT EXISTS public.reconciliation_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  submission_id uuid NOT NULL,
  bucket_id uuid NOT NULL,
  bucket_name text NOT NULL,
  currency text NOT NULL,
  opening_balance numeric(18,2) DEFAULT 0,
  income_amount numeric(18,2) DEFAULT 0,
  transfers_in numeric(18,2) DEFAULT 0,
  expenses_amount numeric(18,2) DEFAULT 0,
  transfers_out numeric(18,2) DEFAULT 0,
  closing_balance numeric(18,2) NOT NULL,
  actual_balance numeric(18,2),
  difference numeric(18,2),
  usd_equivalent numeric(18,2),
  comments text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  adjustment_status text
);
CREATE TABLE IF NOT EXISTS public.reconciliation_submissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  team_id uuid NOT NULL,
  reconciliation_date date NOT NULL,
  scope text NOT NULL,
  user_id uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  is_deleted boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS public.report_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  team_id uuid NOT NULL,
  budget_id uuid,
  filters jsonb DEFAULT '{}'::jsonb NOT NULL,
  sections jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'in_progress'::text NOT NULL,
  file_url text,
  error_message text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  deleted_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.request_role_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role_code text NOT NULL,
  team_id uuid,
  request_type text,
  is_active boolean DEFAULT true NOT NULL,
  assigned_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.subcategory_master (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category_master_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  is_mandatory boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  is_deleted boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  task_number text NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'todo'::text NOT NULL,
  priority text DEFAULT 'medium'::text NOT NULL,
  assigned_to uuid,
  created_by uuid NOT NULL,
  team_id uuid NOT NULL,
  context_app text,
  context_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE TABLE IF NOT EXISTS public.team_group_members (
  group_id uuid NOT NULL,
  team_id uuid NOT NULL
);
CREATE TABLE IF NOT EXISTS public.team_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  oh_id uuid,
  caoh_id uuid,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.team_relationships (
  parent_id uuid NOT NULL,
  child_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  name text NOT NULL,
  description text,
  lead_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  gender_rule text DEFAULT 'any'::text,
  is_active boolean DEFAULT true,
  is_personal_team boolean DEFAULT false NOT NULL,
  personal_owner_user_id uuid,
  created_by_oht_user_id uuid,
  has_budget_access boolean DEFAULT true NOT NULL,
  has_tasks_access boolean DEFAULT true NOT NULL,
  has_lms_access boolean DEFAULT false NOT NULL,
  gender_scope text DEFAULT 'mixed'::text,
  team_type text,
  department text,
  prefix character varying(10)
);
CREATE TABLE IF NOT EXISTS public.transfers (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  from_bucket_id uuid NOT NULL,
  to_bucket_id uuid NOT NULL,
  amount numeric(15,2) NOT NULL,
  currency text DEFAULT 'USD'::text NOT NULL,
  rate numeric(10,6) DEFAULT 1 NOT NULL,
  description text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  team_id uuid,
  status text DEFAULT 'ACCEPTED'::text NOT NULL,
  flow_type text,
  receiver_user_id uuid,
  receiver_kind text,
  dest_amount numeric(18,2),
  dest_currency text,
  accepted_at timestamp with time zone,
  rejected_at timestamp with time zone,
  is_deleted boolean DEFAULT false NOT NULL,
  dest_team_id uuid,
  pending_step text,
  ohf_approved_at timestamp with time zone,
  ohf_approved_by uuid,
  linked_budget_id uuid,
  deleted_at timestamp with time zone,
  attachment_url text,
  attachment_name text
);
CREATE TABLE IF NOT EXISTS public.user_groups (
  user_id uuid NOT NULL,
  group_id uuid NOT NULL,
  role_in_group text DEFAULT 'viewer'::text,
  granted_by uuid,
  granted_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_team_defaults (
  user_id uuid NOT NULL,
  team_id uuid NOT NULL,
  defaults jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.user_teams (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  team_id uuid NOT NULL,
  is_primary boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  access_level text DEFAULT 'member'::text,
  granted_by uuid,
  granted_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  deleted_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL,
  email text NOT NULL,
  name text,
  role text DEFAULT 'member'::text NOT NULL,
  team_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  gender text,
  transaction_pin_hash text,
  pin_attempts integer DEFAULT 0,
  pin_locked_until timestamp with time zone,
  pin_set_at timestamp with time zone,
  reconciliation_threshold integer DEFAULT 7,
  is_financial_custodian boolean DEFAULT false,
  is_deleted boolean DEFAULT false,
  deleted_at timestamp with time zone,
  request_alias character varying(5),
  request_counter integer DEFAULT 0 NOT NULL,
  on_hold boolean DEFAULT false NOT NULL,
  notification_mode text DEFAULT 'summary'::text,
  escalation_tokens integer DEFAULT 3 NOT NULL,
  clearance_level text DEFAULT 'standard'::text NOT NULL,
  default_login_view text DEFAULT 'team'::text NOT NULL,
  allowed_views text[] DEFAULT '{team}'::text[]
);

-- ============================================================
-- Constraints, pass 1: PRIMARY KEY / UNIQUE / CHECK (must precede any FK that references them)
-- ============================================================

ALTER TABLE public.app_role_assignments ADD CONSTRAINT app_role_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.app_roles ADD CONSTRAINT app_roles_app_code_role_code_key UNIQUE (app_code, role_code);
ALTER TABLE public.app_roles ADD CONSTRAINT app_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.approval_flow_definitions ADD CONSTRAINT approval_flow_definitions_pkey PRIMARY KEY (id);
ALTER TABLE public.approval_flow_steps ADD CONSTRAINT approval_flow_steps_flow_id_step_order_key UNIQUE (flow_id, step_order);
ALTER TABLE public.approval_flow_steps ADD CONSTRAINT approval_flow_steps_pkey PRIMARY KEY (id);
ALTER TABLE public.approval_messages ADD CONSTRAINT approval_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.approval_request_reconciliation_lines ADD CONSTRAINT approval_request_reconciliati_request_id_reconciliation_lin_key UNIQUE (request_id, reconciliation_line_id);
ALTER TABLE public.approval_request_reconciliation_lines ADD CONSTRAINT approval_request_reconciliation_lines_pkey PRIMARY KEY (id);
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_number_unique UNIQUE (request_number);
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.bucket_access ADD CONSTRAINT bucket_access_bucket_id_user_id_key UNIQUE (bucket_id, user_id);
ALTER TABLE public.bucket_access ADD CONSTRAINT bucket_access_pkey PRIMARY KEY (id);
ALTER TABLE public.buckets ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);
ALTER TABLE public.buckets ADD CONSTRAINT buckets_type_check CHECK ((type = ANY (ARRAY['cash'::text, 'bank'::text, 'crypto'::text, 'other'::text])));
ALTER TABLE public.buckets ADD CONSTRAINT chk_bucket_balance_non_negative CHECK ((balance >= (0)::numeric));
ALTER TABLE public.budget_calendar_entries ADD CONSTRAINT budget_calendar_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.budget_calendar_entries ADD CONSTRAINT budget_calendar_entries_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])));
ALTER TABLE public.budget_calendar_entries ADD CONSTRAINT budget_calendar_period_date_unique UNIQUE (budget_period_date);
ALTER TABLE public.budget_categories ADD CONSTRAINT budget_categories_budget_id_category_id_key UNIQUE (budget_id, category_id);
ALTER TABLE public.budget_categories ADD CONSTRAINT budget_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.budget_plans ADD CONSTRAINT budget_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.budget_type_template_assignments ADD CONSTRAINT budget_type_template_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.budget_type_templates ADD CONSTRAINT budget_type_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.budget_types ADD CONSTRAINT budget_types_pkey PRIMARY KEY (id);
ALTER TABLE public.categories ADD CONSTRAINT categories_name_key UNIQUE (name);
ALTER TABLE public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
ALTER TABLE public.category_master ADD CONSTRAINT category_master_name_unique UNIQUE (name);
ALTER TABLE public.category_master ADD CONSTRAINT category_master_pkey PRIMARY KEY (id);
ALTER TABLE public.chat_group_members ADD CONSTRAINT chat_group_members_pkey PRIMARY KEY (group_id, user_id);
ALTER TABLE public.chat_groups ADD CONSTRAINT chat_groups_pkey PRIMARY KEY (id);
ALTER TABLE public.chat_permissions ADD CONSTRAINT chat_permissions_cross_team_access_check CHECK ((cross_team_access = ANY (ARRAY['none'::text, 'team'::text, 'global'::text])));
ALTER TABLE public.chat_permissions ADD CONSTRAINT chat_permissions_pkey PRIMARY KEY (user_id);
ALTER TABLE public.chat_preferences ADD CONSTRAINT chat_preferences_chat_target_type_check CHECK ((chat_target_type = ANY (ARRAY['user'::text, 'team'::text, 'group'::text])));
ALTER TABLE public.chat_preferences ADD CONSTRAINT chat_preferences_pkey PRIMARY KEY (user_id, chat_target_type, chat_target_id);
ALTER TABLE public.daily_reconciliation ADD CONSTRAINT daily_reconciliation_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_reconciliation ADD CONSTRAINT daily_reconciliation_team_date_unique UNIQUE (team_id, reconciliation_date);
ALTER TABLE public.exchange_rates ADD CONSTRAINT exchange_rates_from_currency_to_currency_date_key UNIQUE (from_currency, to_currency, date);
ALTER TABLE public.exchange_rates ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);
ALTER TABLE public.expense_attachments ADD CONSTRAINT expense_attachments_pkey PRIMARY KEY (id);
ALTER TABLE public.expense_receipts ADD CONSTRAINT expense_receipts_pkey PRIMARY KEY (id);
ALTER TABLE public.expense_receipts ADD CONSTRAINT expense_receipts_team_number_unique UNIQUE (team_id, receipt_number);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_payment_status_check CHECK ((payment_status = ANY (ARRAY['paid'::text, 'pending'::text, 'reimbursement'::text])));
ALTER TABLE public.expenses ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);
ALTER TABLE public.income ADD CONSTRAINT income_pkey PRIMARY KEY (id);
ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE public.messages ADD CONSTRAINT messages_recipient_type_check CHECK ((recipient_type = ANY (ARRAY['user'::text, 'team'::text, 'role'::text])));
ALTER TABLE public.ok_admins ADD CONSTRAINT ok_admins_pkey PRIMARY KEY (user_id);
ALTER TABLE public.ok_app_access ADD CONSTRAINT ok_app_access_app_code_check CHECK ((app_code = ANY (ARRAY['finance'::text, 'gurukul'::text, 'utilities'::text, 'tasks'::text, 'konnect'::text])));
ALTER TABLE public.ok_app_access ADD CONSTRAINT ok_app_access_pkey PRIMARY KEY (user_id, team_id, app_code);
ALTER TABLE public.ok_app_admins ADD CONSTRAINT ok_app_admins_app_code_user_id_key UNIQUE (app_code, user_id);
ALTER TABLE public.ok_app_admins ADD CONSTRAINT ok_app_admins_pkey PRIMARY KEY (id);
ALTER TABLE public.ok_home_pins ADD CONSTRAINT ok_home_pins_app_code_check CHECK ((app_code = ANY (ARRAY['finance'::text, 'gurukul'::text, 'utilities'::text, 'tasks'::text, 'konnect'::text])));
ALTER TABLE public.ok_home_pins ADD CONSTRAINT ok_home_pins_pkey PRIMARY KEY (user_id, app_code);
ALTER TABLE public.ok_menu_access ADD CONSTRAINT ok_menu_access_app_code_check CHECK ((app_code = ANY (ARRAY['finance'::text, 'gurukul'::text, 'utilities'::text, 'tasks'::text, 'konnect'::text])));
ALTER TABLE public.ok_menu_access ADD CONSTRAINT ok_menu_access_pkey PRIMARY KEY (user_id, team_id, app_code, menu_key);
ALTER TABLE public.ok_messages ADD CONSTRAINT ok_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.reconciliation_lines ADD CONSTRAINT reconciliation_lines_pkey PRIMARY KEY (id);
ALTER TABLE public.reconciliation_submissions ADD CONSTRAINT reconciliation_personal_requires_user CHECK (((scope <> 'personal'::text) OR (user_id IS NOT NULL)));
ALTER TABLE public.reconciliation_submissions ADD CONSTRAINT reconciliation_submissions_pkey PRIMARY KEY (id);
ALTER TABLE public.reconciliation_submissions ADD CONSTRAINT reconciliation_submissions_scope_check CHECK ((scope = ANY (ARRAY['team'::text, 'personal'::text, 'all'::text])));
ALTER TABLE public.report_logs ADD CONSTRAINT report_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.request_role_assignments ADD CONSTRAINT request_role_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.subcategory_master ADD CONSTRAINT subcategory_master_pkey PRIMARY KEY (id);
ALTER TABLE public.subcategory_master ADD CONSTRAINT subcategory_master_unique UNIQUE (category_master_id, name);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_context_app_check CHECK ((context_app = ANY (ARRAY['finance'::text, 'gurukul'::text, 'legal'::text, 'ops'::text])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'completed'::text, 'backlog'::text])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_team_id_task_number_key UNIQUE (team_id, task_number);
ALTER TABLE public.team_group_members ADD CONSTRAINT team_group_members_pkey PRIMARY KEY (group_id, team_id);
ALTER TABLE public.team_groups ADD CONSTRAINT team_groups_pkey PRIMARY KEY (id);
ALTER TABLE public.team_relationships ADD CONSTRAINT parent_id_neq_child_id CHECK ((parent_id <> child_id));
ALTER TABLE public.team_relationships ADD CONSTRAINT team_relationships_pkey PRIMARY KEY (parent_id, child_id);
ALTER TABLE public.teams ADD CONSTRAINT teams_gender_rule_check CHECK ((gender_rule = ANY (ARRAY['any'::text, 'male_only'::text, 'female_only'::text, 'caoh_approved'::text])));
ALTER TABLE public.teams ADD CONSTRAINT teams_gender_scope_check CHECK ((gender_scope = ANY (ARRAY['male'::text, 'female'::text, 'mixed'::text])));
ALTER TABLE public.teams ADD CONSTRAINT teams_pkey PRIMARY KEY (id);
ALTER TABLE public.teams ADD CONSTRAINT teams_prefix_key UNIQUE (prefix);
ALTER TABLE public.transfers ADD CONSTRAINT transfers_flow_type_check CHECK (((flow_type IS NULL) OR (flow_type = ANY (ARRAY['otl_operational'::text, 'otl_to_member'::text, 'otm_to_team'::text, 'otm_to_member'::text, 'cross_team_personal'::text, 'org_to_team'::text, 'team_to_org'::text, 'org_to_oph'::text, 'oph_to_team'::text, 'unused_funds_return'::text]))));
ALTER TABLE public.transfers ADD CONSTRAINT transfers_pending_step_check CHECK (((pending_step IS NULL) OR (pending_step = ANY (ARRAY['ohf'::text, 'receiver'::text]))));
ALTER TABLE public.transfers ADD CONSTRAINT transfers_pkey PRIMARY KEY (id);
ALTER TABLE public.transfers ADD CONSTRAINT transfers_receiver_kind_check CHECK (((receiver_kind IS NULL) OR (receiver_kind = ANY (ARRAY['member'::text, 'otl'::text]))));
ALTER TABLE public.transfers ADD CONSTRAINT transfers_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'REJECTED'::text])));
ALTER TABLE public.user_groups ADD CONSTRAINT user_groups_pkey PRIMARY KEY (user_id, group_id);
ALTER TABLE public.user_groups ADD CONSTRAINT user_groups_role_in_group_check CHECK ((role_in_group = ANY (ARRAY['viewer'::text, 'oh'::text, 'caoh_delegate'::text])));
ALTER TABLE public.user_team_defaults ADD CONSTRAINT user_team_defaults_pkey PRIMARY KEY (user_id, team_id);
ALTER TABLE public.user_teams ADD CONSTRAINT user_teams_access_level_check CHECK ((access_level = ANY (ARRAY['view'::text, 'member'::text, 'oht'::text, 'lead'::text, 'admin'::text])));
ALTER TABLE public.user_teams ADD CONSTRAINT user_teams_pkey PRIMARY KEY (user_id, team_id);
ALTER TABLE public.user_teams ADD CONSTRAINT user_teams_user_id_team_id_key UNIQUE (user_id, team_id);
ALTER TABLE public.users ADD CONSTRAINT users_clearance_level_check CHECK ((clearance_level = ANY (ARRAY['restricted'::text, 'standard'::text, 'supervisor'::text])));
ALTER TABLE public.users ADD CONSTRAINT users_default_login_view_check CHECK ((default_login_view = ANY (ARRAY['team'::text, 'manager'::text, 'admin'::text])));
ALTER TABLE public.users ADD CONSTRAINT users_escalation_tokens_check CHECK (((escalation_tokens >= 0) AND (escalation_tokens <= 3)));
ALTER TABLE public.users ADD CONSTRAINT users_gender_check CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text])));
ALTER TABLE public.users ADD CONSTRAINT users_notification_mode_check CHECK ((notification_mode = ANY (ARRAY['summary'::text, 'detail'::text])));
ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['user'::text, 'oh'::text, 'caoh'::text, 'ceo'::text, 'admin'::text, 'fin'::text, 'fip'::text])));

-- ============================================================
-- Constraints, pass 2: FOREIGN KEY (needs every table's own PK/UNIQUE to already exist)
-- ============================================================

ALTER TABLE public.app_role_assignments ADD CONSTRAINT app_role_assignments_app_code_role_code_fkey FOREIGN KEY (app_code, role_code) REFERENCES app_roles(app_code, role_code) ON DELETE CASCADE;
ALTER TABLE public.app_role_assignments ADD CONSTRAINT app_role_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public.app_role_assignments ADD CONSTRAINT app_role_assignments_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.app_role_assignments ADD CONSTRAINT app_role_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.approval_flow_definitions ADD CONSTRAINT approval_flow_definitions_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.approval_flow_definitions ADD CONSTRAINT approval_flow_definitions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.approval_flow_steps ADD CONSTRAINT approval_flow_steps_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES approval_flow_definitions(id) ON DELETE CASCADE;
ALTER TABLE public.approval_messages ADD CONSTRAINT approval_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id);
ALTER TABLE public.approval_messages ADD CONSTRAINT approval_messages_request_id_fkey FOREIGN KEY (request_id) REFERENCES approval_requests(id) ON DELETE CASCADE;
ALTER TABLE public.approval_request_reconciliation_lines ADD CONSTRAINT approval_request_reconciliati_reconciliation_submission_id_fkey FOREIGN KEY (reconciliation_submission_id) REFERENCES reconciliation_submissions(id) ON DELETE SET NULL;
ALTER TABLE public.approval_request_reconciliation_lines ADD CONSTRAINT approval_request_reconciliation_lin_reconciliation_line_id_fkey FOREIGN KEY (reconciliation_line_id) REFERENCES reconciliation_lines(id) ON DELETE CASCADE;
ALTER TABLE public.approval_request_reconciliation_lines ADD CONSTRAINT approval_request_reconciliation_lines_request_id_fkey FOREIGN KEY (request_id) REFERENCES approval_requests(id) ON DELETE CASCADE;
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_budget_plan_id_fkey FOREIGN KEY (budget_plan_id) REFERENCES budget_plans(id);
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_reconciliation_submission_id_fkey FOREIGN KEY (reconciliation_submission_id) REFERENCES reconciliation_submissions(id);
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES transfers(id);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE public.bucket_access ADD CONSTRAINT bucket_access_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id);
ALTER TABLE public.bucket_access ADD CONSTRAINT bucket_access_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES buckets(id) ON DELETE CASCADE;
ALTER TABLE public.bucket_access ADD CONSTRAINT bucket_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.buckets ADD CONSTRAINT buckets_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public.buckets ADD CONSTRAINT buckets_custodian_id_fkey FOREIGN KEY (custodian_id) REFERENCES users(id);
ALTER TABLE public.buckets ADD CONSTRAINT buckets_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE public.buckets ADD CONSTRAINT buckets_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id);
ALTER TABLE public.buckets ADD CONSTRAINT buckets_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.budget_calendar_entries ADD CONSTRAINT budget_calendar_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.budget_categories ADD CONSTRAINT budget_categories_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE;
ALTER TABLE public.budget_categories ADD CONSTRAINT budget_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
ALTER TABLE public.budget_plans ADD CONSTRAINT budget_plans_approval_request_id_fkey FOREIGN KEY (approval_request_id) REFERENCES approval_requests(id);
ALTER TABLE public.budget_plans ADD CONSTRAINT budget_plans_calendar_entry_id_fkey FOREIGN KEY (calendar_entry_id) REFERENCES budget_calendar_entries(id);
ALTER TABLE public.budget_plans ADD CONSTRAINT budget_plans_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public.budget_plans ADD CONSTRAINT budget_plans_template_id_fkey FOREIGN KEY (template_id) REFERENCES budget_type_templates(id) ON DELETE SET NULL;
ALTER TABLE public.budget_type_template_assignments ADD CONSTRAINT budget_type_template_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.budget_type_template_assignments ADD CONSTRAINT budget_type_template_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES budget_type_templates(id) ON DELETE CASCADE;
ALTER TABLE public.budget_type_template_assignments ADD CONSTRAINT budget_type_template_assignments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.budget_type_templates ADD CONSTRAINT budget_type_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.budget_type_templates ADD CONSTRAINT budget_type_templates_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.budget_type_templates ADD CONSTRAINT budget_type_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.budget_types ADD CONSTRAINT budget_types_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.budget_types ADD CONSTRAINT budget_types_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.budget_types ADD CONSTRAINT budget_types_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.budget_types ADD CONSTRAINT budget_types_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.categories ADD CONSTRAINT categories_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.categories ADD CONSTRAINT categories_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public.category_master ADD CONSTRAINT category_master_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.chat_group_members ADD CONSTRAINT chat_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE;
ALTER TABLE public.chat_group_members ADD CONSTRAINT chat_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.chat_groups ADD CONSTRAINT chat_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.chat_permissions ADD CONSTRAINT chat_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.chat_preferences ADD CONSTRAINT chat_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.daily_reconciliation ADD CONSTRAINT daily_reconciliation_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.exchange_rates ADD CONSTRAINT exchange_rates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public.exchange_rates ADD CONSTRAINT exchange_rates_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public.expense_attachments ADD CONSTRAINT expense_attachments_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES buckets(id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES budget_plans(id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES category_master(id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES subcategory_master(id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public.income ADD CONSTRAINT fk_income_bucket FOREIGN KEY (bucket_id) REFERENCES buckets(id) ON DELETE SET NULL;
ALTER TABLE public.income ADD CONSTRAINT income_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public.messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.ok_admins ADD CONSTRAINT ok_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.ok_app_access ADD CONSTRAINT ok_app_access_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.ok_app_access ADD CONSTRAINT ok_app_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.ok_app_admins ADD CONSTRAINT ok_app_admins_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public.ok_app_admins ADD CONSTRAINT ok_app_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.ok_home_pins ADD CONSTRAINT ok_home_pins_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.ok_menu_access ADD CONSTRAINT ok_menu_access_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.ok_menu_access ADD CONSTRAINT ok_menu_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.ok_messages ADD CONSTRAINT ok_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.reconciliation_lines ADD CONSTRAINT reconciliation_lines_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES reconciliation_submissions(id) ON DELETE CASCADE;
ALTER TABLE public.reconciliation_submissions ADD CONSTRAINT reconciliation_submissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.reconciliation_submissions ADD CONSTRAINT reconciliation_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.report_logs ADD CONSTRAINT report_logs_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES budget_plans(id) ON DELETE SET NULL;
ALTER TABLE public.request_role_assignments ADD CONSTRAINT request_role_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id);
ALTER TABLE public.request_role_assignments ADD CONSTRAINT request_role_assignments_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.request_role_assignments ADD CONSTRAINT request_role_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.subcategory_master ADD CONSTRAINT subcategory_master_category_master_id_fkey FOREIGN KEY (category_master_id) REFERENCES category_master(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.team_group_members ADD CONSTRAINT team_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES team_groups(id) ON DELETE CASCADE;
ALTER TABLE public.team_group_members ADD CONSTRAINT team_group_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.team_groups ADD CONSTRAINT team_groups_caoh_id_fkey FOREIGN KEY (caoh_id) REFERENCES users(id);
ALTER TABLE public.team_groups ADD CONSTRAINT team_groups_oh_id_fkey FOREIGN KEY (oh_id) REFERENCES users(id);
ALTER TABLE public.team_relationships ADD CONSTRAINT team_relationships_child_id_fkey FOREIGN KEY (child_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.team_relationships ADD CONSTRAINT team_relationships_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.teams ADD CONSTRAINT fk_team_lead FOREIGN KEY (lead_id) REFERENCES users(id);
ALTER TABLE public.teams ADD CONSTRAINT teams_created_by_oht_user_id_fkey FOREIGN KEY (created_by_oht_user_id) REFERENCES auth.users(id);
ALTER TABLE public.teams ADD CONSTRAINT teams_personal_owner_user_id_fkey FOREIGN KEY (personal_owner_user_id) REFERENCES auth.users(id);
ALTER TABLE public.transfers ADD CONSTRAINT fk_transfers_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.transfers ADD CONSTRAINT transfers_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public.transfers ADD CONSTRAINT transfers_dest_team_id_fkey FOREIGN KEY (dest_team_id) REFERENCES teams(id);
ALTER TABLE public.transfers ADD CONSTRAINT transfers_from_bucket_id_fkey FOREIGN KEY (from_bucket_id) REFERENCES buckets(id);
ALTER TABLE public.transfers ADD CONSTRAINT transfers_ohf_approved_by_fkey FOREIGN KEY (ohf_approved_by) REFERENCES auth.users(id);
ALTER TABLE public.transfers ADD CONSTRAINT transfers_receiver_user_id_fkey FOREIGN KEY (receiver_user_id) REFERENCES auth.users(id);
ALTER TABLE public.transfers ADD CONSTRAINT transfers_to_bucket_id_fkey FOREIGN KEY (to_bucket_id) REFERENCES buckets(id);
ALTER TABLE public.user_groups ADD CONSTRAINT user_groups_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES users(id);
ALTER TABLE public.user_groups ADD CONSTRAINT user_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES team_groups(id) ON DELETE CASCADE;
ALTER TABLE public.user_groups ADD CONSTRAINT user_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_team_defaults ADD CONSTRAINT user_team_defaults_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.user_teams ADD CONSTRAINT user_teams_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES users(id);
ALTER TABLE public.user_teams ADD CONSTRAINT user_teams_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.user_teams ADD CONSTRAINT user_teams_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.users ADD CONSTRAINT users_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_app_role_assignments_roles ON public.app_role_assignments USING btree (app_code, role_code);
CREATE INDEX idx_app_role_assignments_team_id ON public.app_role_assignments USING btree (team_id);
CREATE INDEX idx_app_role_assignments_user_id ON public.app_role_assignments USING btree (user_id);
CREATE UNIQUE INDEX idx_unique_global_role_assignment ON public.app_role_assignments USING btree (app_code, role_code, user_id) WHERE (team_id IS NULL);
CREATE UNIQUE INDEX idx_unique_team_role_assignment ON public.app_role_assignments USING btree (app_code, role_code, user_id, team_id) WHERE (team_id IS NOT NULL);
CREATE INDEX idx_app_roles_app_code ON public.app_roles USING btree (app_code);
CREATE INDEX idx_approval_flow_defs_lookup ON public.approval_flow_definitions USING btree (request_type, is_active, priority DESC);
CREATE INDEX idx_approval_flow_steps_flow ON public.approval_flow_steps USING btree (flow_id, step_order);
CREATE INDEX idx_approval_messages_request ON public.approval_messages USING btree (request_id, created_at DESC);
CREATE INDEX idx_approval_recon_lines_recon_line ON public.approval_request_reconciliation_lines USING btree (reconciliation_line_id);
CREATE INDEX idx_approval_recon_lines_request ON public.approval_request_reconciliation_lines USING btree (request_id);
CREATE INDEX idx_approval_requests_budget ON public.approval_requests USING btree (budget_plan_id) WHERE ((budget_plan_id IS NOT NULL) AND (is_deleted = false));
CREATE INDEX idx_approval_requests_group ON public.approval_requests USING btree (group_number) WHERE ((group_number IS NOT NULL) AND (is_deleted = false));
CREATE INDEX idx_approval_requests_inbox ON public.approval_requests USING btree (status, current_role_code, team_id) WHERE (is_deleted = false);
CREATE INDEX idx_approval_requests_number ON public.approval_requests USING btree (request_number) WHERE (is_deleted = false);
CREATE INDEX idx_approval_requests_recon ON public.approval_requests USING btree (reconciliation_submission_id) WHERE ((reconciliation_submission_id IS NOT NULL) AND (is_deleted = false));
CREATE INDEX idx_approval_requests_team ON public.approval_requests USING btree (team_id, status) WHERE (is_deleted = false);
CREATE INDEX idx_approval_requests_transfer ON public.approval_requests USING btree (transfer_id) WHERE ((transfer_id IS NOT NULL) AND (is_deleted = false));
CREATE INDEX idx_buckets_is_deleted ON public.buckets USING btree (is_deleted);
CREATE INDEX idx_buckets_owner ON public.buckets USING btree (team_id, owner_user_id) WHERE (is_deleted = false);
CREATE UNIQUE INDEX idx_buckets_team_name_unique ON public.buckets USING btree (team_id, lower(TRIM(BOTH FROM name))) WHERE (is_deleted = false);
CREATE INDEX idx_budget_calendar_period_date ON public.budget_calendar_entries USING btree (budget_period_date) WHERE (is_deleted = false);
CREATE INDEX idx_budget_calendar_submission ON public.budget_calendar_entries USING btree (submission_deadline) WHERE (is_deleted = false);
CREATE INDEX idx_budget_plans_calendar ON public.budget_plans USING btree (team_id, calendar_entry_id) WHERE (is_deleted = false);
CREATE INDEX idx_budget_plans_is_deleted ON public.budget_plans USING btree (is_deleted);
CREATE INDEX idx_budget_plans_status ON public.budget_plans USING btree (status);
CREATE INDEX idx_budget_plans_team_id ON public.budget_plans USING btree (team_id);
CREATE INDEX idx_budget_plans_template_id ON public.budget_plans USING btree (template_id);
CREATE INDEX idx_budget_plans_type_status ON public.budget_plans USING btree (team_id, budget_type, status) WHERE (is_deleted = false);
CREATE UNIQUE INDEX idx_assignments_active_budget_type ON public.budget_type_template_assignments USING btree (budget_type) WHERE ((NOT is_deleted) AND (budget_type IS NOT NULL));
CREATE INDEX idx_assignments_budget_type ON public.budget_type_template_assignments USING btree (budget_type);
CREATE INDEX idx_assignments_template ON public.budget_type_template_assignments USING btree (template_id);
CREATE INDEX idx_budget_type_templates_deleted ON public.budget_type_templates USING btree (is_deleted);
CREATE UNIQUE INDEX idx_budget_type_templates_name ON public.budget_type_templates USING btree (name) WHERE (NOT is_deleted);
CREATE INDEX idx_budget_types_active ON public.budget_types USING btree (team_id, is_active) WHERE (NOT is_deleted);
CREATE UNIQUE INDEX idx_budget_types_code ON public.budget_types USING btree (code) WHERE ((NOT is_deleted) AND (code IS NOT NULL));
CREATE INDEX idx_budget_types_deleted ON public.budget_types USING btree (is_deleted);
CREATE UNIQUE INDEX idx_budget_types_name ON public.budget_types USING btree (name) WHERE (NOT is_deleted);
CREATE INDEX idx_budget_types_team ON public.budget_types USING btree (team_id);
CREATE INDEX idx_categories_is_deleted ON public.categories USING btree (is_deleted);
CREATE INDEX idx_categories_team_id ON public.categories USING btree (team_id);
CREATE INDEX idx_daily_reconciliation_team ON public.daily_reconciliation USING btree (team_id, reconciliation_date DESC) WHERE (is_deleted = false);
CREATE INDEX idx_exchange_rates_is_deleted ON public.exchange_rates USING btree (is_deleted);
CREATE INDEX idx_exchange_rates_team_id ON public.exchange_rates USING btree (team_id);
CREATE INDEX idx_expense_receipts_team_date ON public.expense_receipts USING btree (team_id, receipt_date DESC);
CREATE INDEX idx_income_bucket_id ON public.income USING btree (bucket_id);
CREATE INDEX idx_income_date ON public.income USING btree (date);
CREATE INDEX idx_income_is_deleted ON public.income USING btree (is_deleted);
CREATE INDEX idx_income_team_bucket ON public.income USING btree (team_id, bucket_id);
CREATE INDEX idx_income_team_id ON public.income USING btree (team_id);
CREATE INDEX idx_ok_messages_user_created ON public.ok_messages USING btree (user_id, created_at DESC);
CREATE INDEX idx_recon_lines_submission ON public.reconciliation_lines USING btree (submission_id);
CREATE UNIQUE INDEX idx_recon_submission_all_daily ON public.reconciliation_submissions USING btree (team_id, reconciliation_date) WHERE ((scope = 'all'::text) AND (is_deleted = false));
CREATE UNIQUE INDEX idx_recon_submission_personal_daily ON public.reconciliation_submissions USING btree (team_id, reconciliation_date, user_id) WHERE ((scope = 'personal'::text) AND (is_deleted = false));
CREATE UNIQUE INDEX idx_recon_submission_team_daily ON public.reconciliation_submissions USING btree (team_id, reconciliation_date) WHERE ((scope = 'team'::text) AND (is_deleted = false));
CREATE INDEX idx_recon_submissions_team_date ON public.reconciliation_submissions USING btree (team_id, reconciliation_date DESC) WHERE (is_deleted = false);
CREATE INDEX idx_request_role_assignments_lookup ON public.request_role_assignments USING btree (role_code, team_id) WHERE (is_active = true);
CREATE UNIQUE INDEX idx_request_role_assignments_unique ON public.request_role_assignments USING btree (user_id, upper(role_code), COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(request_type, ''::text)) WHERE (is_active = true);
CREATE INDEX idx_teams_oht_creator ON public.teams USING btree (created_by_oht_user_id) WHERE (created_by_oht_user_id IS NOT NULL);
CREATE INDEX idx_teams_personal_owner ON public.teams USING btree (personal_owner_user_id) WHERE (is_personal_team = true);
CREATE INDEX idx_transfers_dest_team ON public.transfers USING btree (dest_team_id) WHERE (is_deleted = false);
CREATE INDEX idx_transfers_ohf_pending ON public.transfers USING btree (status, pending_step) WHERE ((status = 'PENDING'::text) AND (pending_step = 'ohf'::text) AND (is_deleted = false));
CREATE INDEX idx_transfers_receiver_pending ON public.transfers USING btree (receiver_user_id, status) WHERE ((status = 'PENDING'::text) AND (is_deleted = false));
CREATE INDEX idx_transfers_status_team ON public.transfers USING btree (team_id, status) WHERE (is_deleted = false);
CREATE INDEX idx_transfers_team_date ON public.transfers USING btree (team_id, date DESC);
CREATE INDEX idx_transfers_team_id ON public.transfers USING btree (team_id);
CREATE INDEX idx_user_team_defaults_team ON public.user_team_defaults USING btree (team_id);
CREATE INDEX idx_users_on_hold ON public.users USING btree (on_hold) WHERE (on_hold = true);
CREATE UNIQUE INDEX idx_users_request_alias_unique ON public.users USING btree (upper(TRIM(BOTH FROM request_alias))) WHERE ((request_alias IS NOT NULL) AND (TRIM(BOTH FROM request_alias) <> ''::text));

-- ============================================================
-- Functions (50 of 72 total - KManager scope only)
-- ============================================================

-- Must come AFTER tables: some are LANGUAGE sql functions, which Postgres
-- type-checks against the catalog at CREATE time (unlike plpgsql, which only
-- validates its body at first execution) - they'd fail here if their tables
-- didn't exist yet. Found this the hard way via the isolated-schema smoke test.
CREATE OR REPLACE FUNCTION public.accept_budget_payment_transfer(p_transfer_id uuid, p_bucket_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer public.transfers%ROWTYPE;
  v_bucket public.buckets%ROWTYPE;
  v_income_id uuid;
  v_amount numeric;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;
  IF v_transfer.status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'Transfer is not pending';
  END IF;
  IF v_transfer.flow_type NOT IN ('org_to_team', 'oph_to_team') OR v_transfer.linked_budget_id IS NULL THEN
    RAISE EXCEPTION 'Transfer is not a budget payment';
  END IF;

  SELECT * INTO v_bucket FROM public.buckets WHERE id = p_bucket_id AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bucket not found';
  END IF;
  IF v_bucket.team_id IS DISTINCT FROM v_transfer.dest_team_id THEN
    RAISE EXCEPTION 'Bucket does not belong to the receiving team';
  END IF;

  v_amount := COALESCE(v_transfer.dest_amount, v_transfer.amount, 0);
  v_income_id := gen_random_uuid();

  INSERT INTO public.income (
    id, team_id, date, payment_from, bucket_id, payment_bucket,
    amount_usd, currency, exchange_rate, local_amount,
    description, budget_allocations, created_by, is_deleted, updated_at, source
  ) VALUES (
    v_income_id,
    v_transfer.dest_team_id,
    COALESCE(v_transfer.date, CURRENT_DATE),
    'KMOF / Budget Funding',
    v_bucket.id,
    v_bucket.name,
    v_amount,
    COALESCE(v_bucket.currency, 'USD'),
    1,
    v_amount,
    'Received funding for budget payment installment',
    jsonb_build_array(jsonb_build_object('budget_id', v_transfer.linked_budget_id, 'amount_usd', v_amount)),
    COALESCE(p_user_id, auth.uid()),
    false,
    now(),
    'budget_payment'
  );

  UPDATE public.transfers
  SET status = 'ACCEPTED', accepted_at = now(), pending_step = null
  WHERE id = p_transfer_id;

  UPDATE public.budget_plans
  SET status = 'received'
  WHERE id = v_transfer.linked_budget_id;

  RETURN jsonb_build_object('ok', true, 'income_id', v_income_id, 'amount_usd', v_amount);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.allocate_request_number(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alias text;
  v_counter integer;
BEGIN
  UPDATE users
  SET request_counter = request_counter + 1
  WHERE id = p_user_id
  RETURNING upper(trim(request_alias)), request_counter
  INTO v_alias, v_counter;

  IF v_alias IS NULL OR length(v_alias) < 3 THEN
    RAISE EXCEPTION 'Set a 3-5 character request alias in your profile first';
  END IF;

  RETURN v_alias || '-' || v_counter::text;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.apply_reconciliation_adjustment_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req approval_requests%ROWTYPE;
  v_link RECORD;
BEGIN
  SELECT * INTO v_req FROM approval_requests
  WHERE id = p_request_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_req.request_type <> 'reconciliation_adjustment' THEN
    RAISE EXCEPTION 'Not a reconciliation adjustment request';
  END IF;

  IF v_req.status NOT LIKE '%-APPROVED' OR v_req.status = 'REJECTED' THEN
    RAISE EXCEPTION 'Request is not approved';
  END IF;

  FOR v_link IN
    SELECT * FROM approval_request_reconciliation_lines WHERE request_id = p_request_id
  LOOP
    -- Apply only the recorded mismatch to the *current* balance (not absolute actual).
    -- difference = actual − closing at reconcile time; income/expenses since then stay reflected.
    IF v_link.bucket_id IS NOT NULL AND v_link.difference IS NOT NULL
       AND abs(v_link.difference) >= 0.01 THEN
      UPDATE buckets
      SET balance = COALESCE(balance, 0) + v_link.difference,
          updated_at = now()
      WHERE id = v_link.bucket_id;
    END IF;
    IF v_link.reconciliation_line_id IS NOT NULL THEN
      UPDATE reconciliation_lines SET adjustment_status = 'approved' WHERE id = v_link.reconciliation_line_id;
    END IF;
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.can_chat_with(user_a uuid, user_b uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  gender_a text;
  gender_b text;
  allow_opposite_a boolean;
  allow_opposite_b boolean;
  access_a text;
  role_a text;
  role_b text;
  is_admin_a boolean;
  allowed_users_a uuid[];
  allowed_roles_a text[];
  allowed_teams_a uuid[];
BEGIN
  -- Always allow self chat
  IF user_a = user_b THEN
    RETURN true;
  END IF;
  -- Check admin bypass
  SELECT (role = 'admin'), role INTO is_admin_a, role_a FROM public.users WHERE id = user_a;
  IF is_admin_a THEN
    RETURN true;
  END IF;
  -- Check explicit whitelist override (allowed_users, allowed_roles, allowed_teams)
  SELECT allow_opposite_gender, cross_team_access, allowed_users, allowed_roles, allowed_teams
    INTO allow_opposite_a, access_a, allowed_users_a, allowed_roles_a, allowed_teams_a
    FROM public.chat_permissions WHERE user_id = user_a;
  SELECT role, gender INTO role_b, gender_b FROM public.users WHERE id = user_b;
  -- Check allowed_users
  IF user_b = ANY(COALESCE(allowed_users_a, '{}')) THEN
    RETURN true;
  END IF;
  -- Check allowed_roles
  IF role_b = ANY(COALESCE(allowed_roles_a, '{}')) THEN
    RETURN true;
  END IF;
  -- Check allowed_teams
  IF EXISTS (
    SELECT 1 FROM public.user_teams WHERE user_id = user_b AND team_id = ANY(COALESCE(allowed_teams_a, '{}'))
  ) THEN
    RETURN true;
  END IF;
  -- Get gender of A
  SELECT gender INTO gender_a FROM public.users WHERE id = user_a;
  -- Get opposing gender check for B
  SELECT allow_opposite_gender INTO allow_opposite_b 
    FROM public.chat_permissions WHERE user_id = user_b;
  -- Opposing gender checks
  IF gender_a IS NOT NULL AND gender_b IS NOT NULL AND gender_a <> gender_b THEN
    IF COALESCE(allow_opposite_a, false) = false OR COALESCE(allow_opposite_b, false) = false THEN
      RETURN false;
    END IF;
  END IF;
  -- Treat global roles (caoh, oh, fin, admin) as having global cross-team access
  IF role_a IN ('caoh', 'oh', 'fin', 'admin') THEN
    access_a := 'global';
  END IF;
  -- Cross-team rules
  IF COALESCE(access_a, 'none') = 'global' THEN
    RETURN true;
  END IF;
  -- Default 'none' / 'team': Must share a team
  RETURN EXISTS (
    SELECT 1 FROM public.user_teams ut1
    JOIN public.user_teams ut2 ON ut1.team_id = ut2.team_id
    WHERE ut1.user_id = user_a AND ut2.user_id = user_b
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.cancel_reconciliation_adjustment_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req approval_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM approval_requests
  WHERE id = p_request_id AND is_deleted = false;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_req.request_type <> 'reconciliation_adjustment' THEN
    RETURN;
  END IF;

  IF v_req.created_by IS DISTINCT FROM auth.uid()
     AND NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Only the requester can cancel this request';
  END IF;

  UPDATE reconciliation_lines rl
  SET adjustment_status = NULL
  FROM approval_request_reconciliation_lines arl
  WHERE arl.request_id = p_request_id
    AND arl.reconciliation_line_id = rl.id
    AND rl.adjustment_status = 'pending';
END;
$function$
;
CREATE OR REPLACE FUNCTION public.check_team_membership(team_id_to_check uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.team_id = team_id_to_check 
    AND u.id = auth.uid()
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.clear_ok_messages_for_action(p_action_id text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  IF coalesce(trim(p_action_id), '') = '' THEN
    RETURN 0;
  END IF;

  DELETE FROM public.ok_messages
  WHERE action_id = trim(p_action_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_expense_with_items(p_expense_data jsonb, p_items_data jsonb[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_expense_id UUID;
    v_item JSONB;
    v_team_id UUID;
    v_user_id UUID;
BEGIN
    v_team_id := (p_expense_data->>'team_id')::UUID;
    v_user_id := (p_expense_data->>'created_by')::UUID;

    IF v_team_id IS NULL THEN
        RAISE EXCEPTION 'team_id is required';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.user_teams 
        WHERE user_id = v_user_id AND team_id = v_team_id
        AND (is_deleted = FALSE OR is_deleted IS NULL)
    ) AND NOT EXISTS (
        SELECT 1 FROM public.users WHERE id = v_user_id AND role IN ('admin', 'caoh', 'ceo')
    ) THEN
        RAISE EXCEPTION 'User does not have access to this team';
    END IF;

    INSERT INTO public.expenses (
        date, item, description, budget_id, bucket_id,
        local_amount, currency, rate, usd_amount, 
        payment_status, vendor_name, receipt_url,
        is_deleted, created_by, team_id, created_at
    ) VALUES (
        (p_expense_data->>'date')::DATE,
        (p_expense_data->>'item')::TEXT,
        (p_expense_data->>'description')::TEXT,
        (p_expense_data->>'budget_id')::UUID,
        (p_expense_data->>'bucket_id')::UUID,
        (p_expense_data->>'local_amount')::DECIMAL,
        (p_expense_data->>'currency')::TEXT,
        (p_expense_data->>'rate')::DECIMAL,
        (p_expense_data->>'usd_amount')::DECIMAL,
        (p_expense_data->>'payment_status')::TEXT,
        (p_expense_data->>'vendor_name')::TEXT,
        (p_expense_data->>'receipt_url')::TEXT,
        FALSE,  -- EXPLICIT is_deleted
        v_user_id,
        v_team_id,
        COALESCE((p_expense_data->>'created_at')::TIMESTAMPTZ, NOW())
    ) RETURNING id INTO v_expense_id;

    FOREACH v_item IN ARRAY p_items_data
    LOOP
        INSERT INTO public.expense_items (
            expense_id, description, category_id, quantity, unit, rate, total, is_deleted, created_at
        ) VALUES (
            v_expense_id,
            (v_item->>'description')::TEXT,
            (v_item->>'category_id')::UUID,
            COALESCE((v_item->>'quantity')::DECIMAL, 1),
            COALESCE((v_item->>'unit')::TEXT, 'each'),
            (v_item->>'rate')::DECIMAL,
            (v_item->>'total')::DECIMAL,
            FALSE,  -- EXPLICIT is_deleted
            NOW()
        );
    END LOOP;

    RETURN v_expense_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_approval_requests_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_role text;
  v_is_admin boolean := false;
  v_flow_id uuid;
  v_cao_step_order integer;
  v_user_highest_step_order integer;
  v_expected_next_step_order integer;
  v_expected_next_role_code text;
  v_expected_next_is_approved boolean;
  v_step record;
  v_is_already_approved boolean;
BEGIN
  -- Resolve authenticated user's role
  SELECT role INTO v_user_role FROM public.users WHERE id = auth.uid();
  v_is_admin := (v_user_role = 'admin');

  -- Resolve active flow ID
  SELECT f.id INTO v_flow_id
  FROM public.approval_flow_definitions f
  WHERE f.request_type = OLD.request_type
    AND (f.team_id IS NULL OR f.team_id = OLD.team_id)
    AND f.is_active = true
  ORDER BY (f.team_id IS NOT NULL) DESC, f.priority DESC
  LIMIT 1;

  -- Find the step order of the CAO step
  SELECT step_order INTO v_cao_step_order
  FROM public.approval_flow_steps
  WHERE flow_id = v_flow_id AND upper(role_code) = 'CAO'
  LIMIT 1;

  -- Bypass all restrictions for system administrators (emergency override)
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- ── IMMUTABLE FIELDS (All non-admins) ──────────────────────────────────────
  IF OLD.id IS DISTINCT FROM NEW.id OR
     OLD.request_number IS DISTINCT FROM NEW.request_number OR
     OLD.request_type IS DISTINCT FROM NEW.request_type OR
     OLD.created_by IS DISTINCT FROM NEW.created_by OR
     OLD.team_id IS DISTINCT FROM NEW.team_id OR
     OLD.budget_plan_id IS DISTINCT FROM NEW.budget_plan_id OR
     OLD.transfer_id IS DISTINCT FROM NEW.transfer_id OR
     OLD.reconciliation_submission_id IS DISTINCT FROM NEW.reconciliation_submission_id THEN
    RAISE EXCEPTION 'Immutable fields cannot be modified';
  END IF;

  -- ── WORKFLOW STATE MACHINE VALIDATION ──────────────────────────────────────
  
  -- Prevent modifications to completed/terminal requests
  IF OLD.status IN ('PAID', 'RECEIVED', 'APPROVED', 'REJECTED') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Request is already in a terminal state (%) and cannot be updated', OLD.status;
  END IF;

  -- Case A: Creator is performing the update
  IF OLD.created_by = auth.uid() THEN
    -- Find active flow definition
    SELECT f.id INTO v_flow_id
    FROM public.approval_flow_definitions f
    WHERE f.request_type = OLD.request_type
      AND (f.team_id IS NULL OR f.team_id = OLD.team_id)
      AND f.is_active = true
    ORDER BY (f.team_id IS NOT NULL) DESC, f.priority DESC
    LIMIT 1;

    -- Submission transition: DRAFT -> SUBMITTED (or auto-approved state)
    IF OLD.status = 'DRAFT' AND NEW.status IS DISTINCT FROM 'DRAFT' THEN
      -- Standard next unsatisfied step lookup
      v_expected_next_is_approved := true;
      FOR v_step IN 
        SELECT s.step_order, s.role_code
        FROM public.approval_flow_steps s
        WHERE s.flow_id = v_flow_id
        ORDER BY s.step_order ASC
      LOOP
        IF NOT public.user_has_approval_role(OLD.created_by, v_step.role_code, OLD.team_id) THEN
          v_expected_next_step_order := v_step.step_order;
          v_expected_next_role_code := v_step.role_code;
          v_expected_next_is_approved := false;
          EXIT;
        END IF;
      END LOOP;
      
      IF v_expected_next_is_approved THEN
        -- Auto-approved scenario
        IF NEW.status NOT LIKE '%-APPROVED' OR NEW.completed_at IS NULL THEN
          RAISE EXCEPTION 'Auto-approved transition requires status to be approved and completed_at to be populated';
        END IF;
      ELSE
        -- Standard submission
        IF NEW.status IS DISTINCT FROM 'SUBMITTED' OR
           NEW.current_step_order IS DISTINCT FROM v_expected_next_step_order OR
           NEW.current_role_code IS DISTINCT FROM v_expected_next_role_code OR
           NEW.completed_at IS NOT NULL OR
           NEW.step_approved = true THEN
          RAISE EXCEPTION 'Invalid initial workflow step. Expected step %, role %', v_expected_next_step_order, v_expected_next_role_code;
        END IF;
      END IF;
      RETURN NEW;
    END IF;

    -- Local edits inside DRAFT status
    IF OLD.status = 'DRAFT' AND NEW.status = 'DRAFT' THEN
      -- Creator cannot pre-set workflow columns during DRAFT updates
      IF NEW.current_step_order IS NOT NULL OR
         NEW.current_role_code IS NOT NULL OR
         NEW.step_approved = true OR
         NEW.completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Workflow columns must remain null/default in DRAFT status';
      END IF;
      RETURN NEW;
    END IF;

    -- If request is active (non-DRAFT), creator can only Cancel or Resubmit replies
    IF NEW.status = 'DRAFT' THEN
      -- Cancellation: verify it resets workflow fields cleanly
      IF NEW.current_step_order IS NOT NULL OR NEW.current_role_code IS NOT NULL OR NEW.step_approved = true OR NEW.completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cancelling a request must reset workflow step fields to null/default';
      END IF;
      -- Block changing business details during cancellation
      IF OLD.amount_usd IS DISTINCT FROM NEW.amount_usd OR OLD.title IS DISTINCT FROM NEW.title THEN
        RAISE EXCEPTION 'Cannot modify title or amount_usd during request cancellation';
      END IF;
      RETURN NEW;
    ELSIF OLD.status LIKE 'CLARIFY-%' AND NEW.status = 'SUBMITTED' THEN
      -- Reply to clarification
      IF OLD.amount_usd IS DISTINCT FROM NEW.amount_usd OR OLD.title IS DISTINCT FROM NEW.title THEN
        RAISE EXCEPTION 'Cannot modify title or amount_usd during clarification reply';
      END IF;
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Creators cannot modify active workflow requests (current status: %)', OLD.status;
    END IF;
  END IF;

  -- Case B: Approver / Reviewer is performing the update
  -- Must have permission for the current step order/role
  IF NOT public.user_can_act_on_approval_request(OLD.id) THEN
    RAISE EXCEPTION 'You are not authorized to act on this request at the current step (%)', OLD.status;
  END IF;

  -- Ensure the approver has not already approved this request at a previous step (only for pre-CAO and CAO steps)
  IF OLD.current_step_order <= coalesce(v_cao_step_order, 99) THEN
    IF EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.metadata->>'link_id' = OLD.id::text
        AND m.sender_id = auth.uid()
        AND (m.body LIKE '%[Approval System] Approved%' OR m.body LIKE '%Approved and sent forward%')
    ) THEN
      RAISE EXCEPTION 'You have already approved this request and cannot approve it again';
    END IF;
  END IF;

  -- Approvers may only change workflow columns
  IF OLD.title IS DISTINCT FROM NEW.title OR
     OLD.amount_usd IS DISTINCT FROM NEW.amount_usd OR
     OLD.is_deleted IS DISTINCT FROM NEW.is_deleted THEN
    RAISE EXCEPTION 'Approvers are not permitted to modify request details (title, amount_usd, is_deleted)';
  END IF;

  -- Validate transition correctness (prevent skips)
  -- 1. Advancing the step
  IF NEW.current_step_order IS DISTINCT FROM OLD.current_step_order OR NEW.current_role_code IS DISTINCT FROM OLD.current_role_code OR NEW.status IS DISTINCT FROM OLD.status THEN
    
    -- Rejection / Clarification transitions are allowed to deviate from sequential steps
    IF NEW.status = 'REJECTED' OR NEW.status = 'CLARIFY-OPL' THEN
      RETURN NEW;
    END IF;



    -- If user has the current step's role code, they are approving normally (no skip-level)
    IF public.user_has_approval_role(auth.uid(), OLD.current_role_code, OLD.team_id) THEN
      v_user_highest_step_order := OLD.current_step_order;
    ELSE
      -- Find the highest step order in this flow that the user has approval role for (skip-level/emergency)
      SELECT max(s.step_order) INTO v_user_highest_step_order
      FROM public.approval_flow_steps s
      WHERE s.flow_id = v_flow_id
        AND public.user_has_approval_role(auth.uid(), s.role_code, OLD.team_id)
        AND (
          v_is_admin 
          OR public.user_has_approval_role(auth.uid(), 'CAO', OLD.team_id)
          OR public.user_has_approval_role(auth.uid(), 'CEO', OLD.team_id)
          OR s.step_order < v_cao_step_order
        );

      -- If no higher step matches, fallback to the request's current step order
      IF v_user_highest_step_order IS NULL THEN
        v_user_highest_step_order := OLD.current_step_order;
      END IF;
    END IF;

    -- Resolve the next unsatisfied step order (skipping steps that have already been approved by a user with that role)
    v_expected_next_is_approved := true;
    FOR v_step IN
      SELECT s.step_order, s.role_code
      FROM public.approval_flow_steps s
      WHERE s.flow_id = v_flow_id
        AND s.step_order > v_user_highest_step_order
      ORDER BY s.step_order ASC
    LOOP
      v_is_already_approved := false;
      
      -- Auto-satisfy only approval steps (<= CAO)
      IF v_cao_step_order IS NULL OR v_step.step_order <= v_cao_step_order THEN
        IF public.user_has_approval_role(auth.uid(), v_step.role_code, OLD.team_id) OR EXISTS (
          SELECT 1 FROM public.messages m
          WHERE m.metadata->>'link_id' = OLD.id::text
            AND (m.body LIKE '%[Approval System] Approved%' OR m.body LIKE '%Approved and sent forward%')
            AND public.user_has_approval_role(m.sender_id, v_step.role_code, OLD.team_id)
        ) THEN
          v_is_already_approved := true;
        END IF;
      END IF;

      IF NOT v_is_already_approved THEN
        v_expected_next_step_order := v_step.step_order;
        v_expected_next_role_code := v_step.role_code;
        v_expected_next_is_approved := false;
        EXIT;
      END IF;
    END LOOP;
    
    IF v_expected_next_is_approved THEN
      -- Terminal approval transition
      IF NEW.status NOT LIKE '%-APPROVED' AND NEW.status NOT IN ('PAID', 'RECEIVED') THEN
        RAISE EXCEPTION 'Invalid final status for request completion';
      END IF;
      IF NEW.completed_at IS NULL THEN
        RAISE EXCEPTION 'completed_at must be set upon final approval';
      END IF;
    ELSE
      -- Progression validation: both target order and role code must match the first unsatisfied step
      IF NEW.current_step_order IS DISTINCT FROM v_expected_next_step_order OR
         NEW.current_role_code IS DISTINCT FROM v_expected_next_role_code OR
         (NEW.status NOT LIKE '%-REVIEWED' AND NEW.status IS DISTINCT FROM 'SUBMITTED') THEN
        RAISE EXCEPTION 'Workflow step skip detected. Expected next step %, role % (Actual step %, role %, status %)', 
          v_expected_next_step_order, v_expected_next_role_code,
          NEW.current_step_order, NEW.current_role_code, NEW.status;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_budget_plans_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_role text;
  v_is_admin boolean := false;
  v_sum_usd numeric := 0;
  v_cat jsonb;
  v_req record;
BEGIN
  SELECT role INTO v_user_role FROM public.users WHERE id = auth.uid();
  v_is_admin := (v_user_role = 'admin');

  -- Verify total_amount matches sum of categories USD amounts
  IF NEW.categories IS NOT NULL THEN
    FOR v_cat IN SELECT * FROM jsonb_array_elements(NEW.categories) LOOP
      v_sum_usd := v_sum_usd + COALESCE((v_cat->>'usdAmount')::numeric, (v_cat->>'usd_amount')::numeric, 0);
    END LOOP;
    IF ABS(NEW.total_amount - v_sum_usd) > 0.02 THEN
      RAISE EXCEPTION 'Total budget amount (%) does not match the sum of category line items (%)', NEW.total_amount, v_sum_usd;
    END IF;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status OR
     NEW.paid_amount IS DISTINCT FROM OLD.paid_amount OR
     NEW.approved_amount IS DISTINCT FROM OLD.approved_amount OR
     NEW.funding_notes IS DISTINCT FROM OLD.funding_notes THEN

    IF NOT v_is_admin THEN
      SELECT * INTO v_req FROM public.approval_requests
      WHERE budget_plan_id = NEW.id AND is_deleted = false
      ORDER BY created_at DESC LIMIT 1;

      -- 1. approval_status validation (same rules as migration 070)
      IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
        IF NEW.approval_status = 'SUBMITTED' AND OLD.approval_status IN ('DRAFT', 'REJECTED', 'CLARIFY-OPL') THEN
          IF v_req IS NULL OR v_req.status IS DISTINCT FROM 'SUBMITTED' THEN
            SELECT * INTO v_req FROM public.approval_requests
            WHERE budget_plan_id = NEW.id AND is_deleted = false AND created_at >= now() - interval '2 seconds'
            ORDER BY created_at DESC LIMIT 1;
            IF v_req IS NULL THEN
              RAISE EXCEPTION 'Cannot submit budget plan without an active approval request.';
            END IF;
          END IF;
        ELSIF NEW.approval_status = 'DRAFT' THEN
          IF v_req IS NOT NULL AND v_req.status NOT IN ('REJECTED', 'CANCELLED', 'DRAFT') THEN
            RAISE EXCEPTION 'Cannot reset budget to DRAFT unless the workflow request is rejected or cancelled.';
          END IF;
        ELSE
          IF v_req IS NULL THEN
            RAISE EXCEPTION 'No active approval request found for this budget plan.';
          END IF;
          IF NEW.approval_status IS DISTINCT FROM v_req.status THEN
            RAISE EXCEPTION 'Direct approval status modification is forbidden. Status must be updated through the approval workflow.';
          END IF;
        END IF;
      END IF;

      -- 2. approved_amount: only the FIH final-approval step may set it
      IF NEW.approved_amount IS DISTINCT FROM OLD.approved_amount THEN
        IF v_req IS NULL THEN
          RAISE EXCEPTION 'Cannot record approved amount: No approval request found.';
        END IF;
        IF NOT (
          public.user_can_act_on_approval_request(v_req.id)
          AND upper(coalesce(v_req.current_role_code, '')) IN ('FIH', 'FIP')
        ) THEN
          RAISE EXCEPTION 'Unauthorized to set the approved amount for this budget.';
        END IF;
      END IF;

      -- 3. paid_amount / funding_notes: payment roles, either acting at the
      --    current step OR recording a payment against a COMPLETED
      --    (FIH-APPROVED) request via the Transfer Funds payment module.
      IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount OR
         NEW.funding_notes IS DISTINCT FROM OLD.funding_notes THEN
        IF v_req IS NULL THEN
          RAISE EXCEPTION 'Cannot record payment details: No approval request found.';
        END IF;
        IF NOT (
          (
            public.user_can_act_on_approval_request(v_req.id)
            AND upper(coalesce(v_req.current_role_code, '')) IN ('FIP', 'FIH')
          )
          OR
          (
            upper(coalesce(v_req.status, '')) LIKE '%-APPROVED'
            AND (
              public.user_has_approval_role(auth.uid(), 'FIH', v_req.team_id)
              OR public.user_has_approval_role(auth.uid(), 'FIP', v_req.team_id)
            )
          )
        ) THEN
          RAISE EXCEPTION 'Unauthorized to modify payment details for this request.';
        END IF;
      END IF;
    END IF;
  END IF;

  -- If status is NOT Draft/Rejected/Clarify, lock financial and calendar details
  IF OLD.approval_status IS NOT NULL AND OLD.approval_status NOT IN ('DRAFT', 'REJECTED', 'CLARIFY-OPL') THEN
    IF OLD.categories IS DISTINCT FROM NEW.categories OR
       OLD.total_amount IS DISTINCT FROM NEW.total_amount OR
       OLD.name IS DISTINCT FROM NEW.name OR
       OLD.team_id IS DISTINCT FROM NEW.team_id OR
       OLD.budget_type IS DISTINCT FROM NEW.budget_type OR
       OLD.calendar_entry_id IS DISTINCT FROM NEW.calendar_entry_id OR
       OLD.budget_period_date IS DISTINCT FROM NEW.budget_period_date THEN
      RAISE EXCEPTION 'Budget is currently locked under workflow status (%) and cannot be modified', OLD.approval_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.generate_next_task_number(p_team_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_prefix TEXT;
  v_max_num INT;
  v_next_num INT;
BEGIN
  SELECT prefix INTO v_prefix FROM public.teams WHERE id = p_team_id;
  IF v_prefix IS NULL OR v_prefix = '' THEN
    v_prefix := 'TSK';
  END IF;
  SELECT COALESCE(MAX(
    CASE 
      WHEN split_part(task_number, '-', 2) ~ '^[0-9]+$' 
      THEN split_part(task_number, '-', 2)::INT 
      ELSE 0 
    END
  ), 100000) INTO v_max_num
  FROM public.tasks
  WHERE task_number ILIKE v_prefix || '-%';
  v_next_num := v_max_num + 1;
  IF v_next_num < 100001 THEN
    v_next_num := 100001;
  END IF;
  RETURN v_prefix || '-' || v_next_num::TEXT;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_accessible_teams(p_user_id uuid)
 RETURNS TABLE(team_id uuid, access_level text, team_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    -- Direct team memberships
    SELECT t.id, ut.access_level, t.name
    FROM user_teams ut
    JOIN teams t ON t.id = ut.team_id
    WHERE ut.user_id = p_user_id AND t.is_active = true

    UNION

    -- Teams inherited from group membership (OH role)
    SELECT t.id, 'oh'::text, t.name
    FROM user_groups ug
    JOIN team_group_members tgm ON tgm.group_id = ug.group_id
    JOIN teams t ON t.id = tgm.team_id
    WHERE ug.user_id = p_user_id AND ug.role_in_group = 'oh' AND t.is_active = true

    UNION

    -- Teams inherited from group membership (viewer role)
    SELECT t.id, 'view'::text, t.name
    FROM user_groups ug
    JOIN team_group_members tgm ON tgm.group_id = ug.group_id
    JOIN teams t ON t.id = tgm.team_id
    WHERE ug.user_id = p_user_id AND ug.role_in_group = 'viewer' AND t.is_active = true

    UNION

    -- CEO/CAOH sees all teams (override)
    SELECT t.id, 'admin'::text, t.name
    FROM teams t
    JOIN users u ON u.id = p_user_id
    WHERE u.role IN ('ceo','caoh','admin') AND t.is_active = true;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_budget_plan_for_review(p_budget_plan_id uuid)
 RETURNS SETOF budget_plans
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_budget_plan_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.approval_requests ar
    WHERE ar.budget_plan_id = p_budget_plan_id
      AND ar.is_deleted = false
      AND (
        ar.created_by = auth.uid()
        OR public.is_org_admin()
        OR (
          ar.current_role_code IS NOT NULL
          AND public.user_has_approval_role(auth.uid(), ar.current_role_code, ar.team_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.request_role_assignments rra
          WHERE rra.user_id = auth.uid()
            AND rra.is_active = true
            AND (rra.team_id IS NULL OR rra.team_id = ar.team_id)
        )
        OR ar.team_id IN (
          SELECT ut.team_id FROM public.user_teams ut WHERE ut.user_id = auth.uid()
        )
      )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.budget_plans bp
  WHERE bp.id = p_budget_plan_id
    AND COALESCE(bp.is_deleted, false) = false;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_next_active_workflow_step(p_request_type text, p_team_id uuid, p_creator_id uuid, p_current_step_order integer)
 RETURNS TABLE(step_order integer, role_code text, is_approved boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_flow_id uuid;
  v_step record;
  v_found boolean := false;
  v_creator_has_role boolean;
BEGIN
  -- Find active flow definition
  SELECT f.id INTO v_flow_id
  FROM public.approval_flow_definitions f
  WHERE f.request_type = p_request_type
    AND (f.team_id IS NULL OR f.team_id = p_team_id)
    AND f.is_active = true
  ORDER BY (f.team_id IS NOT NULL) DESC, f.priority DESC
  LIMIT 1;

  IF v_flow_id IS NULL THEN
    RETURN;
  END IF;

  -- Find next step in flow steps order
  FOR v_step IN 
    SELECT s.step_order, s.role_code
    FROM public.approval_flow_steps s
    WHERE s.flow_id = v_flow_id
      AND (p_current_step_order IS NULL OR s.step_order > p_current_step_order)
    ORDER BY s.step_order ASC
  LOOP
    -- Check if creator has the role code (segregation of duties)
    v_creator_has_role := public.user_has_approval_role(p_creator_id, v_step.role_code, p_team_id);
    IF NOT v_creator_has_role THEN
      step_order := v_step.step_order;
      role_code := v_step.role_code;
      is_approved := false;
      v_found := true;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  -- If no steps remain, it is auto-approved
  IF NOT v_found THEN
    step_order := NULL;
    role_code := NULL;
    is_approved := true;
    RETURN NEXT;
  END IF;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_parent_teams_recursive(p_team_id uuid)
 RETURNS TABLE(team_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH RECURSIVE parent_teams AS (
    SELECT parent_id AS id
    FROM public.team_relationships
    WHERE child_id = p_team_id
    UNION
    SELECT r.parent_id
    FROM public.team_relationships r
    JOIN parent_teams pt ON r.child_id = pt.id
  )
  SELECT id FROM parent_teams;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_pending_budget_payment_list(p_team_id uuid)
 RETURNS TABLE(transfer_id uuid, transfer_date date, amount_usd numeric, budget_id uuid, budget_name text, budget_type text, payer text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.id,
    t.date,
    COALESCE(t.dest_amount, t.amount, 0),
    bp.id,
    bp.name,
    bp.budget_type,
    COALESCE(ptm.name, 'KMOF / Finance'),
    t.created_at
  FROM public.transfers t
  LEFT JOIN public.budget_plans bp ON bp.id = t.linked_budget_id
  LEFT JOIN public.teams ptm ON ptm.id = t.team_id
  WHERE t.dest_team_id = p_team_id
    AND t.status = 'PENDING'
    AND t.is_deleted = false
    AND t.flow_type IN ('org_to_team', 'oph_to_team')
    AND t.linked_budget_id IS NOT NULL
  ORDER BY t.created_at ASC;
$function$
;
CREATE OR REPLACE FUNCTION public.get_pending_budget_transfers(p_team_id uuid)
 RETURNS TABLE(linked_budget_id uuid, pending_usd numeric, transfer_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.linked_budget_id,
    SUM(COALESCE(t.dest_amount, t.amount, 0)) AS pending_usd,
    COUNT(*)::bigint AS transfer_count
  FROM public.transfers t
  WHERE t.dest_team_id = p_team_id
    AND t.status = 'PENDING'
    AND t.is_deleted = false
    AND t.flow_type IN ('org_to_team', 'oph_to_team')
    AND t.linked_budget_id IS NOT NULL
  GROUP BY t.linked_budget_id;
$function$
;
CREATE OR REPLACE FUNCTION public.get_sub_teams_recursive(p_team_id uuid)
 RETURNS TABLE(team_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH RECURSIVE sub_teams AS (
    SELECT child_id AS id
    FROM public.team_relationships
    WHERE parent_id = p_team_id
    UNION
    SELECT r.child_id
    FROM public.team_relationships r
    JOIN sub_teams st ON r.parent_id = st.id
  )
  SELECT id FROM sub_teams;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_transfer_for_review(p_transfer_id uuid)
 RETURNS SETOF transfers
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_transfer_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.approval_requests ar
    WHERE ar.transfer_id = p_transfer_id
      AND ar.is_deleted = false
      AND (
        ar.created_by = auth.uid()
        OR public.is_org_admin()
        OR (
          ar.current_role_code IS NOT NULL
          AND public.user_has_approval_role(auth.uid(), ar.current_role_code, ar.team_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.request_role_assignments rra
          WHERE rra.user_id = auth.uid()
            AND rra.is_active = true
            AND (rra.team_id IS NULL OR rra.team_id = ar.team_id)
        )
        OR ar.team_id IN (
          SELECT ut.team_id FROM public.user_teams ut WHERE ut.user_id = auth.uid()
        )
      )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.transfers t
  WHERE t.id = p_transfer_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_user_team_id(p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  primary_team_id uuid;
BEGIN
  -- First check user_teams for primary team
  SELECT team_id INTO primary_team_id
  FROM user_teams
  WHERE user_id = p_user_id AND is_primary = true
  LIMIT 1;
  
  -- If no primary team in user_teams, fall back to users.team_id
  IF primary_team_id IS NULL THEN
    SELECT team_id INTO primary_team_id
    FROM users
    WHERE id = p_user_id;
  END IF;
  
  RETURN primary_team_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_user_teams(p_user_id uuid)
 RETURNS TABLE(team_id uuid, team_name text, is_primary boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    COALESCE(ut.is_primary, false)
  FROM teams t
  LEFT JOIN user_teams ut ON t.id = ut.team_id AND ut.user_id = p_user_id
  WHERE ut.user_id = p_user_id 
     OR t.id = (SELECT u.team_id FROM users u WHERE u.id = p_user_id);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_income_balance_impact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.balance_impact = true AND COALESCE(NEW.is_deleted, false) = false AND NEW.bucket_id IS NOT NULL THEN
      UPDATE public.buckets
      SET balance = COALESCE(balance, 0) + NEW.local_amount,
          updated_at = now()
      WHERE id = NEW.bucket_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Subtract old amount from old bucket
    IF OLD.balance_impact = true AND COALESCE(OLD.is_deleted, false) = false AND OLD.bucket_id IS NOT NULL THEN
      UPDATE public.buckets
      SET balance = COALESCE(balance, 0) - OLD.local_amount,
          updated_at = now()
      WHERE id = OLD.bucket_id;
    END IF;
    -- Add new amount to new bucket
    IF NEW.balance_impact = true AND COALESCE(NEW.is_deleted, false) = false AND NEW.bucket_id IS NOT NULL THEN
      UPDATE public.buckets
      SET balance = COALESCE(balance, 0) + NEW.local_amount,
          updated_at = now()
      WHERE id = NEW.bucket_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.balance_impact = true AND COALESCE(OLD.is_deleted, false) = false AND OLD.bucket_id IS NOT NULL THEN
      UPDATE public.buckets
      SET balance = COALESCE(balance, 0) - OLD.local_amount,
          updated_at = now()
      WHERE id = OLD.bucket_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.users (id, email, name, role, on_hold)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email, 'user'), '@', 1)),
    'user',
    false
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = COALESCE(NULLIF(EXCLUDED.name, ''), public.users.name);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.insert_budget_payment_transfer(p_id uuid, p_team_id uuid, p_dest_team_id uuid, p_date date, p_from_bucket_id uuid, p_to_bucket_id uuid, p_amount numeric, p_rate numeric, p_currency text, p_dest_amount numeric, p_dest_currency text, p_description text, p_receiver_user_id uuid, p_linked_budget_id uuid, p_attachment_url text, p_attachment_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_authorized boolean;
  v_row transfers%ROWTYPE;
BEGIN
  -- Only finance/payment/org-admin roles may create payment transfers
  SELECT (
    public.is_org_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('fih','fip','fin','cao','caoh','oh','ceo','admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.app_role_assignments a
      WHERE a.user_id = auth.uid()
        AND a.app_code IN ('finance','ok')
        AND a.team_id IS NULL
    )
  ) INTO v_authorized;

  IF NOT coalesce(v_authorized, false) THEN
    RAISE EXCEPTION 'Unauthorized: finance payment access required to create a payment transfer';
  END IF;

  INSERT INTO public.transfers (
    id, team_id, dest_team_id, date, from_bucket_id, to_bucket_id,
    amount, rate, currency, dest_amount, dest_currency, description,
    status, flow_type, receiver_user_id, receiver_kind, pending_step,
    linked_budget_id, attachment_url, attachment_name,
    created_by, created_at, is_deleted
  ) VALUES (
    p_id, p_team_id, p_dest_team_id, p_date, p_from_bucket_id, p_to_bucket_id,
    p_amount, coalesce(p_rate, 1), p_currency, p_dest_amount, p_dest_currency, p_description,
    'PENDING', 'org_to_team', p_receiver_user_id, 'otl', 'receiver',
    p_linked_budget_id, p_attachment_url, p_attachment_name,
    auth.uid(), now(), false
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN COALESCE(
    (SELECT role = 'admin' FROM public.users WHERE id = p_user_id),
    false
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_lead(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN COALESCE(
    (SELECT role = 'lead' FROM public.users WHERE id = p_user_id),
    false
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_ok_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.ok_admins a
    WHERE a.user_id = auth.uid()
  );
$function$
;
CREATE OR REPLACE FUNCTION public.is_org_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.is_team_roster_manager(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  SELECT
    public.is_org_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_teams ut
      WHERE ut.team_id = p_team_id
        AND ut.user_id = auth.uid()
        AND lower(trim(ut.access_level)) = 'oht'
    )
    OR EXISTS (
      SELECT 1
      FROM public.teams t
      WHERE t.id = p_team_id
        AND t.created_by_oht_user_id = auth.uid()
    );
$function$
;
CREATE OR REPLACE FUNCTION public.log_audit(p_user_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_old_values jsonb, p_new_values jsonb, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
    VALUES (p_user_id, p_action, p_entity_type, p_entity_id, p_old_values, p_new_values, p_ip_address, p_user_agent);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_audit(p_user_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_old_values jsonb, p_new_values jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (p_user_id, p_action, p_entity_type, p_entity_id, p_old_values, p_new_values);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_status text;
begin
  -- Check if this record was already submitted (not a draft)
  if TG_OP = 'UPDATE' then
    v_status := coalesce(old.status, 'submitted');
    if v_status = 'draft' then
      return new;
    end if;
    insert into audit_log(table_name, record_id, operation, changed_by, old_values, new_values)
    values (TG_TABLE_NAME, old.id, TG_OP, auth.uid(), to_jsonb(old), to_jsonb(new));
  elsif TG_OP = 'DELETE' then
    v_status := coalesce(old.status, 'submitted');
    if v_status = 'draft' then
      return old;
    end if;
    insert into audit_log(table_name, record_id, operation, changed_by, old_values, new_values)
    values (TG_TABLE_NAME, old.id, TG_OP, auth.uid(), to_jsonb(old), null);
  end if;
  return coalesce(new, old);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.mark_reconciliation_adjustment_pending(p_line_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_line_ids IS NULL OR array_length(p_line_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  UPDATE reconciliation_lines rl
  SET adjustment_status = 'pending'
  FROM reconciliation_submissions rs
  WHERE rl.id = ANY(p_line_ids)
    AND rs.id = rl.submission_id
    AND rs.is_deleted = false
    AND rs.team_id IN (SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_teams ut
      WHERE ut.user_id = auth.uid()
        AND ut.team_id = rs.team_id
        AND lower(trim(ut.access_level)) NOT IN ('view', 'oht')
    )
    AND abs(COALESCE(rl.difference, 0)) >= 0.01
    AND COALESCE(lower(trim(rl.adjustment_status)), '') NOT IN ('pending', 'approved');
END;
$function$
;
CREATE OR REPLACE FUNCTION public.notify_approval_actors(p_team_id uuid, p_role_code text, p_title text, p_body text, p_exclude_user_id uuid DEFAULT NULL::uuid, p_action_page text DEFAULT 'approval-portal'::text, p_action_id text DEFAULT NULL::text, p_category text DEFAULT 'other'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  IF coalesce(trim(p_title), '') = '' THEN
    RETURN 0;
  END IF;

  INSERT INTO public.ok_messages (user_id, team_id, title, body, action_page, action_id, category)
  SELECT
    u.user_id,
    p_team_id,
    left(trim(p_title), 200),
    coalesce(p_body, ''),
    nullif(trim(p_action_page), ''),
    nullif(trim(p_action_id), ''),
    nullif(trim(coalesce(p_category, 'other')), '')
  FROM public.users_with_approval_role(p_role_code, p_team_id) u
  WHERE p_exclude_user_id IS NULL OR u.user_id <> p_exclude_user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.notify_ok_user(p_user_id uuid, p_title text, p_body text, p_team_id uuid DEFAULT NULL::uuid, p_action_page text DEFAULT 'approval-portal'::text, p_action_id text DEFAULT NULL::text, p_category text DEFAULT 'other'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_user_id IS NULL OR coalesce(trim(p_title), '') = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.ok_messages (user_id, team_id, title, body, action_page, action_id, category)
  VALUES (
    p_user_id,
    p_team_id,
    left(trim(p_title), 200),
    coalesce(p_body, ''),
    nullif(trim(p_action_page), ''),
    nullif(trim(p_action_id), ''),
    nullif(trim(coalesce(p_category, 'other')), '')
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.prune_stale_ok_approval_messages(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.ok_messages m
  WHERE m.user_id = v_uid
    AND m.action_id IS NOT NULL
    AND coalesce(m.action_page, '') IN ('approval-portal', '')
    AND (
      -- Request gone / deleted
      NOT EXISTS (
        SELECT 1 FROM public.approval_requests ar
        WHERE ar.id::text = m.action_id
          AND ar.is_deleted = false
      )
      OR EXISTS (
        SELECT 1 FROM public.approval_requests ar
        WHERE ar.id::text = m.action_id
          AND ar.is_deleted = false
          AND ar.current_role_code IS NOT NULL
          AND ar.status <> 'REJECTED'
          AND ar.status NOT LIKE '%-APPROVED'
          -- Still open but waiting on someone else (not this user)
          AND NOT public.user_has_approval_role(v_uid, ar.current_role_code, ar.team_id)
          AND ar.created_by <> v_uid
      )
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.reject_reconciliation_adjustment_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req approval_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM approval_requests
  WHERE id = p_request_id AND is_deleted = false;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_req.request_type <> 'reconciliation_adjustment' THEN
    RETURN;
  END IF;

  UPDATE reconciliation_lines rl
  SET adjustment_status = 'rejected'
  FROM approval_request_reconciliation_lines arl
  WHERE arl.request_id = p_request_id
    AND arl.reconciliation_line_id = rl.id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_next_task_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_team_prefix TEXT;
  v_next_num INTEGER;
BEGIN
  -- Get team prefix (slice first 3 chars of name, uppercase)
  SELECT COALESCE(UPPER(SUBSTRING(name FROM 1 FOR 3)), 'TSK')
  INTO v_team_prefix
  FROM public.teams
  WHERE id = NEW.team_id;
  -- Find the max numeric suffix for this team_id from all tasks in the table (bypassing RLS)
  SELECT COALESCE(MAX(CAST(SUBSTRING(task_number FROM '[0-9]+') AS INTEGER)), 100000)
  INTO v_next_num
  FROM public.tasks
  WHERE team_id = NEW.team_id;
  NEW.task_number := v_team_prefix || '-' || (v_next_num + 1);
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.trg_teams_after_insert_create_bucket()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO buckets (id, name, type, currency, balance, team_id, is_protected, is_system_bucket)
  VALUES (gen_random_uuid(), 'General Funds (Unallocated)', 'bank', 'USD', 0, NEW.id, true, true);
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_bucket_balance_on_expense()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.payment_status = 'paid' and new.bucket_id is not null then
    -- Deduct on new paid expense
    if TG_OP = 'INSERT' then
      update buckets set balance = balance - new.local_amount, updated_at = now()
      where id = new.bucket_id;
    elsif TG_OP = 'UPDATE' then
      -- If bucket changed, restore old bucket and deduct new
      if old.bucket_id is distinct from new.bucket_id then
        if old.bucket_id is not null and old.payment_status = 'paid' then
          update buckets set balance = balance + old.local_amount, updated_at = now()
          where id = old.bucket_id;
        end if;
        update buckets set balance = balance - new.local_amount, updated_at = now()
        where id = new.bucket_id;
      elsif old.local_amount is distinct from new.local_amount then
        -- Amount changed on same bucket
        update buckets set balance = balance + old.local_amount - new.local_amount, updated_at = now()
        where id = new.bucket_id;
      end if;
      -- Credit -> paid transition
      if old.payment_status = 'credit' and new.payment_status = 'paid' and new.bucket_id is not null then
        update buckets set balance = balance - new.local_amount, updated_at = now()
        where id = new.bucket_id;
      end if;
    end if;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.update_bucket_balance_on_fund()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  update buckets set balance = balance + new.amount, updated_at = now()
  where id = new.bucket_id;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.update_bucket_on_income()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Update the bucket balance when income is added
    UPDATE buckets 
    SET balance = balance + NEW.amount_usd, 
        updated_at = now() 
    WHERE id = NEW.bucket_id;
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_buckets_on_transfer()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_from_currency text;
  v_to_currency   text;
  v_rate          numeric(18,6);
begin
  -- Deduct from source, add to destination
  update buckets set balance = balance - new.from_amount, updated_at = now()
  where id = new.from_bucket_id;
  update buckets set balance = balance + new.to_amount, updated_at = now()
  where id = new.to_bucket_id;

  -- Auto-create exchange rate if currencies differ
  select currency into v_from_currency from buckets where id = new.from_bucket_id;
  select currency into v_to_currency   from buckets where id = new.to_bucket_id;

  if v_from_currency is distinct from v_to_currency and new.from_amount > 0 then
    v_rate := new.to_amount / new.from_amount;
    insert into exchange_rates(home_id, home_type, from_currency, to_currency, rate, source, reference, created_by, effective_date)
    values (new.home_id, new.home_type, v_from_currency, v_to_currency, v_rate, 'auto_from_transfer',
            'Auto from transfer ' || new.id::text, new.created_by, new.transfer_date);
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.update_buckets_on_transfer_fn()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_from_curr text;
    v_to_curr text;
    v_converted_amount numeric;
BEGIN
    -- 1. Get currencies
    SELECT currency INTO v_from_curr FROM buckets WHERE id = NEW.from_bucket_id;
    SELECT currency INTO v_to_curr FROM buckets WHERE id = NEW.to_bucket_id;

    -- 2. Logic:
    -- If moving USD to Local: Multiply (e.g., 100 USD * 3.67 = 367 AED)
    -- If moving Local to USD: Divide (e.g., 367 AED / 3.67 = 100 USD)
    -- If same currency: No conversion (Rate is 1)
    
    IF v_from_curr = 'USD' AND v_to_curr <> 'USD' THEN
        v_converted_amount := NEW.amount * NEW.rate;
    ELSIF v_from_curr <> 'USD' AND v_to_curr = 'USD' THEN
        v_converted_amount := NEW.amount / NEW.rate;
    ELSE
        -- Same currency or other cross-currency logic
        v_converted_amount := NEW.amount;
    END IF;

    -- 3. Deduct from source bucket
    UPDATE buckets 
    SET balance = balance - NEW.amount, 
        updated_at = now() 
    WHERE id = NEW.from_bucket_id;

    -- 4. Add to destination bucket
    UPDATE buckets 
    SET balance = balance + v_converted_amount, 
        updated_at = now() 
    WHERE id = NEW.to_bucket_id;

    -- 5. Auto-create/update exchange rate record
    IF v_from_curr <> v_to_curr THEN
        INSERT INTO exchange_rates(
            team_id, from_currency, to_currency, rate, 
            source, reference, created_by, date
        )
        VALUES (
            NEW.team_id, v_from_curr, v_to_curr, NEW.rate, 
            'auto_from_transfer', 'Transfer ID: ' || NEW.id, NEW.created_by, NEW.date
        )
        ON CONFLICT (from_currency, to_currency, date) 
        DO UPDATE SET 
            rate = EXCLUDED.rate,
            updated_at = now();
    END IF;

    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_budget_spent()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if TG_OP in ('INSERT','UPDATE') then
    update budgets b
    set spent_amount = (
      select coalesce(sum(e.base_amount), 0)
      from expenses e
      where e.budget_id = b.id
        and e.payment_status = 'paid'
        and e.status != 'draft'
    ), updated_at = now()
    where b.id = new.budget_id;

    -- Also update category spent
    if new.budget_category_id is not null then
      update budget_categories bc
      set spent_amount = (
        select coalesce(sum(e.base_amount), 0)
        from expenses e
        where e.budget_category_id = bc.id
          and e.payment_status = 'paid'
          and e.status != 'draft'
      )
      where bc.id = new.budget_category_id;
    end if;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.user_can_act_on_approval_request(p_request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req approval_requests%ROWTYPE;
  v_clarify_role text;
  v_org_role text;
BEGIN
  SELECT * INTO v_req FROM approval_requests
  WHERE id = p_request_id AND is_deleted = false;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT role INTO v_org_role FROM users WHERE id = auth.uid();

  -- System admin only may act on any open step
  IF lower(coalesce(v_org_role, '')) = 'admin' THEN
    IF v_req.status = 'REJECTED' OR v_req.status LIKE '%-APPROVED' THEN
      RETURN false;
    END IF;
    IF v_req.created_by = auth.uid() AND v_req.current_role_code IS NOT NULL THEN
      RETURN false;
    END IF;
    RETURN v_req.current_role_code IS NOT NULL OR v_req.status LIKE 'CLARIFY-%';
  END IF;

  IF v_req.status = 'REJECTED' OR v_req.status LIKE '%-APPROVED' THEN
    RETURN false;
  END IF;

  IF v_req.status LIKE 'CLARIFY-%' THEN
    v_clarify_role := substring(v_req.status from 9);
    RETURN public.user_has_approval_role(auth.uid(), v_clarify_role, v_req.team_id)
      OR v_req.created_by = auth.uid();
  END IF;

  IF v_req.current_role_code IS NOT NULL THEN
    -- Submitter cannot approve their own request at any step
    IF v_req.created_by = auth.uid() THEN
      RETURN false;
    END IF;

    -- 1. User has the current role code
    IF public.user_has_approval_role(auth.uid(), v_req.current_role_code, v_req.team_id) THEN
      RETURN true;
    END IF;

    -- 2. Skip-level / emergency approval: User has a role code defined at a HIGHER step in this request's flow
    RETURN EXISTS (
      WITH active_flow AS (
        SELECT id FROM public.approval_flow_definitions
        WHERE request_type = v_req.request_type
          AND is_active = true
          AND (
            (team_id = v_req.team_id AND user_id = v_req.created_by)
            OR (team_id = v_req.team_id AND user_id IS NULL)
            OR (team_id IS NULL AND user_id = v_req.created_by)
            OR (team_id IS NULL AND user_id IS NULL)
          )
        ORDER BY
          (CASE WHEN team_id = v_req.team_id AND user_id = v_req.created_by THEN 4
                WHEN team_id = v_req.team_id AND user_id IS NULL THEN 3
                WHEN team_id IS NULL AND user_id = v_req.created_by THEN 2
                ELSE 1 END) DESC,
          priority DESC
        LIMIT 1
      ),
      cao_step AS (
        SELECT step_order FROM public.approval_flow_steps
        WHERE flow_id = (SELECT id FROM active_flow) AND upper(role_code) = 'CAO'
        LIMIT 1
      )
      SELECT 1 FROM public.approval_flow_steps afs
      WHERE afs.flow_id = (SELECT id FROM active_flow)
        AND afs.step_order > v_req.current_step_order
        AND public.user_has_approval_role(auth.uid(), afs.role_code, v_req.team_id)
        AND (
          lower(coalesce(v_org_role, '')) IN ('cao', 'ceo')
          OR public.user_has_approval_role(auth.uid(), 'CAO', v_req.team_id)
          OR public.user_has_approval_role(auth.uid(), 'CEO', v_req.team_id)
          -- Standard users can only skip to a step before CAO
          OR afs.step_order < (SELECT step_order FROM cao_step)
          OR (SELECT step_order FROM cao_step) IS NULL
        )
    );
  END IF;

  RETURN v_req.created_by = auth.uid();
END;
$function$
;
CREATE OR REPLACE FUNCTION public.user_has_approval_role(p_user_id uuid, p_role_code text, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := upper(trim(COALESCE(p_role_code, '')));
  v_org_role text;
BEGIN
  IF v_role = '' OR p_user_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT role INTO v_org_role FROM users WHERE id = p_user_id;
  -- System admin has all roles
  IF v_org_role = 'admin' THEN
    RETURN true;
  END IF;
  -- CAO remains implicit for now
  IF v_role = 'CAO' AND v_org_role IN ('caoh', 'admin') THEN
    RETURN true;
  END IF;
  -- CEO remains implicit
  IF v_role = 'CEO' AND v_org_role = 'ceo' THEN
    RETURN true;
  END IF;
  -- SYS role check
  IF v_role = 'SYS' AND v_org_role = 'admin' THEN
    RETURN true;
  END IF;
  -- Check team-level operational roles
  IF p_team_id IS NOT NULL THEN
    IF v_role = 'OPH' AND EXISTS (
      SELECT 1 FROM user_teams ut
      WHERE ut.user_id = p_user_id AND ut.team_id = p_team_id AND ut.access_level = 'oht'
    ) THEN
      RETURN true;
    END IF;
    IF v_role = 'OPL' AND EXISTS (
      SELECT 1 FROM user_teams ut
      WHERE ut.user_id = p_user_id AND ut.team_id = p_team_id AND ut.access_level = 'lead'
    ) THEN
      RETURN true;
    END IF;
    IF v_role = 'OPS' AND EXISTS (
      SELECT 1 FROM user_teams ut
      WHERE ut.user_id = p_user_id AND ut.team_id = p_team_id AND ut.access_level = 'member'
    ) THEN
      RETURN true;
    END IF;
  END IF;
  -- Look up explicit database assignments in request_role_assignments
  IF EXISTS (
    SELECT 1 FROM request_role_assignments rra
    WHERE rra.user_id = p_user_id
      AND upper(rra.role_code) = v_role
      AND rra.is_active = true
      AND (rra.team_id IS NULL OR rra.team_id = p_team_id)
  ) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.user_is_oht()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_teams ut
    WHERE ut.user_id = auth.uid()
      AND lower(trim(ut.access_level)) = 'oht'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.users_with_approval_role(p_role_code text, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := upper(trim(coalesce(p_role_code, '')));
BEGIN
  IF v_role = '' THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT DISTINCT x.uid
  FROM (
    SELECT u.id AS uid
    FROM public.users u
    WHERE
      (u.role = 'admin') -- admin has all roles
      OR (v_role = 'CEO' AND u.role = 'ceo')
      OR (v_role = 'CAO' AND u.role = 'caoh')
    UNION
    SELECT ut.user_id AS uid
    FROM public.user_teams ut
    WHERE p_team_id IS NOT NULL AND ut.team_id = p_team_id AND (
      (v_role = 'OPH' AND ut.access_level = 'oht')
      OR (v_role = 'OPL' AND ut.access_level = 'lead')
      OR (v_role = 'OPS' AND ut.access_level = 'member')
    )
    UNION
    SELECT rra.user_id AS uid
    FROM public.request_role_assignments rra
    WHERE upper(rra.role_code) = v_role
      AND rra.is_active = true
      AND (rra.team_id IS NULL OR rra.team_id = p_team_id)
  ) x;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.verify_transaction_pin(p_user_id uuid, p_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_stored_hash text;
    v_attempts int;
    v_locked_until timestamptz;
BEGIN
    -- Check if locked
    SELECT pin_attempts, pin_locked_until INTO v_attempts, v_locked_until
    FROM users WHERE id = p_user_id;

    IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
        RETURN false; -- Still locked
    END IF;

    -- Get stored hash
    SELECT transaction_pin_hash INTO v_stored_hash FROM users WHERE id = p_user_id;

    IF v_stored_hash IS NULL THEN
        RETURN false; -- No PIN set
    END IF;

    -- Verify (using pgcrypto crypt function)
    IF crypt(p_pin, v_stored_hash) = v_stored_hash THEN
        -- Success: reset attempts
        UPDATE users SET pin_attempts = 0, pin_locked_until = NULL WHERE id = p_user_id;
        RETURN true;
    ELSE
        -- Failure: increment attempts
        UPDATE users SET 
            pin_attempts = pin_attempts + 1,
            pin_locked_until = CASE WHEN pin_attempts + 1 >= 3 THEN now() + interval '15 minutes' ELSE NULL END
        WHERE id = p_user_id;
        RETURN false;
    END IF;
END;
$function$
;

-- ============================================================
-- Row Level Security - enable on every KManager table
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_team_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bucket_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_type_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_type_template_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_calendar_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategory_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_flow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_flow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_request_reconciliation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ok_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ok_app_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ok_app_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ok_home_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ok_menu_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ok_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_group_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Policies
-- ============================================================

CREATE POLICY "Users can view their own role assignments" ON public.app_role_assignments AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Allow read access to app_roles for all authenticated users" ON public.app_roles AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "approval_flow_definitions_select" ON public.approval_flow_definitions AS PERMISSIVE FOR SELECT TO authenticated USING (((is_active = true) OR is_org_admin()));
CREATE POLICY "approval_flow_steps_select" ON public.approval_flow_steps AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM approval_flow_definitions d
  WHERE ((d.id = approval_flow_steps.flow_id) AND ((d.is_active = true) OR is_org_admin())))));
CREATE POLICY "approval_messages_insert" ON public.approval_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM approval_requests ar
  WHERE ((ar.id = approval_messages.request_id) AND (ar.is_deleted = false) AND ((ar.created_by = auth.uid()) OR is_org_admin() OR (ar.team_id IN ( SELECT ut.team_id
           FROM user_teams ut
          WHERE (ut.user_id = auth.uid()))) OR user_can_act_on_approval_request(ar.id)))))));
CREATE POLICY "approval_messages_select" ON public.approval_messages AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM approval_requests ar
  WHERE ((ar.id = approval_messages.request_id) AND (ar.is_deleted = false) AND (is_org_admin() OR (ar.created_by = auth.uid()) OR (ar.team_id IN ( SELECT ut.team_id
           FROM user_teams ut
          WHERE (ut.user_id = auth.uid()))))))));
CREATE POLICY "approval_recon_lines_insert" ON public.approval_request_reconciliation_lines AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM approval_requests ar
  WHERE ((ar.id = approval_request_reconciliation_lines.request_id) AND (ar.created_by = auth.uid()) AND (ar.is_deleted = false)))));
CREATE POLICY "approval_recon_lines_select" ON public.approval_request_reconciliation_lines AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM approval_requests ar
  WHERE ((ar.id = approval_request_reconciliation_lines.request_id) AND (ar.is_deleted = false) AND (is_org_admin() OR (ar.created_by = auth.uid()) OR (ar.team_id IN ( SELECT ut.team_id
           FROM user_teams ut
          WHERE (ut.user_id = auth.uid()))))))));
CREATE POLICY "approval_requests_insert" ON public.approval_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "approval_requests_select" ON public.approval_requests AS PERMISSIVE FOR SELECT TO authenticated USING (((is_deleted = false) AND (is_org_admin() OR (created_by = auth.uid()) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid()))))));
CREATE POLICY "approval_requests_select_global_roles" ON public.approval_requests AS PERMISSIVE FOR SELECT TO authenticated USING (((is_deleted = false) AND ((EXISTS ( SELECT 1
   FROM request_role_assignments rra
  WHERE ((rra.user_id = auth.uid()) AND (rra.is_active = true) AND ((rra.team_id IS NULL) OR (rra.team_id = approval_requests.team_id))))) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['caoh'::text, 'oh'::text, 'admin'::text, 'fin'::text, 'fip'::text]))))))));
CREATE POLICY "approval_requests_update" ON public.approval_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (((created_by = auth.uid()) OR is_org_admin() OR user_can_act_on_approval_request(id))) WITH CHECK (((created_by = auth.uid()) OR is_org_admin() OR user_can_act_on_approval_request(id)));
CREATE POLICY "al_read" ON public.audit_log AS PERMISSIVE FOR SELECT TO public USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text))))));
CREATE POLICY "Org Admins can manage bucket access" ON public.bucket_access AS PERMISSIVE FOR ALL TO public USING (is_org_admin());
CREATE POLICY "Users can view their own bucket access" ON public.bucket_access AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "Assigned users can view org buckets" ON public.buckets AS PERMISSIVE FOR SELECT TO public USING (((is_org_level = true) AND (EXISTS ( SELECT 1
   FROM bucket_access
  WHERE ((bucket_access.bucket_id = buckets.id) AND (bucket_access.user_id = auth.uid()))))));
CREATE POLICY "Finance payment roles can view buckets" ON public.buckets AS PERMISSIVE FOR SELECT TO public USING (((auth.uid() IS NOT NULL) AND (is_org_admin() OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['fih'::text, 'fip'::text, 'fin'::text, 'cao'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'admin'::text]))))) OR (EXISTS ( SELECT 1
   FROM app_role_assignments a
  WHERE ((a.user_id = auth.uid()) AND (a.app_code = ANY (ARRAY['finance'::text, 'ok'::text])) AND (a.team_id IS NULL)))))));
CREATE POLICY "Leads can create buckets" ON public.buckets AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.team_id = buckets.team_id) AND (ut.user_id = auth.uid()) AND (ut.access_level = ANY (ARRAY['lead'::text, 'oh'::text, 'admin'::text]))))));
CREATE POLICY "Leads can update buckets" ON public.buckets AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.team_id = buckets.team_id) AND (ut.user_id = auth.uid()) AND (ut.access_level = ANY (ARRAY['lead'::text, 'oh'::text, 'admin'::text]))))));
CREATE POLICY "OH can delete buckets" ON public.buckets AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.team_id = buckets.team_id) AND (ut.user_id = auth.uid()) AND (ut.access_level = ANY (ARRAY['oh'::text, 'admin'::text]))))));
CREATE POLICY "Org Admins can manage org buckets" ON public.buckets AS PERMISSIVE FOR ALL TO public USING (((is_org_level = true) AND is_org_admin()));
CREATE POLICY "Org Admins can view org buckets" ON public.buckets AS PERMISSIVE FOR SELECT TO public USING (((is_org_level = true) AND is_org_admin()));
CREATE POLICY "Team leads can manage team buckets" ON public.buckets AS PERMISSIVE FOR ALL TO public USING (((auth.uid() IS NOT NULL) AND (is_org_level = false) AND (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.team_id = buckets.team_id) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text]))))))) WITH CHECK (((auth.uid() IS NOT NULL) AND (is_org_level = false) AND (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.team_id = buckets.team_id) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text])))))));
CREATE POLICY "Users can view team buckets" ON public.buckets AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.team_id = buckets.team_id) AND (ut.user_id = auth.uid())))));
CREATE POLICY "buckets_delete_team" ON public.buckets AS PERMISSIVE FOR DELETE TO authenticated USING (((team_id = get_user_team_id(auth.uid())) OR is_admin(auth.uid())));
CREATE POLICY "buckets_insert_team" ON public.buckets AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((team_id = get_user_team_id(auth.uid())) OR is_admin(auth.uid())));
CREATE POLICY "buckets_select_team" ON public.buckets AS PERMISSIVE FOR SELECT TO authenticated USING (((team_id = get_user_team_id(auth.uid())) OR is_admin(auth.uid())));
CREATE POLICY "buckets_update_team" ON public.buckets AS PERMISSIVE FOR UPDATE TO authenticated USING (((team_id = get_user_team_id(auth.uid())) OR is_admin(auth.uid()))) WITH CHECK (((team_id = get_user_team_id(auth.uid())) OR is_admin(auth.uid())));
CREATE POLICY "budget_calendar_admin_write" ON public.budget_calendar_entries AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text]))))));
CREATE POLICY "budget_calendar_read" ON public.budget_calendar_entries AS PERMISSIVE FOR SELECT TO authenticated USING ((is_deleted = false));
CREATE POLICY "Budget categories team scoped" ON public.budget_categories AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (budgets b
     JOIN users u ON ((u.id = auth.uid())))
  WHERE ((b.id = budget_categories.budget_id) AND ((b.team_id = u.team_id) OR (u.role = 'admin'::text))))));
CREATE POLICY "budget_plans_delete" ON public.budget_plans AS PERMISSIVE FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'fin'::text, 'fip'::text]))))) OR (created_by = auth.uid()) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text]))))) OR (team_id IN ( SELECT t.id
   FROM teams t
  WHERE ((t.is_personal_team = true) AND (t.personal_owner_user_id = auth.uid()))))));
CREATE POLICY "budget_plans_insert" ON public.budget_plans AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'fin'::text, 'fip'::text]))))) OR (created_by = auth.uid()) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text]))))) OR (team_id IN ( SELECT t.id
   FROM teams t
  WHERE ((t.is_personal_team = true) AND (t.personal_owner_user_id = auth.uid()))))));
CREATE POLICY "budget_plans_select" ON public.budget_plans AS PERMISSIVE FOR SELECT TO authenticated USING (((COALESCE(is_deleted, false) = false) AND ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'fin'::text, 'fip'::text]))))) OR (created_by = auth.uid()) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid()))) OR (team_id IN ( SELECT t.id
   FROM teams t
  WHERE ((t.is_personal_team = true) AND (t.personal_owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM request_role_assignments rra
  WHERE ((rra.user_id = auth.uid()) AND (rra.is_active = true) AND ((rra.team_id IS NULL) OR (rra.team_id = budget_plans.team_id))))) OR (EXISTS ( SELECT 1
   FROM approval_requests ar
  WHERE ((ar.budget_plan_id = budget_plans.id) AND (ar.is_deleted = false) AND ((ar.created_by = auth.uid()) OR (ar.team_id IN ( SELECT ut.team_id
           FROM user_teams ut
          WHERE (ut.user_id = auth.uid()))))))))));
CREATE POLICY "budget_plans_team_access" ON public.budget_plans AS PERMISSIVE FOR ALL TO public USING ((team_id IN ( SELECT user_teams.team_id
   FROM user_teams
  WHERE (user_teams.user_id = auth.uid()))));
CREATE POLICY "budget_plans_update" ON public.budget_plans AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'fin'::text, 'fip'::text]))))) OR (created_by = auth.uid()) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text]))))) OR (team_id IN ( SELECT t.id
   FROM teams t
  WHERE ((t.is_personal_team = true) AND (t.personal_owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM request_role_assignments rra
  WHERE ((rra.user_id = auth.uid()) AND (rra.is_active = true) AND ((rra.team_id IS NULL) OR (rra.team_id = budget_plans.team_id))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'fin'::text, 'fip'::text]))))) OR (created_by = auth.uid()) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text]))))) OR (team_id IN ( SELECT t.id
   FROM teams t
  WHERE ((t.is_personal_team = true) AND (t.personal_owner_user_id = auth.uid()))))));
CREATE POLICY "assignments_delete_policy" ON public.budget_type_template_assignments AS PERMISSIVE FOR DELETE TO public USING (((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text])) OR (auth.uid() IN ( SELECT app_role_assignments.user_id
   FROM app_role_assignments
  WHERE ((app_role_assignments.app_code = 'finance_setup'::text) AND (budget_type_template_assignments.is_deleted = false))))));
CREATE POLICY "assignments_insert_policy" ON public.budget_type_template_assignments AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid() IS NOT NULL) AND ((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text])) OR (auth.uid() IN ( SELECT app_role_assignments.user_id
   FROM app_role_assignments
  WHERE ((app_role_assignments.app_code = 'finance_setup'::text) AND (budget_type_template_assignments.is_deleted = false)))))));
CREATE POLICY "assignments_read_policy" ON public.budget_type_template_assignments AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY "assignments_update_policy" ON public.budget_type_template_assignments AS PERMISSIVE FOR UPDATE TO public USING (((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text])) OR (auth.uid() IN ( SELECT app_role_assignments.user_id
   FROM app_role_assignments
  WHERE ((app_role_assignments.app_code = 'finance_setup'::text) AND (budget_type_template_assignments.is_deleted = false))))));
CREATE POLICY "budget_templates_delete_policy" ON public.budget_type_templates AS PERMISSIVE FOR DELETE TO public USING (((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text])) OR (auth.uid() IN ( SELECT app_role_assignments.user_id
   FROM app_role_assignments
  WHERE ((app_role_assignments.app_code = 'finance_setup'::text) AND (budget_type_templates.is_deleted = false))))));
CREATE POLICY "budget_templates_insert_policy" ON public.budget_type_templates AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid() IS NOT NULL) AND ((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text])) OR (auth.uid() IN ( SELECT app_role_assignments.user_id
   FROM app_role_assignments
  WHERE ((app_role_assignments.app_code = 'finance_setup'::text) AND (budget_type_templates.is_deleted = false)))))));
CREATE POLICY "budget_templates_read_policy" ON public.budget_type_templates AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY "budget_templates_update_policy" ON public.budget_type_templates AS PERMISSIVE FOR UPDATE TO public USING (((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text])) OR (auth.uid() IN ( SELECT app_role_assignments.user_id
   FROM app_role_assignments
  WHERE ((app_role_assignments.app_code = 'finance_setup'::text) AND (budget_type_templates.is_deleted = false))))));
CREATE POLICY "budget_types_delete_policy" ON public.budget_types AS PERMISSIVE FOR DELETE TO public USING (((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text])) OR (auth.uid() IN ( SELECT app_role_assignments.user_id
   FROM app_role_assignments
  WHERE ((app_role_assignments.app_code = 'finance_setup'::text) AND (budget_types.is_deleted = false))))));
CREATE POLICY "budget_types_insert_policy" ON public.budget_types AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid() IS NOT NULL) AND ((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text])) OR (auth.uid() IN ( SELECT app_role_assignments.user_id
   FROM app_role_assignments
  WHERE ((app_role_assignments.app_code = 'finance_setup'::text) AND (budget_types.is_deleted = false)))))));
CREATE POLICY "budget_types_read_policy" ON public.budget_types AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY "budget_types_update_policy" ON public.budget_types AS PERMISSIVE FOR UPDATE TO public USING (((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text])) OR (auth.uid() IN ( SELECT app_role_assignments.user_id
   FROM app_role_assignments
  WHERE ((app_role_assignments.app_code = 'finance_setup'::text) AND (budget_types.is_deleted = false))))));
CREATE POLICY "admin_manage_categories" ON public.categories AS PERMISSIVE FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "categories_select_all" ON public.categories AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories_team_access" ON public.categories AS PERMISSIVE FOR ALL TO public USING (((team_id IN ( SELECT user_teams.team_id
   FROM user_teams
  WHERE (user_teams.user_id = auth.uid()))) OR (team_id IS NULL)));
CREATE POLICY "category_master_admin_write" ON public.category_master AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text]))))));
CREATE POLICY "category_master_read" ON public.category_master AS PERMISSIVE FOR SELECT TO authenticated USING ((is_deleted = false));
CREATE POLICY "manage_group_members" ON public.chat_group_members AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM chat_groups cg
  WHERE ((cg.id = chat_group_members.group_id) AND (cg.created_by = auth.uid())))));
CREATE POLICY "select_group_members" ON public.chat_group_members AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_group_member(group_id, auth.uid())));
CREATE POLICY "manage_chat_groups" ON public.chat_groups AS PERMISSIVE FOR ALL TO authenticated USING ((created_by = auth.uid())) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "select_chat_groups" ON public.chat_groups AS PERMISSIVE FOR SELECT TO authenticated USING (((created_by = auth.uid()) OR is_group_member(id, auth.uid())));
CREATE POLICY "manage_chat_permissions" ON public.chat_permissions AS PERMISSIVE FOR ALL TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text))))));
CREATE POLICY "select_chat_permissions" ON public.chat_permissions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage_chat_preferences" ON public.chat_preferences AS PERMISSIVE FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "daily_reconciliation_team_read" ON public.daily_reconciliation AS PERMISSIVE FOR SELECT TO authenticated USING (((is_deleted = false) AND (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid())))));
CREATE POLICY "daily_reconciliation_team_write" ON public.daily_reconciliation AS PERMISSIVE FOR ALL TO authenticated USING ((team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid())))) WITH CHECK ((team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid()))));
CREATE POLICY "Exchange rates read all" ON public.exchange_rates AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Exchange rates write team" ON public.exchange_rates AS PERMISSIVE FOR ALL TO public USING (((team_id = ( SELECT users.team_id
   FROM users
  WHERE (users.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text))))));
CREATE POLICY "exchange_rates_team_access" ON public.exchange_rates AS PERMISSIVE FOR ALL TO public USING (((team_id IN ( SELECT user_teams.team_id
   FROM user_teams
  WHERE (user_teams.user_id = auth.uid()))) OR (team_id IS NULL)));
CREATE POLICY "expense_attachments_delete" ON public.expense_attachments AS PERMISSIVE FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'fin'::text, 'fip'::text]))))) OR (created_by = auth.uid()) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text])))))));
CREATE POLICY "expense_attachments_insert" ON public.expense_attachments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'fin'::text, 'fip'::text]))))) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid()))))));
CREATE POLICY "expense_attachments_select" ON public.expense_attachments AS PERMISSIVE FOR SELECT TO authenticated USING (((is_deleted = false) AND ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'fin'::text, 'fip'::text]))))) OR (created_by = auth.uid()) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid()))))));
CREATE POLICY "expense_attachments_update" ON public.expense_attachments AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'fin'::text, 'fip'::text]))))) OR (created_by = auth.uid()) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text])))))));
CREATE POLICY "expense_receipts_delete" ON public.expense_receipts AS PERMISSIVE FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text]))))) OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.team_id = expense_receipts.team_id) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text])))))));
CREATE POLICY "expense_receipts_insert" ON public.expense_receipts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text]))))) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.access_level = ANY (ARRAY['member'::text, 'lead'::text, 'admin'::text]))))))));
CREATE POLICY "expense_receipts_select" ON public.expense_receipts AS PERMISSIVE FOR SELECT TO authenticated USING (((is_deleted = false) AND ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text]))))) OR ((team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid()))) AND ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.team_id = expense_receipts.team_id) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text]))))))))));
CREATE POLICY "expense_receipts_update" ON public.expense_receipts AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text]))))) OR ((team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid()))) AND ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.team_id = expense_receipts.team_id) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text])))))))));
CREATE POLICY "Hide deleted expenses" ON public.expenses AS PERMISSIVE FOR ALL TO public USING (((is_deleted = false) OR (is_deleted IS NULL)));
CREATE POLICY "expenses_delete" ON public.expenses AS PERMISSIVE FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text]))))) OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.team_id = expenses.team_id) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text])))))));
CREATE POLICY "expenses_delete_team" ON public.expenses AS PERMISSIVE FOR DELETE TO authenticated USING (((team_id = get_user_team_id(auth.uid())) OR is_admin(auth.uid())));
CREATE POLICY "expenses_insert" ON public.expenses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text]))))) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.access_level = ANY (ARRAY['member'::text, 'lead'::text, 'admin'::text]))))))));
CREATE POLICY "expenses_insert_team" ON public.expenses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((team_id = get_user_team_id(auth.uid())) OR is_admin(auth.uid())));
CREATE POLICY "expenses_select" ON public.expenses AS PERMISSIVE FOR SELECT TO authenticated USING (((is_deleted = false) AND ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text]))))) OR ((team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid()))) AND ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.team_id = expenses.team_id) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text]))))))))));
CREATE POLICY "expenses_select_team" ON public.expenses AS PERMISSIVE FOR SELECT TO authenticated USING (((team_id = get_user_team_id(auth.uid())) OR is_admin(auth.uid())));
CREATE POLICY "expenses_team_rls" ON public.expenses AS PERMISSIVE FOR ALL TO authenticated USING (check_team_membership(team_id)) WITH CHECK (check_team_membership(team_id));
CREATE POLICY "expenses_update" ON public.expenses AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text]))))) OR ((team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid()))) AND ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.team_id = expenses.team_id) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text])))))))));
CREATE POLICY "expenses_update_team" ON public.expenses AS PERMISSIVE FOR UPDATE TO authenticated USING (((team_id = get_user_team_id(auth.uid())) OR is_admin(auth.uid()))) WITH CHECK (((team_id = get_user_team_id(auth.uid())) OR is_admin(auth.uid())));
CREATE POLICY "income_team_access" ON public.income AS PERMISSIVE FOR ALL TO public USING ((team_id IN ( SELECT user_teams.team_id
   FROM user_teams
  WHERE (user_teams.user_id = auth.uid()))));
CREATE POLICY "income_team_rls" ON public.income AS PERMISSIVE FOR ALL TO authenticated USING (check_team_membership(team_id)) WITH CHECK (check_team_membership(team_id));
CREATE POLICY "insert_messages" ON public.messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND (((recipient_type = 'team'::text) AND ((EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE (((ut.team_id)::text = messages.recipient_id) AND (ut.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['fin'::text, 'fip'::text, 'oh'::text, 'caoh'::text, 'ceo'::text, 'admin'::text]))))))) OR ((recipient_type = 'role'::text) AND (((recipient_id = ANY (ARRAY['all'::text, 'male'::text, 'female'::text])) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text])))))) OR (recipient_id <> ALL (ARRAY['all'::text, 'male'::text, 'female'::text])))) OR ((recipient_type = 'user'::text) AND can_chat_with(auth.uid(), (recipient_id)::uuid)) OR ((recipient_type = 'group'::text) AND is_group_member((recipient_id)::uuid, auth.uid())))));
CREATE POLICY "select_messages" ON public.messages AS PERMISSIVE FOR SELECT TO authenticated USING (((sender_id = auth.uid()) OR ((recipient_type = 'user'::text) AND (recipient_id = (auth.uid())::text) AND can_chat_with(sender_id, auth.uid())) OR ((recipient_type = 'team'::text) AND (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (((ut.team_id)::text = messages.recipient_id) OR (EXISTS ( SELECT 1
           FROM get_sub_teams_recursive((messages.recipient_id)::uuid) st(team_id)
          WHERE (st.team_id = ut.team_id)))))))) OR ((recipient_type = 'group'::text) AND is_group_member((recipient_id)::uuid, auth.uid())) OR ((recipient_type = 'role'::text) AND ((recipient_id = 'all'::text) OR ((recipient_id = 'male'::text) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.gender = 'male'::text))))) OR ((recipient_id = 'female'::text) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.gender = 'female'::text))))) OR (EXISTS ( SELECT 1
   FROM request_role_assignments rra
  WHERE ((rra.role_code = messages.recipient_id) AND (rra.user_id = auth.uid()) AND (rra.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['caoh'::text, 'oh'::text, 'admin'::text])) AND (((messages.recipient_id = 'CAO'::text) AND (u.role = ANY (ARRAY['caoh'::text, 'admin'::text]))) OR ((messages.recipient_id = 'FIH'::text) AND (u.role = ANY (ARRAY['oh'::text, 'admin'::text]))))))))) OR (((metadata ->> 'link_type'::text) = 'budget'::text) AND (EXISTS ( SELECT 1
   FROM approval_requests r
  WHERE (((r.id)::text = (messages.metadata ->> 'link_id'::text)) AND (((messages.metadata -> 'visible_to'::text) IS NULL) OR ((messages.metadata -> 'visible_to'::text) = '[]'::jsonb) OR ((messages.metadata -> 'visible_to'::text) ? 'ALL'::text) OR (EXISTS ( SELECT 1
           FROM jsonb_array_elements_text((messages.metadata -> 'visible_to'::text)) role_code(value)
          WHERE user_has_approval_role(auth.uid(), role_code.value, r.team_id))))))))));
CREATE POLICY "update_messages" ON public.messages AS PERMISSIVE FOR UPDATE TO authenticated USING (((sender_id = auth.uid()) OR ((recipient_type = 'user'::text) AND (recipient_id = (auth.uid())::text) AND can_chat_with(sender_id, auth.uid())) OR ((recipient_type = 'team'::text) AND (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE (((ut.team_id)::text = messages.recipient_id) AND (ut.user_id = auth.uid()))))) OR ((recipient_type = 'group'::text) AND is_group_member((recipient_id)::uuid, auth.uid())) OR ((recipient_type = 'role'::text) AND ((EXISTS ( SELECT 1
   FROM request_role_assignments rra
  WHERE ((rra.role_code = messages.recipient_id) AND (rra.user_id = auth.uid()) AND (rra.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['caoh'::text, 'oh'::text, 'admin'::text])) AND (((messages.recipient_id = 'CAO'::text) AND (u.role = ANY (ARRAY['caoh'::text, 'admin'::text]))) OR ((messages.recipient_id = 'FIH'::text) AND (u.role = ANY (ARRAY['oh'::text, 'admin'::text]))))))))) OR (((metadata ->> 'link_type'::text) = 'budget'::text) AND (EXISTS ( SELECT 1
   FROM approval_requests r
  WHERE (((r.id)::text = (messages.metadata ->> 'link_id'::text)) AND (((messages.metadata -> 'visible_to'::text) IS NULL) OR ((messages.metadata -> 'visible_to'::text) = '[]'::jsonb) OR ((messages.metadata -> 'visible_to'::text) ? 'ALL'::text) OR (EXISTS ( SELECT 1
           FROM jsonb_array_elements_text((messages.metadata -> 'visible_to'::text)) role_code(value)
          WHERE user_has_approval_role(auth.uid(), role_code.value, r.team_id)))))))))) WITH CHECK (true);
CREATE POLICY "ok_admins_manage" ON public.ok_admins AS PERMISSIVE FOR ALL TO authenticated USING (is_ok_admin()) WITH CHECK (is_ok_admin());
CREATE POLICY "ok_admins_select" ON public.ok_admins AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_ok_admin()));
CREATE POLICY "Allow all read to authenticated" ON public.ok_app_access AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all write to ok admins" ON public.ok_app_access AS PERMISSIVE FOR ALL TO authenticated USING (is_ok_admin());
CREATE POLICY "manage_app_admins" ON public.ok_app_admins AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text)))));
CREATE POLICY "select_app_admins" ON public.ok_app_admins AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "ok_home_pins_own" ON public.ok_home_pins AS PERMISSIVE FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "ok_home_pins_select" ON public.ok_home_pins AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_ok_admin()));
CREATE POLICY "Allow all read to authenticated" ON public.ok_menu_access AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all write to ok admins" ON public.ok_menu_access AS PERMISSIVE FOR ALL TO authenticated USING (is_ok_admin());
CREATE POLICY "ok_messages_delete_admin" ON public.ok_messages AS PERMISSIVE FOR DELETE TO authenticated USING (is_ok_admin());
CREATE POLICY "ok_messages_delete_own" ON public.ok_messages AS PERMISSIVE FOR DELETE TO authenticated USING (((user_id = auth.uid()) OR is_ok_admin()));
CREATE POLICY "ok_messages_insert_admin" ON public.ok_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_ok_admin() OR (user_id = auth.uid())));
CREATE POLICY "ok_messages_select" ON public.ok_messages AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_ok_admin()));
CREATE POLICY "ok_messages_update_own" ON public.ok_messages AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "reconciliation_lines_select" ON public.reconciliation_lines AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM reconciliation_submissions rs
  WHERE ((rs.id = reconciliation_lines.submission_id) AND (rs.is_deleted = false) AND ((EXISTS ( SELECT 1
           FROM users u
          WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text]))))) OR ((rs.team_id IN ( SELECT ut.team_id
           FROM user_teams ut
          WHERE (ut.user_id = auth.uid()))) AND ((rs.scope = ANY (ARRAY['team'::text, 'all'::text])) OR (rs.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM user_teams ut
          WHERE ((ut.user_id = auth.uid()) AND (ut.team_id = rs.team_id) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text]))))))))))));
CREATE POLICY "reconciliation_lines_write" ON public.reconciliation_lines AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM reconciliation_submissions rs
  WHERE ((rs.id = reconciliation_lines.submission_id) AND (rs.is_deleted = false) AND (rs.team_id IN ( SELECT ut.team_id
           FROM user_teams ut
          WHERE (ut.user_id = auth.uid()))) AND (EXISTS ( SELECT 1
           FROM user_teams ut
          WHERE ((ut.user_id = auth.uid()) AND (ut.team_id = rs.team_id) AND (lower(TRIM(BOTH FROM ut.access_level)) <> ALL (ARRAY['view'::text, 'oht'::text]))))) AND ((rs.scope = ANY (ARRAY['team'::text, 'all'::text])) OR (rs.user_id = auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM reconciliation_submissions rs
  WHERE ((rs.id = reconciliation_lines.submission_id) AND (rs.created_by = auth.uid()) AND (rs.team_id IN ( SELECT ut.team_id
           FROM user_teams ut
          WHERE (ut.user_id = auth.uid()))) AND (EXISTS ( SELECT 1
           FROM user_teams ut
          WHERE ((ut.user_id = auth.uid()) AND (ut.team_id = rs.team_id) AND (lower(TRIM(BOTH FROM ut.access_level)) <> ALL (ARRAY['view'::text, 'oht'::text]))))) AND ((rs.scope = ANY (ARRAY['team'::text, 'all'::text])) OR (rs.user_id = auth.uid()))))));
CREATE POLICY "reconciliation_submissions_select" ON public.reconciliation_submissions AS PERMISSIVE FOR SELECT TO authenticated USING (((is_deleted = false) AND ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text]))))) OR ((team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid()))) AND ((scope = ANY (ARRAY['team'::text, 'all'::text])) OR (user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.team_id = reconciliation_submissions.team_id) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text]))))))))));
CREATE POLICY "reconciliation_submissions_write" ON public.reconciliation_submissions AS PERMISSIVE FOR ALL TO authenticated USING (((team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.team_id = reconciliation_submissions.team_id) AND (lower(TRIM(BOTH FROM ut.access_level)) <> ALL (ARRAY['view'::text, 'oht'::text]))))) AND ((scope = ANY (ARRAY['team'::text, 'all'::text])) OR (user_id = auth.uid())))) WITH CHECK (((team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.team_id = reconciliation_submissions.team_id) AND (lower(TRIM(BOTH FROM ut.access_level)) <> ALL (ARRAY['view'::text, 'oht'::text]))))) AND (created_by = auth.uid()) AND (((scope = 'team'::text) AND (user_id IS NULL)) OR ((scope = 'all'::text) AND (user_id IS NULL)) OR ((scope = 'personal'::text) AND (user_id = auth.uid())))));
CREATE POLICY "report_logs_delete" ON public.report_logs AS PERMISSIVE FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'fin'::text, 'fip'::text]))))) OR (created_by = auth.uid()) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text])))))));
CREATE POLICY "report_logs_insert" ON public.report_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'fin'::text, 'fip'::text]))))) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid()))))));
CREATE POLICY "report_logs_select" ON public.report_logs AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'fin'::text, 'fip'::text]))))) OR (created_by = auth.uid()) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.access_level = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))));
CREATE POLICY "report_logs_update" ON public.report_logs AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'fin'::text, 'fip'::text]))))) OR (created_by = auth.uid()) OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.access_level = ANY (ARRAY['lead'::text, 'admin'::text])))))));
CREATE POLICY "request_role_assignments_manage" ON public.request_role_assignments AS PERMISSIVE FOR ALL TO authenticated USING ((is_org_admin() OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['oh'::text, 'caoh'::text, 'admin'::text]))))))) WITH CHECK ((is_org_admin() OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['oh'::text, 'caoh'::text, 'admin'::text])))))));
CREATE POLICY "request_role_assignments_select" ON public.request_role_assignments AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_org_admin() OR (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid())))));
CREATE POLICY "subcategory_master_admin_write" ON public.subcategory_master AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text, 'ceo'::text]))))));
CREATE POLICY "subcategory_master_read" ON public.subcategory_master AS PERMISSIVE FOR SELECT TO authenticated USING ((is_deleted = false));
CREATE POLICY "insert_tasks" ON public.tasks AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.team_id = ut.team_id) AND (ut.user_id = auth.uid()))))));
CREATE POLICY "select_tasks" ON public.tasks AS PERMISSIVE FOR SELECT TO authenticated USING (((created_by = auth.uid()) OR (assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND ((ut.team_id = tasks.team_id) OR (ut.team_id IN ( SELECT get_parent_teams_recursive.team_id
           FROM get_parent_teams_recursive(tasks.team_id) get_parent_teams_recursive(team_id))) OR (ut.team_id IN ( SELECT get_sub_teams_recursive.team_id
           FROM get_sub_teams_recursive(tasks.team_id) get_sub_teams_recursive(team_id)))))))));
CREATE POLICY "update_tasks" ON public.tasks AS PERMISSIVE FOR UPDATE TO authenticated USING (((created_by = auth.uid()) OR (assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_teams ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.access_level = ANY (ARRAY['lead'::text, 'oht'::text, 'admin'::text])) AND ((ut.team_id = tasks.team_id) OR (ut.team_id IN ( SELECT get_parent_teams_recursive.team_id
           FROM get_parent_teams_recursive(tasks.team_id) get_parent_teams_recursive(team_id))) OR (ut.team_id IN ( SELECT get_sub_teams_recursive.team_id
           FROM get_sub_teams_recursive(tasks.team_id) get_sub_teams_recursive(team_id)))))))));
CREATE POLICY "tgm_read" ON public.team_group_members AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "tgm_write" ON public.team_group_members AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text]))))));
CREATE POLICY "team_groups_read" ON public.team_groups AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "team_groups_write" ON public.team_groups AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text]))))));
CREATE POLICY "Allow all read to authenticated" ON public.team_relationships AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write to ok admins" ON public.team_relationships AS PERMISSIVE FOR ALL TO authenticated USING (is_ok_admin());
CREATE POLICY "lead_update_own_team" ON public.teams AS PERMISSIVE FOR UPDATE TO authenticated USING (((lead_id = auth.uid()) OR is_admin(auth.uid()))) WITH CHECK (((lead_id = auth.uid()) OR is_admin(auth.uid())));
CREATE POLICY "teams_admin_write" ON public.teams AS PERMISSIVE FOR ALL TO authenticated USING (is_org_admin()) WITH CHECK (is_org_admin());
CREATE POLICY "teams_oht_create" ON public.teams AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_org_admin() OR ((created_by_oht_user_id = auth.uid()) AND (is_personal_team = false))));
CREATE POLICY "teams_oht_update" ON public.teams AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_org_admin() OR (created_by_oht_user_id = auth.uid()))) WITH CHECK ((is_org_admin() OR (created_by_oht_user_id = auth.uid())));
CREATE POLICY "teams_select" ON public.teams AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams_select_all" ON public.teams AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams_select_role_assignment" ON public.teams AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM request_role_assignments rra
  WHERE ((rra.user_id = auth.uid()) AND (rra.is_active = true) AND ((rra.team_id IS NULL) OR (rra.team_id = teams.id))))));
CREATE POLICY "Finance payment roles can insert transfers" ON public.transfers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_org_admin() OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['fih'::text, 'fip'::text, 'fin'::text, 'cao'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'admin'::text]))))) OR (EXISTS ( SELECT 1
   FROM app_role_assignments a
  WHERE ((a.user_id = auth.uid()) AND (a.app_code = ANY (ARRAY['finance'::text, 'ok'::text])) AND (a.team_id IS NULL))))));
CREATE POLICY "Finance payment roles can view transfers" ON public.transfers AS PERMISSIVE FOR SELECT TO authenticated USING ((is_org_admin() OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['fih'::text, 'fip'::text, 'fin'::text, 'cao'::text, 'caoh'::text, 'oh'::text, 'ceo'::text, 'admin'::text]))))) OR (EXISTS ( SELECT 1
   FROM app_role_assignments a
  WHERE ((a.user_id = auth.uid()) AND (a.app_code = ANY (ARRAY['finance'::text, 'ok'::text])) AND (a.team_id IS NULL))))));
CREATE POLICY "Team scoped transfers" ON public.transfers AS PERMISSIVE FOR ALL TO authenticated USING ((team_id IN ( SELECT user_teams.team_id
   FROM user_teams
  WHERE (user_teams.user_id = auth.uid())
UNION
 SELECT users.team_id
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.team_id IS NOT NULL))))) WITH CHECK ((team_id IN ( SELECT user_teams.team_id
   FROM user_teams
  WHERE (user_teams.user_id = auth.uid())
UNION
 SELECT users.team_id
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.team_id IS NOT NULL)))));
CREATE POLICY "Transfers team scoped" ON public.transfers AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (buckets b
     JOIN users u ON ((u.id = auth.uid())))
  WHERE ((b.id = transfers.from_bucket_id) AND ((b.team_id = u.team_id) OR (u.role = 'admin'::text))))));
CREATE POLICY "ug_read" ON public.user_groups AS PERMISSIVE FOR SELECT TO public USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text])))))));
CREATE POLICY "ug_write" ON public.user_groups AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'caoh'::text, 'oh'::text]))))));
CREATE POLICY "user_team_defaults_select" ON public.user_team_defaults AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "user_team_defaults_write" ON public.user_team_defaults AS PERMISSIVE FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK (((user_id = auth.uid()) AND (team_id IN ( SELECT ut.team_id
   FROM user_teams ut
  WHERE (ut.user_id = auth.uid())))));
CREATE POLICY "User teams admin write" ON public.user_teams AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));
CREATE POLICY "User teams read all" ON public.user_teams AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "user_teams_admin_write" ON public.user_teams AS PERMISSIVE FOR ALL TO authenticated USING (is_org_admin()) WITH CHECK (is_org_admin());
CREATE POLICY "user_teams_oht_delete" ON public.user_teams AS PERMISSIVE FOR DELETE TO authenticated USING (is_team_roster_manager(team_id));
CREATE POLICY "user_teams_oht_insert" ON public.user_teams AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_team_roster_manager(team_id));
CREATE POLICY "user_teams_oht_update" ON public.user_teams AS PERMISSIVE FOR UPDATE TO authenticated USING (is_team_roster_manager(team_id)) WITH CHECK (is_team_roster_manager(team_id));
CREATE POLICY "user_teams_own_update" ON public.user_teams AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "user_teams_select" ON public.user_teams AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_org_admin() OR is_team_roster_manager(team_id)));
CREATE POLICY "admin_select_all_users" ON public.users AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "admin_update_all_users" ON public.users AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "users_ok_admin_select" ON public.users AS PERMISSIVE FOR SELECT TO authenticated USING ((is_ok_admin() OR (id = auth.uid())));
CREATE POLICY "users_ok_admin_update" ON public.users AS PERMISSIVE FOR UPDATE TO authenticated USING (is_ok_admin()) WITH CHECK (is_ok_admin());
CREATE POLICY "users_org_admin_insert" ON public.users AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_org_admin());
CREATE POLICY "users_org_admin_update" ON public.users AS PERMISSIVE FOR UPDATE TO authenticated USING (is_org_admin()) WITH CHECK (is_org_admin());
CREATE POLICY "users_select_all" ON public.users AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_select_oht_roster" ON public.users AS PERMISSIVE FOR SELECT TO authenticated USING ((is_org_admin() OR user_is_oht()));
CREATE POLICY "users_select_org_admin" ON public.users AS PERMISSIVE FOR SELECT TO authenticated USING (is_org_admin());
CREATE POLICY "users_select_own" ON public.users AS PERMISSIVE FOR SELECT TO authenticated USING ((id = auth.uid()));
CREATE POLICY "users_self_read" ON public.users AS PERMISSIVE FOR SELECT TO public USING ((id = auth.uid()));
CREATE POLICY "users_update_own" ON public.users AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));
CREATE POLICY "users_update_own_alias" ON public.users AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

-- ============================================================
-- Triggers
-- ============================================================

CREATE TRIGGER trg_enforce_approval_requests_integrity BEFORE UPDATE ON public.approval_requests FOR EACH ROW EXECUTE FUNCTION enforce_approval_requests_integrity();
CREATE TRIGGER trg_enforce_budget_plans_integrity BEFORE UPDATE ON public.budget_plans FOR EACH ROW EXECUTE FUNCTION enforce_budget_plans_integrity();
CREATE TRIGGER enforce_income_row_ownership_delete BEFORE DELETE ON public.income FOR EACH ROW EXECUTE FUNCTION enforce_income_row_ownership();
CREATE TRIGGER enforce_income_row_ownership_update BEFORE UPDATE ON public.income FOR EACH ROW EXECUTE FUNCTION enforce_income_row_ownership();
CREATE TRIGGER trg_income_balance_impact AFTER INSERT OR DELETE OR UPDATE ON public.income FOR EACH ROW EXECUTE FUNCTION handle_income_balance_impact();
CREATE TRIGGER trg_update_bucket_on_income AFTER INSERT ON public.income FOR EACH ROW EXECUTE FUNCTION update_bucket_on_income();
CREATE TRIGGER trg_set_next_task_number BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION set_next_task_number();
CREATE TRIGGER trg_teams_after_insert AFTER INSERT ON public.teams FOR EACH ROW EXECUTE FUNCTION trg_teams_after_insert_create_bucket();
CREATE TRIGGER update_buckets_on_transfer AFTER INSERT ON public.transfers FOR EACH ROW EXECUTE FUNCTION update_buckets_on_transfer_fn();
CREATE TRIGGER enforce_user_teams_self_update_limits_trigger BEFORE UPDATE ON public.user_teams FOR EACH ROW EXECUTE FUNCTION enforce_user_teams_self_update_limits();
CREATE TRIGGER enforce_users_self_update_limits_trigger BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION enforce_users_self_update_limits();

-- ============================================================
-- Grants (anon/authenticated/service_role - required for PostgREST to expose these tables)
-- ============================================================

GRANT SELECT, UPDATE, INSERT, DELETE, TRIGGER, REFERENCES, TRUNCATE ON public.app_role_assignments TO anon;
GRANT TRUNCATE, UPDATE, SELECT, INSERT, TRIGGER, REFERENCES, DELETE ON public.app_role_assignments TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, DELETE, UPDATE, SELECT, INSERT ON public.app_role_assignments TO service_role;
GRANT DELETE, SELECT, INSERT, UPDATE, TRIGGER, REFERENCES, TRUNCATE ON public.app_roles TO anon;
GRANT DELETE, UPDATE, SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE ON public.app_roles TO authenticated;
GRANT TRUNCATE, UPDATE, SELECT, INSERT, TRIGGER, REFERENCES, DELETE ON public.app_roles TO service_role;
GRANT REFERENCES, SELECT, UPDATE, DELETE, INSERT, TRIGGER, TRUNCATE ON public.approval_flow_definitions TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.approval_flow_definitions TO authenticated;
GRANT REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT, TRIGGER ON public.approval_flow_definitions TO service_role;
GRANT SELECT, UPDATE, REFERENCES, DELETE, TRUNCATE, TRIGGER, INSERT ON public.approval_flow_steps TO anon;
GRANT DELETE, TRIGGER, TRUNCATE, REFERENCES, UPDATE, SELECT, INSERT ON public.approval_flow_steps TO authenticated;
GRANT TRUNCATE, SELECT, INSERT, DELETE, TRIGGER, UPDATE, REFERENCES ON public.approval_flow_steps TO service_role;
GRANT INSERT, SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER, DELETE ON public.approval_messages TO anon;
GRANT TRIGGER, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, INSERT ON public.approval_messages TO authenticated;
GRANT DELETE, TRIGGER, REFERENCES, TRUNCATE, UPDATE, SELECT, INSERT ON public.approval_messages TO service_role;
GRANT INSERT, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, TRIGGER ON public.approval_request_reconciliation_lines TO anon;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.approval_request_reconciliation_lines TO authenticated;
GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.approval_request_reconciliation_lines TO service_role;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.approval_requests TO anon;
GRANT INSERT, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, TRIGGER ON public.approval_requests TO authenticated;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.approval_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.audit_log TO anon;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.audit_log TO authenticated;
GRANT TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.audit_log TO service_role;
GRANT TRIGGER, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, INSERT ON public.bucket_access TO anon;
GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.bucket_access TO authenticated;
GRANT DELETE, TRUNCATE, REFERENCES, INSERT, TRIGGER, UPDATE, SELECT ON public.bucket_access TO service_role;
GRANT UPDATE, INSERT, SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.buckets TO anon;
GRANT TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.buckets TO authenticated;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.buckets TO service_role;
GRANT UPDATE, SELECT, INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.budget_calendar_entries TO anon;
GRANT TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.budget_calendar_entries TO authenticated;
GRANT UPDATE, SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE ON public.budget_calendar_entries TO service_role;
GRANT DELETE, SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE, UPDATE ON public.budget_categories TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.budget_categories TO authenticated;
GRANT REFERENCES, TRIGGER, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.budget_categories TO service_role;
GRANT INSERT, REFERENCES, TRIGGER, SELECT, UPDATE, DELETE, TRUNCATE ON public.budget_plans TO anon;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.budget_plans TO authenticated;
GRANT TRUNCATE, INSERT, SELECT, UPDATE, DELETE, TRIGGER, REFERENCES ON public.budget_plans TO service_role;
GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.budget_type_template_assignments TO anon;
GRANT TRUNCATE, REFERENCES, TRIGGER, INSERT, SELECT, UPDATE, DELETE ON public.budget_type_template_assignments TO authenticated;
GRANT TRIGGER, REFERENCES, INSERT, SELECT, UPDATE, DELETE, TRUNCATE ON public.budget_type_template_assignments TO service_role;
GRANT INSERT, TRIGGER, TRUNCATE, REFERENCES, DELETE, UPDATE, SELECT ON public.budget_type_templates TO anon;
GRANT TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.budget_type_templates TO authenticated;
GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.budget_type_templates TO service_role;
GRANT SELECT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT ON public.budget_types TO anon;
GRANT TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.budget_types TO authenticated;
GRANT TRUNCATE, TRIGGER, REFERENCES, INSERT, UPDATE, DELETE, SELECT ON public.budget_types TO service_role;
GRANT INSERT, SELECT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, DELETE ON public.categories TO anon;
GRANT SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER, INSERT, UPDATE ON public.categories TO authenticated;
GRANT SELECT, DELETE, TRUNCATE, TRIGGER, REFERENCES, INSERT, UPDATE ON public.categories TO service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.category_master TO anon;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.category_master TO authenticated;
GRANT TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.category_master TO service_role;
GRANT TRUNCATE, INSERT, SELECT, UPDATE, DELETE, REFERENCES, TRIGGER ON public.chat_group_members TO anon;
GRANT UPDATE, SELECT, INSERT, REFERENCES, DELETE, TRUNCATE, TRIGGER ON public.chat_group_members TO authenticated;
GRANT REFERENCES, INSERT, UPDATE, TRIGGER, DELETE, TRUNCATE, SELECT ON public.chat_group_members TO service_role;
GRANT INSERT, TRUNCATE, DELETE, UPDATE, SELECT, REFERENCES, TRIGGER ON public.chat_groups TO anon;
GRANT REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT, TRIGGER ON public.chat_groups TO authenticated;
GRANT REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT, TRIGGER ON public.chat_groups TO service_role;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, SELECT ON public.chat_permissions TO anon;
GRANT UPDATE, SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER, INSERT ON public.chat_permissions TO authenticated;
GRANT DELETE, TRIGGER, REFERENCES, SELECT, UPDATE, INSERT, TRUNCATE ON public.chat_permissions TO service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.chat_preferences TO anon;
GRANT SELECT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT ON public.chat_preferences TO authenticated;
GRANT SELECT, REFERENCES, UPDATE, TRUNCATE, TRIGGER, DELETE, INSERT ON public.chat_preferences TO service_role;
GRANT TRIGGER, REFERENCES, TRUNCATE, SELECT, INSERT, DELETE, UPDATE ON public.daily_reconciliation TO anon;
GRANT INSERT, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, TRIGGER ON public.daily_reconciliation TO authenticated;
GRANT DELETE, TRIGGER, REFERENCES, TRUNCATE, UPDATE, SELECT, INSERT ON public.daily_reconciliation TO service_role;
GRANT REFERENCES, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, TRIGGER ON public.exchange_rates TO anon;
GRANT SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE ON public.exchange_rates TO authenticated;
GRANT REFERENCES, INSERT, UPDATE, DELETE, TRUNCATE, SELECT, TRIGGER ON public.exchange_rates TO service_role;
GRANT DELETE, TRIGGER, REFERENCES, TRUNCATE, UPDATE, SELECT, INSERT ON public.expense_attachments TO anon;
GRANT TRIGGER, REFERENCES, TRUNCATE, INSERT, DELETE, SELECT, UPDATE ON public.expense_attachments TO authenticated;
GRANT TRUNCATE, DELETE, UPDATE, SELECT, TRIGGER, REFERENCES, INSERT ON public.expense_attachments TO service_role;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.expense_receipts TO anon;
GRANT DELETE, REFERENCES, TRIGGER, INSERT, SELECT, UPDATE, TRUNCATE ON public.expense_receipts TO authenticated;
GRANT UPDATE, TRIGGER, REFERENCES, INSERT, TRUNCATE, DELETE, SELECT ON public.expense_receipts TO service_role;
GRANT REFERENCES, SELECT, INSERT, DELETE, UPDATE, TRUNCATE, TRIGGER ON public.expenses TO anon;
GRANT REFERENCES, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, TRIGGER ON public.expenses TO authenticated;
GRANT SELECT, TRIGGER, REFERENCES, INSERT, UPDATE, DELETE, TRUNCATE ON public.expenses TO service_role;
GRANT SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER, INSERT, UPDATE ON public.income TO anon;
GRANT TRIGGER, INSERT, SELECT, DELETE, UPDATE, TRUNCATE, REFERENCES ON public.income TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.income TO service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.messages TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.messages TO authenticated;
GRANT REFERENCES, TRIGGER, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.messages TO service_role;
GRANT TRIGGER, DELETE, UPDATE, SELECT, INSERT, TRUNCATE, REFERENCES ON public.ok_admins TO anon;
GRANT DELETE, INSERT, TRUNCATE, REFERENCES, TRIGGER, SELECT, UPDATE ON public.ok_admins TO authenticated;
GRANT UPDATE, DELETE, TRIGGER, TRUNCATE, REFERENCES, SELECT, INSERT ON public.ok_admins TO service_role;
GRANT TRUNCATE, INSERT, SELECT, UPDATE, DELETE, REFERENCES, TRIGGER ON public.ok_app_access TO anon;
GRANT TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.ok_app_access TO authenticated;
GRANT TRIGGER, TRUNCATE, DELETE, INSERT, SELECT, UPDATE, REFERENCES ON public.ok_app_access TO service_role;
GRANT TRIGGER, TRUNCATE, DELETE, UPDATE, INSERT, SELECT, REFERENCES ON public.ok_app_admins TO anon;
GRANT TRUNCATE, TRIGGER, UPDATE, SELECT, INSERT, DELETE, REFERENCES ON public.ok_app_admins TO authenticated;
GRANT UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, INSERT, SELECT ON public.ok_app_admins TO service_role;
GRANT UPDATE, TRUNCATE, REFERENCES, TRIGGER, INSERT, SELECT, DELETE ON public.ok_home_pins TO anon;
GRANT SELECT, UPDATE, DELETE, REFERENCES, INSERT, TRUNCATE, TRIGGER ON public.ok_home_pins TO authenticated;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.ok_home_pins TO service_role;
GRANT SELECT, REFERENCES, TRIGGER, TRUNCATE, DELETE, INSERT, UPDATE ON public.ok_menu_access TO anon;
GRANT UPDATE, SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE ON public.ok_menu_access TO authenticated;
GRANT SELECT, REFERENCES, TRIGGER, TRUNCATE, DELETE, UPDATE, INSERT ON public.ok_menu_access TO service_role;
GRANT UPDATE, SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE ON public.ok_messages TO anon;
GRANT DELETE, SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE, UPDATE ON public.ok_messages TO authenticated;
GRANT SELECT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT ON public.ok_messages TO service_role;
GRANT INSERT, TRIGGER, TRUNCATE, REFERENCES, SELECT, UPDATE, DELETE ON public.reconciliation_lines TO anon;
GRANT TRIGGER, REFERENCES, TRUNCATE, SELECT, UPDATE, DELETE, INSERT ON public.reconciliation_lines TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.reconciliation_lines TO service_role;
GRANT TRUNCATE, INSERT, SELECT, UPDATE, DELETE, REFERENCES, TRIGGER ON public.reconciliation_submissions TO anon;
GRANT TRIGGER, TRUNCATE, DELETE, UPDATE, SELECT, INSERT, REFERENCES ON public.reconciliation_submissions TO authenticated;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, SELECT, DELETE, UPDATE ON public.reconciliation_submissions TO service_role;
GRANT REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT, TRIGGER, SELECT ON public.report_logs TO anon;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.report_logs TO authenticated;
GRANT INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER, SELECT, UPDATE ON public.report_logs TO service_role;
GRANT SELECT, REFERENCES, TRUNCATE, DELETE, INSERT, UPDATE, TRIGGER ON public.request_role_assignments TO anon;
GRANT UPDATE, INSERT, SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.request_role_assignments TO authenticated;
GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.request_role_assignments TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.subcategory_master TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.subcategory_master TO authenticated;
GRANT SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, INSERT ON public.subcategory_master TO service_role;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.tasks TO anon;
GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.tasks TO authenticated;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.tasks TO service_role;
GRANT REFERENCES, SELECT, UPDATE, DELETE, INSERT, TRUNCATE, TRIGGER ON public.team_group_members TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.team_group_members TO authenticated;
GRANT TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.team_group_members TO service_role;
GRANT SELECT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT ON public.team_groups TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.team_groups TO authenticated;
GRANT SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE ON public.team_groups TO service_role;
GRANT REFERENCES, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, TRIGGER ON public.team_relationships TO anon;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.team_relationships TO authenticated;
GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.team_relationships TO service_role;
GRANT TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.teams TO anon;
GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.teams TO authenticated;
GRANT TRIGGER, REFERENCES, TRUNCATE, INSERT, SELECT, UPDATE, DELETE ON public.teams TO service_role;
GRANT TRIGGER, REFERENCES, TRUNCATE, INSERT, SELECT, UPDATE, DELETE ON public.transfers TO anon;
GRANT TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.transfers TO authenticated;
GRANT TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.transfers TO service_role;
GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.user_groups TO anon;
GRANT UPDATE, INSERT, SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.user_groups TO authenticated;
GRANT SELECT, INSERT, REFERENCES, TRUNCATE, DELETE, UPDATE, TRIGGER ON public.user_groups TO service_role;
GRANT REFERENCES, TRIGGER, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.user_team_defaults TO anon;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.user_team_defaults TO authenticated;
GRANT SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE ON public.user_team_defaults TO service_role;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.user_teams TO anon;
GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.user_teams TO authenticated;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.user_teams TO service_role;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.users TO anon;
GRANT REFERENCES, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, TRIGGER ON public.users TO authenticated;
GRANT SELECT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT ON public.users TO service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
