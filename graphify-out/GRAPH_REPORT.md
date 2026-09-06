# Graph Report - KManager-test  (2026-09-06)

## Corpus Check
- Large corpus: 674 files · ~415,963 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1677 nodes · 4618 edges · 208 communities (84 shown, 80 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 96 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Approval Portal & Approval Engine
- Expense Reports & Report Helpers
- Team Mgmt & Balance Guards
- Konnect
- Main & Design Preview
- User Mgmt & User Mgmt Access
- Transfer Restored & Personal Team Helpers
- Ok Access & Ok Shell
- Transfer & Transfer Actions
- Ok Admin & Tasks
- Generate Receipt & Receipt Helpers
- Expenses & Expense Helpers
- Budgets & Currency
- Currency & Financial Status Helpers
- Spending Pattern & App Roles
- Buckets & Bucket Visibility
- Reconcile & Budget Calendar
- Budget Templates & Budget Types
- Tasks
- Budget Status & Budgets
- Budget Calendar & Dashboard
- Reconciliation Overview & Reconcile Scope
- Nav Permissions & Ok Access
- Main & Auth
- Categories & Ui Helpers
- Expenses & Db
- Income & Budgets
- Budget Templates & Category Master
- 021 Reconciliation Approval & 019 Phase4a Foundation
- Db & Expenses
- Budgets & Budget Calendar
- Financial Status & Financial Status Helpers
- Reconciliation Approval & Financial Status Helpers
- Ok Home & Ok Access
- Budget Calendar
- User Team Defaults & Expenses
- Budget Types
- Team Access & My Income
- Role Assignments & Approval Access
- Profile & Request Numbers
- Transfer Actions & Transfer Helpers
- Currency & Budgets
- Rates & Currency
- I18n & Formatters
- Manager Expenses & Ui Helpers
- Category Master
- Transfer Constants & My Finances
- 020 Phase4b Approval Flows & 038 Extend Budget Flow To Fip
- 067 Secure Approval And Budget Workflow
- Toasts & App Role Manager
- Receipt Scanner
- 030 Approval Messages Fk And Ok Notify
- Expenses & Expense Helpers
- Index.ts
- 028 One Kailasa Shell
- 031 Approver Step Scope And Team Access
- 033 Approval Review Read Linked Records
- Budget Types & Budgets
- 034 Cao Not Fih Notify
- 052 Fix Fin Fip Approval Role Mapping
- 064 Pure Role Based Approvals
- 065 User Team App Access
- 050 Auto Generate Task Number
- 035 Notification Summary And Clear
- 044 Konnect Hub
- 069 Fix Skip Level Trigger
- 071 Budget Payment Flow Changes
- 075 Update Budget Recon View
- 080 Receive Budget Payment Rpc
- Budgets
- Receipt Camera Scanner
- 017 Fix User Teams Rls Recursion
- 041 Core Tasks And Messages
- 066 Team Relationships
- 072 Budget Reconciliation
- 20260830000000 Generic App Roles Draft
- 057 Fix Income Trigger Local Amount
- 027 Fix Auth User Trigger
- 005 Reconciliation Submissions
- 016 Oht Team Roster
- 037 Skip Level Approvals
- 039 Create Approval Comments
- 051 Add Allowed Users To Chat Permissions
- 070 Secure Budget Plans State Changes
- 076 Phase1 Foundation
- 20260830000001 Fix All Fih Rls
- Login
- Migrate
- Refresh
- Verify
- Supabase Proxy
- category_master
- Index.ts
- Index.ts
- 008 User Team Defaults
- 011 Team Management Rls
- 012 Fix Users Rls Recursion
- 043 Ok App Admins
- 059 Create Expense Attachments
- 060 Create Report Logs
- 068 Fix Budget Plans Trigger
- 079 Pending Budget Transfers Rpc
- 081 Income Source
- 004 Expense Receipts
- budget_calendar_entries
- categories
- income
- public.bucket_access
- public.buckets
- public.budget_type_template_assignments
- public.budget_type_templates
- public.budget_types
- public.categories
- public.exchange_rates
- public.messages
- public.ok_app_access
- public.ok_home_pins
- public.ok_menu_access
- expenses
- buckets
- teams
- user_teams
- expenses
- transfers
- buckets
- teams
- transfers
- teams
- budget_plans
- users
- user_teams
- users
- users
- users
- budget_plans
- public.ok_messages
- public.ok_messages
- public.users
- public.budget_plans
- public.approval_requests
- public.teams
- public.users
- budget_plans
- expenses
- public.users
- public.budget_plans
- public.budget_plans
- public.expenses
- public.income
- public.transfers
- public.chat_permissions
- public.teams
- public.tasks
- public.budget_plans
- public.transfers
- buckets
- transfers
- buckets
- public.users
- public.users
- public.expenses
- public.income
- public.budget_plans
- buckets

## God Nodes (most connected - your core abstractions)
1. `showToast()` - 152 edges
2. `showPage()` - 77 edges
3. `state` - 53 edges
4. `showConfirm()` - 49 edges
5. `supabaseClient` - 48 edges
6. `sbSelect()` - 43 edges
7. `cardRow()` - 43 edges
8. `isFinanceGlobalAdmin()` - 30 edges
9. `sbInsert()` - 29 edges
10. `btnIconDelete()` - 26 edges

## Surprising Connections (you probably didn't know these)
- `initiateCloseBudget()` --calls--> `showToast()`  [EXTRACTED]
  src/pages/budgets.js → src/components/toasts.js
- `validateReceiptFormData()` --calls--> `showToast()`  [EXTRACTED]
  src/pages/generate-receipt.js → src/components/toasts.js
- `saveProfileViewSettings()` --calls--> `showToast()`  [EXTRACTED]
  src/pages/profile.js → src/components/toasts.js
- `sendUserPasswordReset()` --calls--> `showToast()`  [EXTRACTED]
  src/pages/user-mgmt.js → src/components/toasts.js
- `getBudgetPlansForTeam()` --calls--> `localGetAll()`  [EXTRACTED]
  src/pages/income.js → src/db.js

## Import Cycles
- None detected.

## Communities (208 total, 80 thin omitted)

### Community 0 - "Approval Portal & Approval Engine"
Cohesion: 0.06
Nodes (95): applyDeepLinkFilters(), buildReconReviewBody(), buildTransferReviewBody(), closeApprovalActionModal(), countActionableSelected(), escapeHtml(), fmtPortal(), getFilters() (+87 more)

### Community 1 - "Expense Reports & Report Helpers"
Cohesion: 0.06
Nodes (69): exportReportToCSV(), exportReportToPDF(), fetchAndEmbedReceipts(), filterExpenses(), filterIncomeByDates(), getBucketName(), getBudgetName(), getTeamName() (+61 more)

### Community 2 - "Team Mgmt & Balance Guards"
Cohesion: 0.09
Nodes (50): ACCESS_LEVELS, addTeamMember(), addTeamRelationship(), backfillMemberBucketsForTeam(), canAccessTeamsPage(), canCreateTeamsOnPage(), createOhtTeam(), deleteTeam() (+42 more)

### Community 3 - "Konnect"
Cohesion: 0.08
Nodes (39): activeRoster, allMessages, allowedNewChatUsers, backToChatsList(), cancelReply(), closeKonnectModals(), conversationsList, createGroupChatSubmit() (+31 more)

### Community 4 - "Main & Design Preview"
Cohesion: 0.10
Nodes (38): syncAll(), app, navToTab(), openDeepLink(), PAGE_TITLES, PAGE_TO_TAB, renderAppShell(), renderKonnectPage() (+30 more)

### Community 5 - "User Mgmt & User Mgmt Access"
Cohesion: 0.10
Nodes (39): removeModal(), ACCESS_LEVELS, allUsersData, buildApprovalRolesSection(), buildOnHoldStatusHtml(), buildWorkTeamsSection(), closeUserSelectModal(), createAppUser() (+31 more)

### Community 6 - "Transfer Restored & Personal Team Helpers"
Cohesion: 0.11
Nodes (39): auditLog(), executeFundsTransfer(), loadTeamBuckets(), onCrossTeamToggle(), populateSourceSelect(), acceptTransferFromDashboard(), auditLog(), destFilterState (+31 more)

### Community 7 - "Ok Access & Ok Shell"
Cohesion: 0.11
Nodes (30): renderComingSoon(), renderOkProfile(), getOkAdminPage(), getComingSoonPage(), initComingSoonPage(), escapeHtml(), getOkProfilePage(), initOkProfilePage() (+22 more)

### Community 8 - "Transfer & Transfer Actions"
Cohesion: 0.09
Nodes (39): applyViewTransfersFilters(), destFilterState, escapeHtml(), exchangeRatesCache, initTransferFundsPage(), initViewTransfersPage(), isPaymentUser(), loadExchangeRates() (+31 more)

### Community 9 - "Ok Admin & Tasks"
Cohesion: 0.13
Nodes (37): showConfirm(), showToast(), confirmDeleteBucket(), executeBulkDelete(), allUsers, buildApprovalRolesSection(), closeUserSelectModal(), escapeHtml() (+29 more)

### Community 10 - "Generate Receipt & Receipt Helpers"
Cohesion: 0.12
Nodes (29): bindReceiptItemHandlers(), canEditReceipt(), canViewAllReceipts(), captureReceiptPng(), currencyOptionsHtml(), getFilteredReceipts(), getGenerateReceiptPage(), initGenerateReceiptPage() (+21 more)

### Community 11 - "Expenses & Expense Helpers"
Cohesion: 0.12
Nodes (31): auditLog(), canEditExpense(), clearExpenseDefaultsPanel(), clearExpenseSelection(), closeEditExpenseModal(), deleteExpense(), deleteSelectedExpenses(), exchangeRatesCache (+23 more)

### Community 12 - "Budgets & Currency"
Cohesion: 0.09
Nodes (27): buildBudgetReviewBody(), backToBudgetList(), calendarEntriesCache, getActiveHeaderCurrency(), getCreateBudgetHeaderCurrency(), getEditBudgetHeaderCurrency(), getWizardStepsForBudget(), initiateCloseBudget() (+19 more)

### Community 13 - "Currency & Financial Status Helpers"
Cohesion: 0.15
Nodes (28): ALLOCATION_TOLERANCE, allocationsExceedIncome(), bucketAmountForEdit(), calcLocalFromUsd(), convertToUsd(), findTransferRate(), formatUsdDisplay(), HIGH_MULTIPLIER_CURRENCIES (+20 more)

### Community 14 - "Spending Pattern & App Roles"
Cohesion: 0.12
Nodes (25): cachedTeamReportData, getFilteredTeamReportData(), getManagerTeamReportPage(), isApprovedBudget(), loadTeamReportData(), buildMonthRange(), escapeHtmlAttr(), getBudgetedAmount() (+17 more)

### Community 15 - "Buckets & Bucket Visibility"
Cohesion: 0.14
Nodes (21): allAssignUsers, allBuckets, exchangeRates, initBucketsPage(), isDuplicateBucketName(), loadBucketData(), loadBucketForEdit(), loadBuckets() (+13 more)

### Community 16 - "Reconcile & Budget Calendar"
Cohesion: 0.15
Nodes (23): buildReconcileRows(), cachedBuckets, cachedExpenses, cachedIncome, cachedRates, cachedTransfers, formatReconAmount(), formatStoredDifference() (+15 more)

### Community 17 - "Budget Templates & Budget Types"
Cohesion: 0.17
Nodes (24): allBudgetTypes, assignmentsList, assignTemplateToType(), categoriesList, closeTemplateModal(), deleteTemplate(), escapeHtml(), formatDate() (+16 more)

### Community 18 - "Tasks"
Cohesion: 0.16
Nodes (21): activeTasks, closeTaskModal(), escapeHtml(), generateTaskNumberForTeam(), getTeamLeadForTeam(), handleModalTeamChange(), handleTaskPasteEvent(), loadTaskDiscussions() (+13 more)

### Community 19 - "Budget Status & Budgets"
Cohesion: 0.18
Nodes (22): getCreateBudgetPage(), renderBudgetReviewHtml(), renderBudgetSummaryTable(), renderWizardDetailsHtml(), setEditBudgetFormLocked(), submitBudgetApprovalHandler(), canSubmitBudgetApproval(), BUDGET_STATUS (+14 more)

### Community 20 - "Budget Calendar & Dashboard"
Cohesion: 0.19
Nodes (20): escapeHtmlAttr(), formatUsd(), getDashboardPage(), initDashboardPage(), renderAlerts(), acceptTransferFromDashboard(), rejectTransferFromDashboard(), DATE_CN_BUDGET_NAME_WARNING (+12 more)

### Community 21 - "Reconciliation Overview & Reconcile Scope"
Cohesion: 0.19
Nodes (19): loadReconciliationStatus(), buildTeamOverviewRow(), closeReconOverviewDetail(), enumerateDates(), getReconciliationOverviewPage(), initReconciliationOverviewPage(), loadOverview(), overviewRows (+11 more)

### Community 22 - "Nav Permissions & Ok Access"
Cohesion: 0.18
Nodes (21): applyNavPermissions(), canAccessPage(), canAccessTeamsPage(), defaultPageForRole(), defaultPageForTab(), FINANCE_PAGES, FINANCE_SETUP_PAGES, isOhtReadOnly() (+13 more)

### Community 23 - "Main & Auth"
Cohesion: 0.16
Nodes (20): clearOfflineSession(), getDB(), getOfflineSession(), migrateLegacyToken(), secureLogin(), secureLogout(), secureVerify(), storeOfflineSession() (+12 more)

### Community 24 - "Categories & Ui Helpers"
Cohesion: 0.20
Nodes (18): closeModal(), createModal(), openModal(), allCategories, confirmDeleteCategory(), getCategoriesPage(), initCategoriesPage(), loadCategories() (+10 more)

### Community 25 - "Expenses & Db"
Cohesion: 0.17
Nodes (21): sbSelect(), canViewAllExpenses(), editExpense(), editSelectedExpense(), getExpenseManagerPage(), initAddExpensePage(), initExpenseManagerPage(), loadExchangeRates() (+13 more)

### Community 26 - "Income & Budgets"
Cohesion: 0.15
Nodes (18): ensureUnallocatedBudgetExists(), appendAllocationSummaryRow(), exchangeRatesCache, getBucketById(), getBudgetPlansForTeam(), getIncomeManagerPage(), getIncomeUsdEquivalent(), getRecordIncomePage() (+10 more)

### Community 27 - "Budget Templates & Category Master"
Cohesion: 0.17
Nodes (15): DEFAULT_CATEGORY_MASTER, flattenCategoryMaster(), ensureEditTemplateRowKeys(), buildBudgetCategoryRows(), flattenBudgetToCategoryLines(), toArray(), loadBudgetCategoryLinesForType(), loadCategoryMasterLines() (+7 more)

### Community 28 - "021 Reconciliation Approval & 019 Phase4a Foundation"
Cohesion: 0.15
Nodes (14): auth, approval_messages, approval_requests, auth.users, teams, approval_request_reconciliation_lines, public.apply_reconciliation_adjustment_request(), public.cancel_reconciliation_adjustment_request() (+6 more)

### Community 29 - "Db & Expenses"
Cohesion: 0.25
Nodes (17): clearPendingChange(), ensureAllObjectStores(), getPendingChanges(), initLocalDB(), localDelete(), localGet(), localGetAll(), localPut() (+9 more)

### Community 30 - "Budgets & Budget Calendar"
Cohesion: 0.16
Nodes (19): buildCategoryRowHtml(), buildCreateCategoryRow(), buildParentCategoryRow(), ensureExchangeRatesLoaded(), escapeHtmlAttr(), formatLocalInput(), getMonthlyBudgetNameFromEntry(), groupCategoryLinesForForm() (+11 more)

### Community 31 - "Financial Status & Financial Status Helpers"
Cohesion: 0.16
Nodes (17): cachedBuckets, cachedExpenses, cachedIncome, cachedRates, cachedTransfers, fmtAmount(), generateFinancialStatus(), getBucketsForFilter() (+9 more)

### Community 32 - "Reconciliation Approval & Financial Status Helpers"
Cohesion: 0.21
Nodes (17): cachedRates, canRequestApproval(), escapeHtml(), fmtAmount(), getReconciliationApprovalPage(), initReconciliationApprovalPage(), loadReconciliationApproval(), mismatchRows (+9 more)

### Community 33 - "Ok Home & Ok Access"
Cohesion: 0.23
Nodes (16): renderOkHome(), appInitial(), appLogoSrc(), detailLine(), escapeHtml(), getOkHomePage(), initOkHomePage(), loadNotifications() (+8 more)

### Community 34 - "Budget Calendar"
Cohesion: 0.21
Nodes (16): calendarEntriesList, calendarStatusBadge(), deleteCalendarEntry(), editCalendarEntry(), filterEntriesByYear(), getBudgetCalendarPage(), initBudgetCalendarPage(), isOrgAdmin() (+8 more)

### Community 35 - "User Team Defaults & Expenses"
Cohesion: 0.26
Nodes (15): applyExpenseDefaults(), saveExpenseDefaultsFromPanel(), applyDefaultsToIncomeForm(), applyDefaultsToTransferForm(), cacheKey(), clearUserTeamDefaults(), EMPTY_TEAM_DEFAULTS, fetchFromDatabase() (+7 more)

### Community 36 - "Budget Types"
Cohesion: 0.29
Nodes (14): budgetTypesList, closeBudgetTypeModal(), deleteBudgetType(), escapeHtml(), formatDate(), getBudgetTypesPage(), getEditBudgetTypeModal(), initBudgetTypesPage() (+6 more)

### Community 37 - "Team Access & My Income"
Cohesion: 0.22
Nodes (11): escapeHtml(), formatUsd(), initMyIncomePage(), computePermissions(), state, hasAnyGlobalFinanceRole(), loadAccessibleTeams(), loadTeamsFromRoleAssignments() (+3 more)

### Community 38 - "Role Assignments & Approval Access"
Cohesion: 0.29
Nodes (14): escapeHtml(), EXTENDED_ROLES, getAssignableRoles(), getRoleAssignmentsPage(), initRoleAssignmentsPage(), loadAssignments(), loadUsersCache(), ORG_ASSIGNABLE_ROLES (+6 more)

### Community 39 - "Profile & Request Numbers"
Cohesion: 0.29
Nodes (11): supabaseClient, escapeHtml(), getProfilePage(), initProfilePage(), saveProfileAlias(), saveProfileViewSettings(), formatRequestNumber(), saveUserRequestAlias() (+3 more)

### Community 40 - "Transfer Actions & Transfer Helpers"
Cohesion: 0.35
Nodes (13): acceptTransfer(), approveOhfTransfer(), auditLog(), cancelPendingTransfer(), createCrossTeamMirrorRecords(), loadTransferContext(), rejectTransfer(), isPendingTransfer() (+5 more)

### Community 41 - "Currency & Budgets"
Cohesion: 0.29
Nodes (13): markBudgetReceived(), updateMath(), onCreateBudgetCurrencyChange(), getBucketById(), onTransferAmountChange(), onTransferBucketChange(), getBucketById(), onTransferAmountChange() (+5 more)

### Community 42 - "Rates & Currency"
Cohesion: 0.33
Nodes (12): addRate(), allRates, canEditRates(), currencyOptionsHtml(), deleteRate(), getRatesPage(), initRatesPage(), loadRates() (+4 more)

### Community 43 - "I18n & Formatters"
Cohesion: 0.33
Nodes (9): getCurrentLanguage(), initI18n(), isRTL(), setDocumentDirection(), setLanguage(), t(), formatCurrency(), formatDate() (+1 more)

### Community 44 - "Manager Expenses & Ui Helpers"
Cohesion: 0.26
Nodes (11): repopulateBudgetNameFilter(), getManagerExpensesPage(), initManagerExpensesPage(), loadPendingExpenses(), mgrAttachmentsCache, mgrTeamCategoriesCache, pendingReviewsCache, processApproval() (+3 more)

### Community 45 - "Category Master"
Cohesion: 0.29
Nodes (10): addCategoryMaster(), addSubcategoryMaster(), deleteCategoryMaster(), deleteSubcategoryMaster(), getCategoryMasterPage(), initCategoryMasterPage(), isOrgAdmin(), loadMaster() (+2 more)

### Community 46 - "Transfer Constants & My Finances"
Cohesion: 0.35
Nodes (9): escapeHtml(), formatUsd(), initMyFinancesPage(), sumBucketBalancesToUsd(), MEMO_MAX_LENGTH, PENDING_STEP, TRANSFER_FLOW, TRANSFER_STATUS (+1 more)

### Community 47 - "020 Phase4b Approval Flows & 038 Extend Budget Flow To Fip"
Cohesion: 0.23
Nodes (10): approval_flow_definitions, approval_flow_steps, public.user_can_act_on_approval_request(), public.user_has_approval_role(), request_role_assignments, auth.users, teams, user_teams (+2 more)

### Community 48 - "067 Secure Approval And Budget Workflow"
Cohesion: 0.20
Nodes (10): public.enforce_approval_requests_integrity, public.enforce_budget_plans_integrity, public.enforce_approval_requests_integrity(), public.enforce_budget_plans_integrity(), public.get_next_active_workflow_step(), public.approval_flow_definitions, public.approval_flow_steps, public.users (+2 more)

### Community 49 - "Toasts & App Role Manager"
Cohesion: 0.35
Nodes (8): drawAppRoleManager(), renderAppRoleManager(), bodyHtml(), escapeHtml(), removeActiveAlert(), showAlert(), showPrompt(), handleForgotPassword()

### Community 50 - "Receipt Scanner"
Cohesion: 0.42
Nodes (8): extractDate(), extractMerchant(), extractTotal(), normalizeToIsoDate(), parseMoney(), parseReceipt(), scanAndParseReceipt(), scanReceipt()

### Community 51 - "030 Approval Messages Fk And Ok Notify"
Cohesion: 0.25
Nodes (5): public.approval_messages, public.users_with_approval_role(), public.request_role_assignments, public.user_teams, public.users

### Community 52 - "Expenses & Expense Helpers"
Cohesion: 0.36
Nodes (8): handleAddExpenseSubmit(), normalizeExpenseReceiptField(), recalcExpenseUsd(), updateRateSelect(), calcUsdFromBucketAmount(), buildExpensePayload(), calculateExpenseUsd(), resolveExpenseRate()

### Community 53 - "Index.ts"
Cohesion: 0.39
Nodes (7): asText(), buildPersonalTeamBaseName(), corsHeaders, ensurePersonalTeam(), fail(), reply(), resolvePersonalTeamName()

### Community 54 - "028 One Kailasa Shell"
Cohesion: 0.43
Nodes (7): public.is_ok_admin(), public.ok_admins, public.ok_app_access, public.ok_home_pins, public.ok_menu_access, public.ok_messages, public.users

### Community 55 - "031 Approver Step Scope And Team Access"
Cohesion: 0.25
Nodes (7): public.user_can_act_on_approval_request(), public.user_has_approval_role(), public.users_with_approval_role(), public.request_role_assignments, public.user_teams, public.users, user_teams

### Community 56 - "033 Approval Review Read Linked Records"
Cohesion: 0.36
Nodes (7): public.get_budget_plan_for_review(), public.get_transfer_for_review(), public.approval_requests, public.budget_plans, public.request_role_assignments, public.transfers, public.user_teams

### Community 57 - "Budget Types & Budgets"
Cohesion: 0.33
Nodes (6): applyEditBudgetNameState(), BUDGET_TYPES, getBudgetTypeConfig(), isMonthlyBudgetType(), isNamedBudgetType(), TYPE_BY_VALUE

### Community 58 - "034 Cao Not Fih Notify"
Cohesion: 0.29
Nodes (6): public.user_has_approval_role(), public.users_with_approval_role(), public.request_role_assignments, public.user_teams, public.users, user_teams

### Community 59 - "052 Fix Fin Fip Approval Role Mapping"
Cohesion: 0.29
Nodes (6): public.user_has_approval_role(), public.users_with_approval_role(), public.request_role_assignments, public.user_teams, public.users, user_teams

### Community 60 - "064 Pure Role Based Approvals"
Cohesion: 0.29
Nodes (6): public.user_has_approval_role(), public.users_with_approval_role(), public.request_role_assignments, public.user_teams, public.users, user_teams

### Community 61 - "065 User Team App Access"
Cohesion: 0.38
Nodes (6): public.ok_app_access, public.ok_menu_access, public.teams, public.users, temp_app_access, temp_menu_access

### Community 62 - "050 Auto Generate Task Number"
Cohesion: 0.33
Nodes (5): public.set_next_task_number, public.set_next_task_number(), public.tasks, public.teams, trg_set_next_task_number

### Community 64 - "044 Konnect Hub"
Cohesion: 0.53
Nodes (4): public.chat_group_members, public.chat_groups, public.is_group_member(), public.users

### Community 65 - "069 Fix Skip Level Trigger"
Cohesion: 0.47
Nodes (5): public.enforce_approval_requests_integrity(), public.user_can_act_on_approval_request(), public.approval_flow_definitions, public.approval_flow_steps, public.users

### Community 66 - "071 Budget Payment Flow Changes"
Cohesion: 0.40
Nodes (5): public.enforce_budget_plans_integrity(), public.insert_budget_payment_transfer(), public.app_role_assignments, public.approval_requests, public.users

### Community 67 - "075 Update Budget Recon View"
Cohesion: 0.33
Nodes (5): public.budget_reconciliation_view, public.budget_plans, public.expenses, public.teams, public.transfers

### Community 68 - "080 Receive Budget Payment Rpc"
Cohesion: 0.40
Nodes (5): public.accept_budget_payment_transfer(), public.get_pending_budget_payment_list(), public.budget_plans, public.teams, public.transfers

### Community 69 - "Budgets"
Cohesion: 0.70
Nodes (5): onCreateBudgetLocalChange(), recalculateAllBudgetUsdFromLocal(), recalculateBudgetUsdFromLocal(), updateBudgetFormTotals(), updateCreateBudgetTotals()

### Community 70 - "Receipt Camera Scanner"
Cohesion: 0.70
Nodes (4): canvasToReceiptFile(), loadOpenCv(), openReceiptCameraScanner(), openReceiptCameraScannerInner()

### Community 71 - "017 Fix User Teams Rls Recursion"
Cohesion: 0.50
Nodes (4): public.is_team_roster_manager(), public.user_is_oht(), public.teams, public.user_teams

### Community 72 - "041 Core Tasks And Messages"
Cohesion: 0.50
Nodes (4): public.messages, public.tasks, public.teams, public.users

### Community 73 - "066 Team Relationships"
Cohesion: 0.60
Nodes (4): public.get_parent_teams_recursive(), public.get_sub_teams_recursive(), public.team_relationships, public.teams

### Community 74 - "072 Budget Reconciliation"
Cohesion: 0.40
Nodes (4): budget_reconciliation_view, budget_plans, expenses, transfers

### Community 75 - "20260830000000 Generic App Roles Draft"
Cohesion: 0.50
Nodes (4): public.app_role_assignments, public.app_roles, public.teams, public.users

### Community 78 - "005 Reconciliation Submissions"
Cohesion: 0.67
Nodes (3): reconciliation_lines, reconciliation_submissions, auth.users

### Community 79 - "016 Oht Team Roster"
Cohesion: 0.50
Nodes (3): public.is_team_roster_manager(), public.teams, public.user_teams

### Community 80 - "037 Skip Level Approvals"
Cohesion: 0.50
Nodes (3): public.user_can_act_on_approval_request(), public.approval_flow_definitions, public.approval_flow_steps

### Community 81 - "039 Create Approval Comments"
Cohesion: 0.50
Nodes (3): public.approval_comments, public.approval_requests, public.users

### Community 82 - "051 Add Allowed Users To Chat Permissions"
Cohesion: 0.50
Nodes (3): public.can_chat_with(), public.chat_permissions, public.user_teams

### Community 83 - "070 Secure Budget Plans State Changes"
Cohesion: 0.50
Nodes (3): public.enforce_budget_plans_integrity(), public.approval_requests, public.users

### Community 84 - "076 Phase1 Foundation"
Cohesion: 0.50
Nodes (3): bucket_access, buckets, users

### Community 85 - "20260830000001 Fix All Fih Rls"
Cohesion: 0.50
Nodes (3): public.is_org_admin(), public.app_role_assignments, public.users

### Community 91 - "category_master"
Cohesion: 0.67
Nodes (3): category_master, subcategory_master, expenses

## Knowledge Gaps
- **153 isolated node(s):** `ALLOWED_ORIGINS`, `app`, `TAB_DEFAULT_PAGES`, `PAGE_TO_TAB`, `PAGE_TITLES` (+148 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 419 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **80 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `showToast()` connect `Ok Admin & Tasks` to `Approval Portal & Approval Engine`, `Expense Reports & Report Helpers`, `Team Mgmt & Balance Guards`, `Konnect`, `Main & Design Preview`, `User Mgmt & User Mgmt Access`, `Transfer Restored & Personal Team Helpers`, `Ok Access & Ok Shell`, `Transfer & Transfer Actions`, `Generate Receipt & Receipt Helpers`, `Expenses & Expense Helpers`, `Budgets & Currency`, `Spending Pattern & App Roles`, `Buckets & Bucket Visibility`, `Reconcile & Budget Calendar`, `Budget Templates & Budget Types`, `Tasks`, `Budget Status & Budgets`, `Budget Calendar & Dashboard`, `Reconciliation Overview & Reconcile Scope`, `Main & Auth`, `Categories & Ui Helpers`, `Expenses & Db`, `Income & Budgets`, `Budgets & Budget Calendar`, `Financial Status & Financial Status Helpers`, `Reconciliation Approval & Financial Status Helpers`, `Budget Calendar`, `User Team Defaults & Expenses`, `Budget Types`, `Role Assignments & Approval Access`, `Profile & Request Numbers`, `Currency & Budgets`, `Rates & Currency`, `Manager Expenses & Ui Helpers`, `Category Master`, `Toasts & App Role Manager`, `Expenses & Expense Helpers`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Why does `state` connect `Team Access & My Income` to `Approval Portal & Approval Engine`, `Expense Reports & Report Helpers`, `Team Mgmt & Balance Guards`, `Konnect`, `Main & Design Preview`, `User Mgmt & User Mgmt Access`, `Transfer Restored & Personal Team Helpers`, `Ok Access & Ok Shell`, `Transfer & Transfer Actions`, `Ok Admin & Tasks`, `Generate Receipt & Receipt Helpers`, `Expenses & Expense Helpers`, `Budgets & Currency`, `Spending Pattern & App Roles`, `Buckets & Bucket Visibility`, `Reconcile & Budget Calendar`, `Budget Templates & Budget Types`, `Tasks`, `Budget Status & Budgets`, `Budget Calendar & Dashboard`, `Reconciliation Overview & Reconcile Scope`, `Nav Permissions & Ok Access`, `Categories & Ui Helpers`, `Income & Budgets`, `Financial Status & Financial Status Helpers`, `Reconciliation Approval & Financial Status Helpers`, `Ok Home & Ok Access`, `Budget Calendar`, `User Team Defaults & Expenses`, `Budget Types`, `Role Assignments & Approval Access`, `Profile & Request Numbers`, `Transfer Actions & Transfer Helpers`, `Rates & Currency`, `Manager Expenses & Ui Helpers`, `Category Master`, `Transfer Constants & My Finances`, `Toasts & App Role Manager`, `Budget Types & Budgets`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `supabaseClient` connect `Profile & Request Numbers` to `Approval Portal & Approval Engine`, `Expense Reports & Report Helpers`, `Team Mgmt & Balance Guards`, `Konnect`, `Main & Design Preview`, `User Mgmt & User Mgmt Access`, `Transfer Restored & Personal Team Helpers`, `Ok Access & Ok Shell`, `Transfer & Transfer Actions`, `Ok Admin & Tasks`, `Expenses & Expense Helpers`, `Budgets & Currency`, `Spending Pattern & App Roles`, `Buckets & Bucket Visibility`, `Reconcile & Budget Calendar`, `Budget Templates & Budget Types`, `Tasks`, `Budget Calendar & Dashboard`, `Reconciliation Overview & Reconcile Scope`, `Income & Budgets`, `Budget Templates & Category Master`, `Db & Expenses`, `Reconciliation Approval & Financial Status Helpers`, `Ok Home & Ok Access`, `Budget Calendar`, `User Team Defaults & Expenses`, `Budget Types`, `Team Access & My Income`, `Role Assignments & Approval Access`, `Transfer Actions & Transfer Helpers`, `Manager Expenses & Ui Helpers`, `Category Master`, `Transfer Constants & My Finances`, `Toasts & App Role Manager`, `Budget Types & Budgets`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Are the 65 inferred relationships involving `showPage()` (e.g. with `getApprovalPortalPage()` and `initApprovalPortalPage()`) actually correct?**
  _`showPage()` has 65 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ALLOWED_ORIGINS`, `app`, `TAB_DEFAULT_PAGES` to the rest of the system?**
  _153 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Approval Portal & Approval Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.057661788044436606 - nodes in this community are weakly interconnected._
- **Should `Expense Reports & Report Helpers` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._