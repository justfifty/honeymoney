-- ============================================================================
-- HoneyMoney — SECOND sample dataset: a BUSINESS tenant.
-- Demonstrates that the SAME node/edge engine + bucket_projection() serves a
-- business with zero schema changes (family first, business next).
-- Run AFTER 0001_init_graph.sql. Optional — use for the scalability demo.
-- ============================================================================

insert into tenants (id, kind, name, base_currency) values
  ('22222222-2222-2222-2222-222222222222', 'business', 'Nasi Lemak Sedap Sdn Bhd', 'MYR')
on conflict (id) do nothing;

-- Revenue = the business "income_source"
insert into nodes (id, tenant_id, kind, label, props) values
  ('20000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'income_source', 'Cafe Revenue', '{"monthly_amount": 40000, "cadence": "monthly"}')
on conflict (id) do nothing;

-- Buckets = opex / reserves / payroll (same 3-bucket idea, business labels)
insert into nodes (id, tenant_id, kind, label, props) values
  ('d0000000-0000-0000-0000-0000000000d1', '22222222-2222-2222-2222-222222222222', 'bucket', 'Payroll',           '{"bucket": 1}'),
  ('d0000000-0000-0000-0000-0000000000d2', '22222222-2222-2222-2222-222222222222', 'bucket', 'Suppliers',         '{"bucket": 1, "default_spend": true}'),
  ('d0000000-0000-0000-0000-0000000000d3', '22222222-2222-2222-2222-222222222222', 'bucket', 'Rent & Utilities',  '{"bucket": 1}'),
  ('d0000000-0000-0000-0000-0000000000d4', '22222222-2222-2222-2222-222222222222', 'bucket', 'Tax Reserve',       '{"bucket": 2}'),
  ('d0000000-0000-0000-0000-0000000000d5', '22222222-2222-2222-2222-222222222222', 'bucket', 'Growth Fund',       '{"bucket": 2}'),
  ('d0000000-0000-0000-0000-0000000000d6', '22222222-2222-2222-2222-222222222222', 'bucket', 'Owner Draw',        '{"bucket": 3}')
on conflict (id) do nothing;

-- Vendors (suppliers)
insert into nodes (id, tenant_id, kind, label, props) values
  ('e0000000-0000-0000-0000-0000000000e1', '22222222-2222-2222-2222-222222222222', 'vendor', 'Pasar Borong', '{}'),
  ('e0000000-0000-0000-0000-0000000000e2', '22222222-2222-2222-2222-222222222222', 'vendor', 'Gas Supplier', '{}')
on conflict (id) do nothing;

-- Allocation edges: Revenue -> buckets
insert into edges (tenant_id, src_node, dst_node, rel, amount, cadence) values
  ('22222222-2222-2222-2222-222222222222', '20000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-0000000000d1', 'ALLOCATES_FIXED', 15000, 'monthly'),
  ('22222222-2222-2222-2222-222222222222', '20000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-0000000000d2', 'ALLOCATES_FIXED',  9000, 'monthly'),
  ('22222222-2222-2222-2222-222222222222', '20000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-0000000000d3', 'ALLOCATES_FIXED',  4000, 'monthly'),
  ('22222222-2222-2222-2222-222222222222', '20000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-0000000000d5', 'ALLOCATES_FIXED',  3000, 'monthly'),
  ('22222222-2222-2222-2222-222222222222', '20000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-0000000000d6', 'ALLOCATES_FIXED',  5000, 'monthly')
on conflict do nothing;

-- Tax Reserve: percentage allocation (8% of revenue)
insert into edges (tenant_id, src_node, dst_node, rel, percentage, cadence) values
  ('22222222-2222-2222-2222-222222222222', '20000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-0000000000d4', 'ALLOCATES_PCT', 8, 'monthly')
on conflict do nothing;

-- Month-to-date supplier spend running hot -> over_budget signal
insert into transactions (tenant_id, wallet_node, vendor_node, amount, occurred_at, source, parse_confidence) values
  ('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-0000000000d2', 'e0000000-0000-0000-0000-0000000000e1', 2400.00, date_trunc('month', now()) + interval '2 days', 'manual', 0.99),
  ('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-0000000000d2', 'e0000000-0000-0000-0000-0000000000e1', 1850.50, date_trunc('month', now()) + interval '5 days', 'manual', 0.99),
  ('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-0000000000d2', 'e0000000-0000-0000-0000-0000000000e2',  620.00, date_trunc('month', now()) + interval '6 days', 'manual', 0.99)
on conflict do nothing;

select 'BUSINESS_TENANT_ID' as key, '22222222-2222-2222-2222-222222222222' as value;
select * from bucket_projection('22222222-2222-2222-2222-222222222222');
