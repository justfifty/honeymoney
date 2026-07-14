-- ============================================================================
-- HoneyMoney — demo seed: one household with a full 3-Bucket graph + spend.
-- Run AFTER 0001_init_graph.sql. Fixed UUIDs so DEMO_TENANT_ID is stable.
-- Put this tenant id in web/.env.local as DEMO_TENANT_ID.
-- ============================================================================

-- Demo tenant --------------------------------------------------------------
insert into tenants (id, kind, name, base_currency) values
  ('11111111-1111-1111-1111-111111111111', 'household', 'The Rahman Household', 'MYR')
on conflict (id) do nothing;

-- Members ------------------------------------------------------------------
insert into members (id, tenant_id, display_name, role) values
  ('a0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Aiman', 'owner'),
  ('a0000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'Siti', 'member')
on conflict (id) do nothing;

-- Income source ------------------------------------------------------------
insert into nodes (id, tenant_id, kind, label, props) values
  ('20000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'income_source', 'Salary', '{"monthly_amount": 6000, "cadence": "monthly"}')
on conflict (id) do nothing;

-- Buckets (Bucket 1 must-paid / Bucket 2 savings / Bucket 3 spendings) ------
insert into nodes (id, tenant_id, kind, label, props) values
  ('b0000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 'bucket', 'Rent',              '{"bucket": 1}'),
  ('b0000000-0000-0000-0000-0000000000b2', '11111111-1111-1111-1111-111111111111', 'bucket', 'Utilities',         '{"bucket": 1}'),
  ('b0000000-0000-0000-0000-0000000000b3', '11111111-1111-1111-1111-111111111111', 'bucket', 'Education',         '{"bucket": 1}'),
  ('b0000000-0000-0000-0000-0000000000b4', '11111111-1111-1111-1111-111111111111', 'bucket', 'Savings',           '{"bucket": 2}'),
  ('b0000000-0000-0000-0000-0000000000b5', '11111111-1111-1111-1111-111111111111', 'bucket', 'Groceries',         '{"bucket": 3, "default_spend": true}'),
  ('b0000000-0000-0000-0000-0000000000b6', '11111111-1111-1111-1111-111111111111', 'bucket', 'Personal — Aiman',  '{"bucket": 3, "private": true}'),
  ('b0000000-0000-0000-0000-0000000000b7', '11111111-1111-1111-1111-111111111111', 'bucket', 'Personal — Siti',   '{"bucket": 3, "private": true}')
on conflict (id) do nothing;

-- Goal ---------------------------------------------------------------------
insert into nodes (id, tenant_id, kind, label, props) values
  ('90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'goal', 'House Deposit', '{"target": 30000, "current": 7200}')
on conflict (id) do nothing;

-- Vendors ------------------------------------------------------------------
insert into nodes (id, tenant_id, kind, label, props) values
  ('c0000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'vendor', 'Lotus''s',     '{}'),
  ('c0000000-0000-0000-0000-0000000000c2', '11111111-1111-1111-1111-111111111111', 'vendor', 'GrabFood',     '{}'),
  ('c0000000-0000-0000-0000-0000000000c3', '11111111-1111-1111-1111-111111111111', 'vendor', 'ShopeePay',    '{}')
on conflict (id) do nothing;

-- Allocation edges: Salary -> buckets --------------------------------------
insert into edges (tenant_id, src_node, dst_node, rel, amount, cadence) values
  ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000b1', 'ALLOCATES_FIXED', 1200, 'monthly'),
  ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000b2', 'ALLOCATES_FIXED',  300, 'monthly'),
  ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000b3', 'ALLOCATES_FIXED',  500, 'monthly'),
  ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000b5', 'ALLOCATES_FIXED',  800, 'monthly'),
  ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000b6', 'ALLOCATES_FIXED',  700, 'monthly'),
  ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000b7', 'ALLOCATES_FIXED',  700, 'monthly')
on conflict do nothing;

-- Future Shield: percentage allocation (15% of salary) ---------------------
insert into edges (tenant_id, src_node, dst_node, rel, percentage, cadence) values
  ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000b4', 'ALLOCATES_PCT', 15, 'monthly')
on conflict do nothing;

-- Future Shield contributes to the House Deposit goal ----------------------
insert into edges (tenant_id, src_node, dst_node, rel, cadence) values
  ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-0000000000b4', '90000000-0000-0000-0000-000000000001', 'CONTRIBUTES_TO', 'monthly')
on conflict do nothing;

-- Month-to-date spend (dated inside the current month) ---------------------
-- Groceries running hot -> should surface as over_budget / at_risk.
insert into transactions (tenant_id, wallet_node, vendor_node, amount, occurred_at, source, parse_confidence) values
  ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-0000000000b5', 'c0000000-0000-0000-0000-0000000000c1', 180.40, date_trunc('month', now()) + interval '2 days', 'telegram', 0.97),
  ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-0000000000b5', 'c0000000-0000-0000-0000-0000000000c2',  52.00, date_trunc('month', now()) + interval '4 days', 'telegram', 0.95),
  ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-0000000000b5', 'c0000000-0000-0000-0000-0000000000c1', 143.75, date_trunc('month', now()) + interval '6 days', 'telegram', 0.98),
  ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-0000000000b5', 'c0000000-0000-0000-0000-0000000000c2',  61.20, date_trunc('month', now()) + interval '7 days', 'telegram', 0.94),
  ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-0000000000b6', 'c0000000-0000-0000-0000-0000000000c3',  38.90, date_trunc('month', now()) + interval '5 days', 'telegram', 0.93)
on conflict do nothing;

-- Confirmation -------------------------------------------------------------
select 'DEMO_TENANT_ID' as key, '11111111-1111-1111-1111-111111111111' as value;
select * from bucket_projection('11111111-1111-1111-1111-111111111111');
