-- ============================================================================
-- 同一利用者（メールアドレス）の重複予約を防ぐ。
-- 未来日付に "pending" または "confirmed" の予約が既にあれば、
-- 新規予約をエラー（duplicate_active_reservation）で弾く。
-- 過去の予約 / cancelled / completed / no_show は対象外。
-- ============================================================================
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
  v_actual_min int;
  v_new_id uuid;
  v_new_code text;
  v_menu_id uuid;
  v_menu_name text;
  v_menu_price int;
  v_menu_duration int;
  v_idx int := 0;
  v_dup_count int;
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

  -- 同一メールでアクティブな未来予約が既に存在しないか確認
  select count(*) into v_dup_count
  from public.reservations
  where lower(customer_email) = lower(p_customer_email)
    and status in ('pending', 'confirmed')
    and start_at >= now();
  if v_dup_count > 0 then
    raise exception 'duplicate_active_reservation' using errcode = 'P0001';
  end if;

  -- メニュー集計
  select coalesce(sum(m.price), 0), coalesce(sum(m.duration_min), 0)
    into v_total_price, v_total_duration
  from public.menus m
  where m.id = any(p_menu_ids) and m.is_active = true;

  if v_total_duration = 0 then
    raise exception 'menu_not_available' using errcode = 'P0001';
  end if;

  -- 所要時間チェック（緩和版 / 初回 +15 分対応）
  v_actual_min := (extract(epoch from (p_end_at - p_start_at)) / 60)::int;
  if v_actual_min < v_total_duration then
    raise exception 'duration_too_short' using errcode = 'P0001';
  end if;
  if v_actual_min > v_total_duration + 60 then
    raise exception 'duration_too_long' using errcode = 'P0001';
  end if;

  -- INSERT
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

  id := v_new_id;
  code := v_new_code;
  return next;
end;
$$;

grant execute on function public.create_reservation(
  timestamptz, timestamptz, text, text, text, uuid[], payment_method, text
) to anon, authenticated;
