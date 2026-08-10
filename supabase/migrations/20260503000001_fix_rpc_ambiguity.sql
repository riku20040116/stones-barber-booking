-- ============================================================================
-- PostgreSQL 17 系で create_reservation / lookup_reservation が
--   "column reference 'id' is ambiguous"
-- を出すのを修正する。
--
-- 原因:
--   RETURNS TABLE(id uuid, code text) で OUT パラメータ id / code が宣言され、
--   関数本体内では同名の "%rowtype" レコード変数（.id / .code フィールドを持つ）
--   を参照すると、PG17 のパーサが OUT パラメータ名と composite フィールドの
--   どちらを指しているか解決できず ambiguous エラーになる。
--
-- 対処:
--   - %rowtype の v_inserted を使わず、INSERT ... RETURNING で id / code を
--     スカラー変数 (v_new_id / v_new_code) に取り出す。
--   - v_menu (menus%rowtype) も同様に、ループ内で必要なフィールドだけ
--     追加変数に展開して、INSERT VALUES での参照を曖昧でなくする。
--   - lookup_reservation は SELECT を `r.id, r.code, ...` のようにテーブル
--     エイリアス付きで qualify する。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- create_reservation の修正版
-- ---------------------------------------------------------------------------
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
  -- バリデーション ---------------------------------------------------------
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

  -- メニュー集計（is_active=true のみ） ----------------------------------
  select coalesce(sum(m.price), 0), coalesce(sum(m.duration_min), 0)
    into v_total_price, v_total_duration
  from public.menus m
  where m.id = any(p_menu_ids) and m.is_active = true;

  if v_total_duration = 0 then
    raise exception 'menu_not_available' using errcode = 'P0001';
  end if;

  -- 所要時間と枠の整合チェック -------------------------------------------
  if p_end_at <> p_start_at + (v_total_duration || ' minutes')::interval then
    raise exception 'duration_mismatch' using errcode = 'P0001';
  end if;

  -- INSERT（exclusion 制約により重複時は exclusion_violation） -----------
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

  -- line items ------------------------------------------------------------
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

  -- OUT パラメータに代入して return next で1行返す ----------------------
  id := v_new_id;
  code := v_new_code;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- lookup_reservation の修正版（テーブルエイリアス付きで qualify）
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 公開関数の実行権限を再付与（CREATE OR REPLACE で消えないが念のため）
-- ---------------------------------------------------------------------------
grant execute on function public.create_reservation(
  timestamptz, timestamptz, text, text, text, uuid[], payment_method, text
) to anon, authenticated;
grant execute on function public.lookup_reservation(text, text) to anon, authenticated;
