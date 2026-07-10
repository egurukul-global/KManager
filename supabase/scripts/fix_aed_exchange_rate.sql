-- Fix mis-stored AED exchange rate for Dubai Operations team
-- Problem: rate stored as from=AED, to=USD, rate=3.76
-- App was reading 1/3.76 = 0.266 as multiplier, inflating AED balances ~14x
--
-- Run Step 1 to inspect, then Step 2 to fix.

-- STEP 1 — Inspect current AED rate rows
SELECT id, team_id, date, from_currency, to_currency, rate, is_deleted
FROM exchange_rates
WHERE team_id = '2ed87e1a-89cb-442c-8920-1b88c4e61e78'
  AND is_deleted = false
  AND (from_currency = 'AED' OR to_currency = 'AED')
ORDER BY date DESC;

-- STEP 2 — Correct to standard form: 1 USD = 3.76 AED
-- (Adjust rate value if your actual rate differs)
UPDATE exchange_rates
SET from_currency = 'USD',
    to_currency = 'AED',
    rate = 3.76
WHERE team_id = '2ed87e1a-89cb-442c-8920-1b88c4e61e78'
  AND is_deleted = false
  AND from_currency = 'AED'
  AND to_currency = 'USD'
  AND date = '2026-07-10';

-- STEP 3 — Verify expected dashboard total (~$4,359)
WITH latest_rates AS (
  SELECT DISTINCT ON (currency) currency, usd_multiplier
  FROM (
    SELECT
      CASE
        WHEN er.from_currency = 'USD' AND er.to_currency <> 'USD' THEN er.to_currency
        WHEN er.to_currency = 'USD' AND er.from_currency <> 'USD' THEN er.from_currency
      END AS currency,
      CASE
        WHEN er.from_currency = 'USD' AND er.to_currency <> 'USD' THEN
          CASE WHEN er.to_currency IN ('INR','XOF','AED') AND er.rate < 1 THEN 1/er.rate ELSE er.rate END
        WHEN er.to_currency = 'USD' AND er.from_currency <> 'USD' THEN
          CASE WHEN er.from_currency IN ('INR','XOF','AED') AND er.rate > 1 THEN er.rate ELSE 1/er.rate END
        ELSE NULL
      END AS usd_multiplier,
      er.date
    FROM exchange_rates er
    WHERE er.team_id = '2ed87e1a-89cb-442c-8920-1b88c4e61e78'
      AND er.is_deleted = false
  ) n
  WHERE currency IS NOT NULL
  ORDER BY currency, date DESC
)
SELECT
  b.name,
  b.currency,
  b.balance AS balance_local,
  ROUND(
    CASE
      WHEN b.currency = 'USD' THEN b.balance
      ELSE b.balance / r.usd_multiplier
    END::numeric, 2
  ) AS balance_usd
FROM buckets b
LEFT JOIN latest_rates r ON r.currency = b.currency
WHERE b.team_id = '2ed87e1a-89cb-442c-8920-1b88c4e61e78'
  AND b.is_deleted = false
  AND b.owner_user_id IS NULL
ORDER BY b.name;
