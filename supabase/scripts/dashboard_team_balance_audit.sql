-- =============================================================================
-- Dashboard team balance audit
--
-- IMPORTANT: Supabase SQL Editor shows ONLY THE LAST query when you run
-- multiple statements. Run each "STEP" separately (highlight + Run).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1 — Run this alone: find your team UUID
-- -----------------------------------------------------------------------------
SELECT id AS team_id, name AS team_name FROM teams ORDER BY name;


-- -----------------------------------------------------------------------------
-- STEP 2 — Run this alone: ALL buckets + dashboard total in ONE result set
-- Replace YOUR_TEAM_ID with the UUID from Step 1
-- -----------------------------------------------------------------------------

WITH latest_rates AS (
  SELECT DISTINCT ON (currency)
    currency,
    usd_multiplier
  FROM (
    SELECT
      CASE
        WHEN er.from_currency = 'USD' AND er.to_currency <> 'USD' THEN er.to_currency
        WHEN er.to_currency = 'USD' AND er.from_currency <> 'USD' THEN er.from_currency
      END AS currency,
      CASE
        WHEN er.from_currency = 'USD' AND er.to_currency <> 'USD' THEN
          CASE WHEN er.to_currency IN ('INR', 'XOF', 'AED') AND er.rate < 1 THEN 1 / er.rate ELSE er.rate END
        WHEN er.to_currency = 'USD' AND er.from_currency <> 'USD' THEN 1 / er.rate
      END AS usd_multiplier,
      er.date
    FROM exchange_rates er
    WHERE er.team_id = 'YOUR_TEAM_ID'
      AND er.is_deleted = false
  ) n
  WHERE currency IS NOT NULL AND usd_multiplier IS NOT NULL
  ORDER BY currency, date DESC
),

team_converted AS (
  SELECT
    b.name,
    b.currency,
    b.balance AS balance_local,
    CASE
      WHEN NULLIF(TRIM(b.currency), '') IS NULL THEN NULL
      WHEN b.currency = 'USD' THEN ROUND(b.balance::numeric, 2)
      WHEN r.usd_multiplier IS NULL THEN NULL
      ELSE ROUND((b.balance / r.usd_multiplier)::numeric, 2)
    END AS balance_usd,
    CASE
      WHEN NULLIF(TRIM(b.currency), '') IS NULL THEN 'EXCLUDED: no currency'
      WHEN b.currency = 'USD' THEN 'included'
      WHEN r.usd_multiplier IS NULL THEN 'EXCLUDED: no rate'
      ELSE 'included'
    END AS status
  FROM buckets b
  LEFT JOIN latest_rates r ON r.currency = b.currency
  WHERE b.team_id = 'YOUR_TEAM_ID'
    AND b.is_deleted = false
    AND b.owner_user_id IS NULL
),

personal_buckets AS (
  SELECT
    b.name,
    b.currency,
    b.balance AS balance_local,
    u.email AS owner_email,
    CASE
      WHEN NULLIF(TRIM(b.currency), '') IS NULL THEN NULL
      WHEN b.currency = 'USD' THEN ROUND(b.balance::numeric, 2)
      WHEN r.usd_multiplier IS NULL THEN NULL
      ELSE ROUND((b.balance / r.usd_multiplier)::numeric, 2)
    END AS balance_usd
  FROM buckets b
  LEFT JOIN latest_rates r ON r.currency = b.currency
  LEFT JOIN auth.users u ON u.id = b.owner_user_id
  WHERE b.team_id = 'YOUR_TEAM_ID'
    AND b.is_deleted = false
    AND b.owner_user_id IS NOT NULL
),

dashboard_total AS (
  SELECT ROUND(COALESCE(SUM(balance_usd), 0)::numeric, 2) AS total_usd
  FROM team_converted
  WHERE status = 'included'
)

SELECT
  '1_TEAM_BUCKET' AS section,
  tc.name,
  tc.currency,
  tc.balance_local,
  tc.balance_usd,
  tc.status AS notes,
  NULL::text AS owner_email
FROM team_converted tc

UNION ALL

SELECT
  '2_PERSONAL_BUCKET',
  pb.name,
  pb.currency,
  pb.balance_local,
  pb.balance_usd,
  'NOT in dashboard team balance',
  pb.owner_email
FROM personal_buckets pb

UNION ALL

SELECT
  '3_DASHBOARD_TOTAL',
  '>>> Team balance on Dashboard',
  'USD',
  NULL,
  dt.total_usd,
  'Sum of section 1 rows marked included',
  NULL
FROM dashboard_total dt

ORDER BY section, name;


-- -----------------------------------------------------------------------------
-- STEP 3 (optional) — Run alone if Step 2 returns no team buckets but
-- dashboard still shows a balance: list ALL buckets in database
-- -----------------------------------------------------------------------------
SELECT
  t.name AS team_name,
  b.name AS bucket_name,
  b.currency,
  b.balance,
  CASE WHEN b.owner_user_id IS NULL THEN 'TEAM (in dashboard)' ELSE 'PERSONAL' END AS bucket_kind,
  b.team_id,
  b.is_deleted
FROM buckets b
JOIN teams t ON t.id = b.team_id
WHERE b.is_deleted = false
ORDER BY t.name, bucket_kind, b.name;
