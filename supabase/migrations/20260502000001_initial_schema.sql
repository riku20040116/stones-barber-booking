-- ============================================================================
-- STONE'S BARBER 予約システム 初期スキーマ
-- ----------------------------------------------------------------------------
-- 設計の要点:
--   * 1名営業のため、reservations に btree_gist の EXCLUDE 制約を貼り、
--     重複予約を DB レベルで防止する。
--   * すべての時刻は timestamptz（UTC 保存）。アプリ層で Asia/Tokyo に変換。
--   * ゲスト予約は service_role 経由（RLS bypass）または SECURITY DEFINER 関数で挿入。
--     RLS は誤った直接アクセス対策として有効化する。
-- ============================================================================

-- 拡張
create extension if not exists "uuid-ossp";
create extension if not exists btree_gist;
create extension if not exists "pg_trgm";

-- ----------------------------------------------------------------------------
-- ENUM
-- ----------------------------------------------------------------------------
create type reservation_status as enum (
  'pending', 'confirmed', 'cancelled', 'completed', 'no_show'
);
create type payment_method as enum ('in_store', 'stripe');
create type payment_status as enum ('unpaid', 'paid', 'refunded', 'failed');
create type menu_category as enum (
  'cut', 'course', 'color', 'perm', 'straighten', 'option'
);
create type profile_role as enum ('customer', 'admin');
create type holiday_type as enum ('closed', 'special_hours');
create type email_type as enum (
  'confirmation', 'reminder', 'cancellation', 'admin_notice'
);

-- ----------------------------------------------------------------------------
-- profiles  (auth.users と 1:1)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text not null,
  phone text,
  role profile_role not null default 'customer',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles using btree (lower(email));

-- ----------------------------------------------------------------------------
-- menus
-- ----------------------------------------------------------------------------
create table public.menus (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  category menu_category not null,
  name text not null,
  description text,
  price integer not null check (price >= 0),
  price_label text,
  duration_min integer not null check (duration_min > 0),
  note text,
  is_option boolean not null default false,
  age_group text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menus_category_idx on public.menus (category, sort_order);
create index menus_active_idx on public.menus (is_active);

-- ----------------------------------------------------------------------------
-- holiday_overrides   臨時休業 / 営業時間例外
-- ----------------------------------------------------------------------------
create table public.holiday_overrides (
  date date primary key,
  type holiday_type not null,
  open_time time,
  close_time time,
  reason text,
  created_at timestamptz not null default now(),
  check (
    (type = 'closed') or
    (type = 'special_hours' and open_time is not null and close_time is not null and open_time < close_time)
  )
);

-- ----------------------------------------------------------------------------
-- reservations
-- ----------------------------------------------------------------------------
create table public.reservations (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  customer_id uuid references public.profiles(id) on delete set null,
  status reservation_status not null default 'confirmed',
  start_at timestamptz not null,
  end_at timestamptz not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  total_price integer not null check (total_price >= 0),
  payment_method payment_method not null default 'in_store',
  payment_status payment_status not null default 'unpaid',
  stripe_payment_intent text,
  notes text,
  source text not null default 'web' check (source in ('web', 'phone', 'walkin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  -- 重複防止: status が pending/confirmed の予約は時間帯が重複してはならない
  constraint no_overlap_active exclude using gist (
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('pending', 'confirmed'))
);
create index reservations_start_idx on public.reservations (start_at);
create index reservations_status_idx on public.reservations (status);
create index reservations_customer_idx on public.reservations (customer_id);
create index reservations_email_idx on public.reservations using btree (lower(customer_email));

-- ----------------------------------------------------------------------------
-- reservation_items   line items（価格・所要時間のスナップショット）
-- ----------------------------------------------------------------------------
create table public.reservation_items (
  id uuid primary key default uuid_generate_v4(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  menu_id uuid references public.menus(id) on delete set null,
  name_snapshot text not null,
  price_snapshot integer not null check (price_snapshot >= 0),
  duration_snapshot integer not null check (duration_snapshot > 0),
  sort_order integer not null default 0
);
create index reservation_items_reservation_idx on public.reservation_items (reservation_id);

-- ----------------------------------------------------------------------------
-- email_log
-- ----------------------------------------------------------------------------
create table public.email_log (
  id uuid primary key default uuid_generate_v4(),
  reservation_id uuid references public.reservations(id) on delete set null,
  type email_type not null,
  to_email text not null,
  subject text not null,
  provider_message_id text,
  error text,
  sent_at timestamptz not null default now()
);
create index email_log_reservation_idx on public.email_log (reservation_id);
create index email_log_type_idx on public.email_log (type, sent_at desc);

-- ----------------------------------------------------------------------------
-- settings   key/value 設定（メールテンプレ等）
-- ----------------------------------------------------------------------------
create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- updated_at トリガ
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_profiles before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at_menus before update on public.menus
  for each row execute function public.set_updated_at();
create trigger set_updated_at_reservations before update on public.reservations
  for each row execute function public.set_updated_at();
create trigger set_updated_at_settings before update on public.settings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- handle_new_user   auth.users 追加時に profiles を作る
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 予約コード生成   SB-YYYYMMDD-XXXX (4文字英数, 紛らわしい文字除外)
-- ----------------------------------------------------------------------------
create or replace function public.generate_reservation_code() returns text
language plpgsql as $$
declare
  v_date_str text;
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempts int := 0;
  i int;
begin
  v_date_str := to_char(timezone('Asia/Tokyo', now()), 'YYYYMMDD');
  loop
    v_code := 'SB-' || v_date_str || '-';
    for i in 1..4 loop
      v_code := v_code || substr(v_chars, 1 + (random() * (length(v_chars) - 1))::int, 1);
    end loop;
    exit when not exists (select 1 from public.reservations where code = v_code);
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'Could not generate unique reservation code after 20 attempts';
    end if;
  end loop;
  return v_code;
end;
$$;

create or replace function public.set_reservation_code() returns trigger
language plpgsql as $$
begin
  if new.code is null or new.code = '' then
    new.code := public.generate_reservation_code();
  end if;
  return new;
end;
$$;

create trigger set_reservation_code_trg before insert on public.reservations
  for each row execute function public.set_reservation_code();

-- ----------------------------------------------------------------------------
-- create_reservation   ゲスト予約作成 RPC（SECURITY DEFINER で RLS bypass）
--
-- 注意: PG17+ で RETURNS TABLE(id, code) の OUT パラメータと %rowtype の
-- composite フィールドが衝突して "column reference 'id' is ambiguous" を
-- 起こすため、本体ではスカラー変数を使い OUT パラメータに代入して返す。
-- ----------------------------------------------------------------------------
create or replace function public.create_reservation(
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_menu_ids uuid[],
  p_payment_method payment_method,
  p_notes text
) returns table(id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare
  v_total_price int := 0;
  v_total_duration int := 0;
  v_new_id uuid;
  v_new_code text;
  v_menu_id uuid;
  v_menu_name text;
  v_menu_price int;
  v_menu_duration int;
  v_idx int := 0;
begin
  -- バリデーション
  if p_start_at is null or p_end_at is null or p_start_at >= p_end_at then
    raise exception 'invalid_time_range' using errcode = 'P0001';
  end if;
  if p_menu_ids is null or array_length(p_menu_ids, 1) is null then
    raise exception 'no_menu_selected' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_customer_name, ''))) = 0 then
    raise exception 'invalid_customer_name' using errcode = 'P0001';
  end if;
  if p_customer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;

  -- メニュー集計（is_active=true のみ）
  select coalesce(sum(m.price), 0), coalesce(sum(m.duration_min), 0)
    into v_total_price, v_total_duration
  from public.menus m
  where m.id = any(p_menu_ids) and m.is_active = true;

  if v_total_duration = 0 then
    raise exception 'menu_not_available' using errcode = 'P0001';
  end if;

  -- end_at の整合性チェック（クライアントの計算ミスを検知）
  if p_end_at <> p_start_at + (v_total_duration || ' minutes')::interval then
    raise exception 'duration_mismatch' using errcode = 'P0001';
  end if;

  -- INSERT（exclusion 制約により重複時は exclusion_violation）
  begin
    insert into public.reservations (
      start_at, end_at,
      customer_name, customer_email, customer_phone,
      total_price, payment_method, status, source, notes
    ) values (
      p_start_at, p_end_at,
      p_customer_name, lower(p_customer_email), p_customer_phone,
      v_total_price, p_payment_method, 'confirmed', 'web', p_notes
    )
    returning public.reservations.id, public.reservations.code
    into v_new_id, v_new_code;
  exception
    when exclusion_violation then
      raise exception 'slot_taken' using errcode = '23P01';
  end;

  -- line items
  for v_menu_id, v_menu_name, v_menu_price, v_menu_duration in
    select m.id, m.name, m.price, m.duration_min
    from public.menus m
    join unnest(p_menu_ids) with ordinality as t(menu_id, ord)
      on m.id = t.menu_id
    where m.is_active = true
    order by t.ord
  loop
    v_idx := v_idx + 1;
    insert into public.reservation_items (
      reservation_id, menu_id,
      name_snapshot, price_snapshot, duration_snapshot, sort_order
    ) values (
      v_new_id, v_menu_id,
      v_menu_name, v_menu_price, v_menu_duration, v_idx
    );
  end loop;

  -- OUT パラメータに代入して1行返す
  id := v_new_id;
  code := v_new_code;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- lookup_reservation   公開ルックアップ（コード + メール）
-- ----------------------------------------------------------------------------
create or replace function public.lookup_reservation(p_code text, p_email text)
returns table(
  id uuid,
  code text,
  status reservation_status,
  start_at timestamptz,
  end_at timestamptz,
  customer_name text,
  customer_email text,
  customer_phone text,
  total_price int,
  payment_method payment_method,
  payment_status payment_status
)
language sql security definer stable set search_path = public as $$
  -- RETURNS TABLE の OUT カラムと public.reservations のカラムが同名のため、
  -- すべてテーブルエイリアスで qualify する。
  select
    r.id,
    r.code,
    r.status,
    r.start_at,
    r.end_at,
    r.customer_name,
    r.customer_email,
    r.customer_phone,
    r.total_price,
    r.payment_method,
    r.payment_status
  from public.reservations r
  where r.code = p_code
    and lower(r.customer_email) = lower(p_email)
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- cancel_reservation   公開キャンセル（前日 18:00 JST 締切は呼び出し側でチェック）
-- ----------------------------------------------------------------------------
create or replace function public.cancel_reservation(
  p_code text,
  p_email text
) returns reservation_status
language plpgsql security definer set search_path = public as $$
declare
  v_status reservation_status;
  v_start timestamptz;
  v_cutoff timestamptz;
begin
  select status, start_at into v_status, v_start
  from public.reservations
  where code = p_code and lower(customer_email) = lower(p_email)
  limit 1;
  if v_status is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_status = 'cancelled' then
    return v_status;
  end if;
  if v_status not in ('pending', 'confirmed') then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;
  -- 前日 18:00 JST 締切
  v_cutoff := (date_trunc('day', timezone('Asia/Tokyo', v_start)) - interval '6 hours') at time zone 'Asia/Tokyo';
  if now() >= v_cutoff then
    raise exception 'cancel_deadline_passed' using errcode = 'P0001';
  end if;
  update public.reservations set status = 'cancelled' where code = p_code;
  return 'cancelled'::reservation_status;
end;
$$;

-- ----------------------------------------------------------------------------
-- is_admin helper
-- ----------------------------------------------------------------------------
create or replace function public.is_admin(uid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = uid and role = 'admin'
  );
$$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.menus enable row level security;
alter table public.holiday_overrides enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_items enable row level security;
alter table public.email_log enable row level security;
alter table public.settings enable row level security;

-- profiles
create policy "profiles_self_select" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- menus
create policy "menus_public_active_select" on public.menus
  for select using (is_active = true or public.is_admin(auth.uid()));
create policy "menus_admin_all" on public.menus
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- holiday_overrides
create policy "holidays_public_select" on public.holiday_overrides
  for select using (true);
create policy "holidays_admin_all" on public.holiday_overrides
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- reservations
create policy "reservations_self_select" on public.reservations
  for select using (auth.uid() = customer_id);
create policy "reservations_admin_all" on public.reservations
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- reservation_items
create policy "items_self_select" on public.reservation_items
  for select using (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_id and r.customer_id = auth.uid()
    )
  );
create policy "items_admin_all" on public.reservation_items
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- email_log: admin only
create policy "email_admin_all" on public.email_log
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- settings: 一部キーは公開
create policy "settings_public_keys_select" on public.settings
  for select using (key in ('store_info', 'public_notice'));
create policy "settings_admin_all" on public.settings
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 公開関数の実行権限
-- ----------------------------------------------------------------------------
grant execute on function public.lookup_reservation(text, text) to anon, authenticated;
grant execute on function public.cancel_reservation(text, text) to anon, authenticated;
grant execute on function public.create_reservation(
  timestamptz, timestamptz, text, text, text, uuid[], payment_method, text
) to anon, authenticated;
