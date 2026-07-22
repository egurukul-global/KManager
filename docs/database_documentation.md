# One Kailasa Database Schema Documentation

This document serves as the single source of truth for the database schema, custom PL/pgSQL functions, triggers, and Row-Level Security (RLS) policies of the One Kailasa system.

---

## 1. Core Tables

### `public.users`
Stores user profile information and global organization roles.
* `id` (`UUID`, PK): Matches the Supabase Auth user ID.
* `name` (`TEXT`): User's display name.
* `email` (`TEXT`, Unique): User's primary email.
* `role` (`TEXT`): Global org role (`user`, `fin`, `fip`, `oh`, `caoh`, `ceo`, `admin`).
* `gender` (`TEXT`): Monastic category classification (`male`, `female`).
* `clearance_level` (`TEXT`): Messaging access clearance (`restricted`, `standard`, `supervisor`).
* `escalation_tokens` (`INTEGER`): Count of remaining escalation strikes (0 to 3, default 3).
* `created_at` (`TIMESTAMPTZ`): Profile creation date.

### `public.teams`
Groups of users representing departments, geographic locations, or projects.
* `id` (`UUID`, PK): Unique team identifier.
* `name` (`TEXT`, Unique): Display name of the team.
* `is_personal_team` (`BOOLEAN`): Set to true for private individual work teams.
* `has_budget_access` (`BOOLEAN`): True if team has Budget and Expense features active.
* `has_tasks_access` (`BOOLEAN`): True if team has Task and Issue Tracker active.
* `has_lms_access` (`BOOLEAN`): True if team has Gurukul LMS features active.
* `created_at` (`TIMESTAMPTZ`): Creation timestamp.

### `public.user_teams`
Maps users to teams with specific permission levels.
* `id` (`UUID`, PK): Unique association ID.
* `user_id` (`UUID`): References `public.users(id)`.
* `team_id` (`UUID`): References `public.teams(id)`.
* `access_level` (`TEXT`): Member permission (`view`, `member` [OPS], `lead` [OPL], `oht` [OPH], `admin`).
* `is_active` (`BOOLEAN`): Set to false to temporarily suspend membership.

### `public.approval_requests`
Primary table for workflows requiring approval (budgets, transfers, reconciliations).
* `id` (`UUID`, PK)
* `request_number` (`TEXT`, Unique): Automated identifier (e.g. `REQ-10023`).
* `request_type` (`TEXT`): Workflow class (`budget`, `money_transfer`, `reconciliation_adjustment`).
* `status` (`TEXT`): Flow status state (e.g., `DRAFT`, `SUBMITTED`, `CAO-REVIEWED`, `PAID`, `RECEIVED`).
* `current_step_order` (`INTEGER`): Active sequential step index in the flow.
* `current_role_code` (`TEXT`): Active role code (e.g. `FIN`, `FIH`, `CAO`, `FIP`).
* `clarified_by_role` (`TEXT`): Stores the role that initiated a clarification loop to return it back on reply.
* `team_id` (`UUID`): References `public.teams(id)`.

### `public.tasks`
Unified common task tracker for all applications.
* `id` (`UUID`, PK)
* `task_number` (`TEXT`, Unique): Human-friendly prefix ID (e.g. `GUR-100024`, `FIN-000456`).
* `title` (`TEXT`), `description` (`TEXT`)
* `status` (`TEXT`): `'todo'`, `'in_progress'`, `'completed'`, `'backlog'`.
* `priority` (`TEXT`): `'low'`, `'medium'`, `'high'`.
* `assigned_to` (`UUID`): References `public.users(id)`.
* `team_id` (`UUID`): References `public.teams(id)`.
* `context_app` (`TEXT`): App code identifier (`finance`, `gurukul`, `legal`).
* `context_id` (`UUID`): Polymorphic reference.
* `metadata` (`JSONB`): Variable custom fields.

### `public.messages`
Unified common communication log (Direct messages, team chats, role queues, and system notifications).
* `id` (`UUID`, PK)
* `sender_id` (`UUID`): References `public.users(id)`.
* `recipient_type` (`TEXT`): `'user'`, `'team'`, `'role'`.
* `recipient_id` (`TEXT`): Holds target UUID or Role Code.
* `body` (`TEXT`): Text content.
* `attachment_url` (`TEXT`), `attachment_name` (`TEXT`): File attachments (R2 keys).
* `allow_replies` (`BOOLEAN`): False for read-only instructions or system logs.
* `metadata` (`JSONB`): Direct deep-links and custom parameters.

### `public.ok_app_admins`
Maps app codes (modules) to specific users as local app/module administrators.
* `id` (`UUID`, PK)
* `app_code` (`TEXT`): Code of the application (e.g. `'finance'`, `'gurukul'`).
* `user_id` (`UUID`): References `public.users(id)`.
* `created_at` (`TIMESTAMPTZ`): Creation timestamp.

---

## 2. Core Custom Functions

### `public.user_has_approval_role(p_user_id UUID, p_role_code TEXT, p_team_id UUID)`
Evaluates if a user has permission to act under a given approval step role:
* Returns `true` if they hold the active assignment in `request_role_assignments` for that team or globally.
* Maps built-in roles (e.g., `oh` acts as `FIH`, `caoh` acts as `CAO`, `oh/caoh` can act as `FIP`).
* Mapped inside `supabase/migrations/038_extend_budget_flow_to_fip.sql`.

### `public.user_can_act_on_approval_request(p_request_id UUID)`
Determines if the active user can approve or reject the request:
* Evaluates if the user has the role matching the request's `current_role_code`.
* Supports skip-level approval rules (allowing higher-step users to claim lower-step actions).
* Mapped inside `supabase/migrations/037_skip_level_approvals.sql`.

---

## 3. Konnect Messaging Tables (Phase 4)

### `public.chat_groups`
Ad-hoc user-created groups.
* `id` (`UUID`, PK)
* `name` (`TEXT`): Display name of the custom group.
* `created_by` (`UUID`): References `public.users(id)`.

### `public.chat_group_members`
Association table for custom groups.
* `group_id` (`UUID`): References `public.chat_groups(id)`.
* `user_id` (`UUID`): References `public.users(id)`.

### `public.chat_preferences`
Personal pinning preferences.
* `user_id` (`UUID`): References `public.users(id)`.
* `chat_target_type` (`TEXT`): `'user'`, `'team'`, `'group'`.
* `chat_target_id` (`TEXT`): Target identifier.
* `is_pinned` (`BOOLEAN`): True if user pinned this conversation.

### `public.chat_permissions`
Cross-gender and cross-team security filters.
* `user_id` (`UUID`, PK): References `public.users(id)`.
* `allow_opposite_gender` (`BOOLEAN`): Enables messaging users of opposite gender.
* `cross_team_access` (`TEXT`): `'none'`, `'team'`, `'global'`.

---

## 4. Konnect Helper Functions

### `public.can_chat_with(user_a UUID, user_b UUID)`
Checks whether user_a is authorized to send direct messages to user_b.
* Blocks messaging if genders differ unless both have `allow_opposite_gender = true`.
* Restricts messaging boundaries if cross-team rules are `'none'` (restricting to shared teams).

---

## 5. RLS Policies Added / Modified
* **`public.messages`**:
  * `select_messages`: Allows reading messages sent by you, sent directly to you (passing `can_chat_with`), shared in your teams, shared in your custom groups, or role assignments matching CAO/FIH.
  * `insert_messages`: Allows sending messages to direct/group/team recipients if authorized.
  * `update_messages`: Allows updating messages (specifically `read_at`) if you are the sender, direct recipient, or a member of the target team or group.
* **`public.chat_groups` & `public.chat_group_members`**:
  * Restricts access to group creators and group members using recursion-safe `is_group_member` checks.


