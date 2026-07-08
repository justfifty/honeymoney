-- ============================================================================
-- HoneyMoney — Financial Knowledge Graph schema
-- Model (nodes/edges) + Events (transactions) + Time (temporal edges)
-- Runs on Supabase Postgres. Apply via SQL editor or `supabase db push`.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type tenant_kind as enum ('household', 'business');
exception when duplicate_object then null; end $$;

do $$ begin
  create type node_kind as enum
    ('income_source', 'bucket', 'wallet', 'vendor', 'obligation', 'goal', 'asset', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edge_rel as enum
    ('FUNDS', 'ALLOCATES_PCT', 'ALLOCATES_FIXED', 'ROUTED_TO',
     'SPENT_AT', 'OWES', 'CONTRIBUTES_TO', 'OWNS');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tenants & members
-- ---------------------------------------------------------------------------
create table if not exists tenants (
  id            uuid primary key default gen_random_uuid(),
  kind          tenant_kind not null default 'household',
  name          text not null,
  base_currency text not null default 'MYR',
  created_at    timestamptz not null default now()
);

create table if not exists members (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  display_name text not null,
  role         text not null default 'member',   -- owner | member | viewer
  created_at   timestamptz not null default now()
);
create index if not exists members_tenant_idx on members(tenant_id);
create index if not exists members_user_idx on members(user_id);

-- ---------------------------------------------------------------------------
-- Graph: nodes
-- ---------------------------------------------------------------------------
create table if not exists nodes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  kind       node_kind not null,
  label      text not null,
  props      jsonb not null default '{}'::jsonb,   -- e.g. {"monthly_amount": 6000, "default_spend": true}
  created_at timestamptz not null default now()
);
create index if not exists nodes_tenant_kind_idx on nodes(tenant_id, kind);

-- ---------------------------------------------------------------------------
-- Graph: edges (temporal; flow semantics promoted to typed columns)
-- ---------------------------------------------------------------------------
create table if not exists edges (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  src_node   uuid not null references nodes(id) on delete cascade,
  dst_node   uuid not null references nodes(id) on delete cascade,
  rel        edge_rel not null,
  amount     numeric(14,2),          -- ALLOCATES_FIXED / SPENT_AT / OWES
  percentage numeric(5,2),           -- ALLOCATES_PCT (0..100)
  cadence    text,                   -- 'monthly' | 'weekly' | 'once' | null
  props      jsonb not null default '{}'::jsonb,
  valid_from date not null default current_date,
  valid_to   date,                   -- null = currently active
  created_at timestamptz not null default now()
);
create index if not exists edges_tenant_idx on edges(tenant_id);
create index if not exists edges_src_idx on edges(src_node);
create index if not exists edges_dst_idx on edges(dst_node);
create index if not exists edges_active_idx on edges(tenant_id, rel) where valid_to is null;

-- ---------------------------------------------------------------------------
-- Events: transactions (raw events attach to the SPENT_AT edge they realize)
-- ---------------------------------------------------------------------------
create table if not exists transactions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  edge_id          uuid references edges(id) on delete set null,
  wallet_node      uuid references nodes(id) on delete set null,  -- bucket/wallet spent from
  vendor_node      uuid references nodes(id) on delete set null,
  amount           numeric(14,2) not null,
  currency         text not null default 'MYR',
  occurred_at      timestamptz not null default now(),
  source           text,                 -- 'telegram' | 'manual' | 'tng' | 'mae' ...
  receipt_ref      text,                 -- pointer only; never the raw image
  parse_confidence numeric(4,3),         -- 0..1
  raw              jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists tx_tenant_time_idx on transactions(tenant_id, occurred_at desc);
create index if not exists tx_wallet_idx on transactions(wallet_node);

-- ---------------------------------------------------------------------------
-- Zero-integration channel links (Telegram/WhatsApp external id -> tenant)
-- ---------------------------------------------------------------------------
create table if not exists channel_links (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  member_id   uuid references members(id) on delete set null,
  channel     text not null,            -- 'telegram' | 'whatsapp'
  external_id text not null,            -- e.g. telegram chat id
  created_at  timestamptz not null default now(),
  unique (channel, external_id)
);

-- ---------------------------------------------------------------------------
-- Membership helper + Row Level Security
-- ---------------------------------------------------------------------------
create or replace function is_tenant_member(t uuid)
returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from members m
    where m.tenant_id = t and m.user_id = auth.uid()
  );
$$;

alter table tenants       enable row level security;
alter table members       enable row level security;
alter table nodes         enable row level security;
alter table edges         enable row level security;
alter table transactions  enable row level security;
alter table channel_links enable row level security;

-- authenticated users only touch rows in tenants they belong to.
-- (the service-role key used by server API routes bypasses RLS by design.)
drop policy if exists tenants_rw on tenants;
create policy tenants_rw on tenants for all
  using (is_tenant_member(id)) with check (is_tenant_member(id));

drop policy if exists members_rw on members;
create policy members_rw on members for all
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

drop policy if exists nodes_rw on nodes;
create policy nodes_rw on nodes for all
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

drop policy if exists edges_rw on edges;
create policy edges_rw on edges for all
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

drop policy if exists tx_rw on transactions;
create policy tx_rw on transactions for all
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

drop policy if exists channel_links_rw on channel_links;
create policy channel_links_rw on channel_links for all
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- Projection: "predictive dependency parsing"
-- Walk income -> ALLOCATES_* edges (recursive, depth-guarded), sum allocation
-- per bucket, extrapolate month-to-date spend velocity to month-end.
-- ---------------------------------------------------------------------------
create or replace function bucket_projection(p_tenant uuid, p_as_of date default current_date)
returns table (
  bucket_id         uuid,
  bucket_label      text,
  allocated         numeric,
  mtd_spend         numeric,
  projected_spend   numeric,
  projected_balance numeric,
  status            text
)
language sql stable as $$
  with
  month_start as (
    select date_trunc('month', p_as_of)::date as d
  ),
  month_len as (
    select extract(day from (date_trunc('month', p_as_of) + interval '1 month - 1 day'))::int as days
  ),
  elapsed as (
    select greatest(1, (p_as_of - (select d from month_start) + 1))::int as days
  ),
  -- recursive allocation flow from income sources through the graph
  alloc as (
    select e.dst_node as node_id,
           1 as depth,
           coalesce(e.amount,
                    (i.props->>'monthly_amount')::numeric * coalesce(e.percentage, 0) / 100.0) as amount
    from edges e
    join nodes i on i.id = e.src_node and i.kind = 'income_source'
    where e.tenant_id = p_tenant
      and e.rel in ('ALLOCATES_FIXED', 'ALLOCATES_PCT', 'FUNDS')
      and e.valid_to is null
    union all
    select e.dst_node,
           a.depth + 1,
           coalesce(e.amount, a.amount * coalesce(e.percentage, 0) / 100.0)
    from alloc a
    join edges e on e.src_node = a.node_id
      and e.tenant_id = p_tenant
      and e.rel in ('ALLOCATES_FIXED', 'ALLOCATES_PCT')
      and e.valid_to is null
    where a.depth < 5
  ),
  alloc_by_bucket as (
    select node_id, sum(amount) as allocated
    from alloc
    group by node_id
  ),
  spend as (
    select t.wallet_node as bucket_id, sum(t.amount) as mtd
    from transactions t
    where t.tenant_id = p_tenant
      and t.occurred_at >= (select d from month_start)
    group by t.wallet_node
  )
  select
    n.id,
    n.label,
    round(coalesce(ab.allocated, 0), 2) as allocated,
    round(coalesce(s.mtd, 0), 2) as mtd_spend,
    round(coalesce(s.mtd, 0) / (select days from elapsed) * (select days from month_len), 2) as projected_spend,
    round(coalesce(ab.allocated, 0)
          - coalesce(s.mtd, 0) / (select days from elapsed) * (select days from month_len), 2) as projected_balance,
    case
      when coalesce(ab.allocated, 0) = 0 then 'unfunded'
      when coalesce(s.mtd, 0) / (select days from elapsed) * (select days from month_len) > coalesce(ab.allocated, 0)
        then 'over_budget'
      when coalesce(s.mtd, 0) / (select days from elapsed) * (select days from month_len) > coalesce(ab.allocated, 0) * 0.9
        then 'at_risk'
      else 'on_track'
    end as status
  from nodes n
  left join alloc_by_bucket ab on ab.node_id = n.id
  left join spend s on s.bucket_id = n.id
  where n.tenant_id = p_tenant and n.kind = 'bucket'
  order by n.label;
$$;
