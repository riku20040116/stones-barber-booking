-- ============================================================================
-- 予約ルールの変更
--
-- 変更前: 同一メールアドレスで未来の有効な予約が 1 件でもあれば新規予約を拒否
--         （duplicate_active_reservation）。先の予約が取れない運用だった。
--
-- 変更後:
--   1) 予約できるのは「今日から 3 ヶ月先」まで          → too_far_ahead
--   2) その 3 ヶ月の間に持てる有効な予約は 1 人 3 件まで → too_many_reservations
--   3) 既存の有効な予約の前後 7 日以内は予約できない     → too_soon_after_other
--      （= 1 週間に 2 件以上入れられない）
--
-- 判定の前提:
--   - 「1 人」の識別はメールアドレス（小文字化して比較）。
--     電話番号は家族で共有されることがあり、父子の予約を誤って弾くため使わない。
--   - 対象は status が pending / confirmed の予約のみ。
--     キャンセル済み・来店済み（completed）・無断キャンセルは数えない。
--     → 3 日前に来店した人が翌日を予約することは妨げない。
--   - 3 ヶ月は暦どおり（interval '3 months'）。9/20 なら 12/20 まで。
--
-- 管理画面からの手動登録（電話予約の記帳）はこの RPC を通らず直接 INSERT する
-- ため、これらの上限は掛からない。店舗側は従来どおり自由に登録できる。
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
  v_active_count int;
  v_near_count int;
  -- ルールの定数。変えたい場合はここだけ直す。
  c_horizon constant interval := interval '3 months';
  c_max_in_horizon constant int := 3;
  c_min_gap constant interval := interval '7 days';
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

  -- (1) 3 ヶ月より先は予約できない
  if p_start_at > now() + c_horizon then
    raise exception 'too_far_ahead' using errcode = 'P0001';
  end if;

  -- (2) 3 ヶ月の間に持てる有効な予約は 3 件まで
  select count(*) into v_active_count
  from public.reservations
  where lower(customer_email) = lower(p_customer_email)
    and status in ('pending', 'confirmed')
    and start_at >= now()
    and start_at <= now() + c_horizon;
  if v_active_count >= c_max_in_horizon then
    raise exception 'too_many_reservations' using errcode = 'P0001';
  end if;

  -- (3) 既存の有効な予約の前後 7 日以内は予約できない
  select count(*) into v_near_count
  from public.reservations
  where lower(customer_email) = lower(p_customer_email)
    and status in ('pending', 'confirmed')
    and start_at > p_start_at - c_min_gap
    and start_at < p_start_at + c_min_gap;
  if v_near_count > 0 then
    raise exception 'too_soon_after_other' using errcode = 'P0001';
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

  -- INSERT（即確定）
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

-- ============================================================================
-- お客様が自分の予約状況を事前に確認するための関数。
-- 予約フォームで「あと何件予約できるか」を出すのに使う。
-- メールアドレスだけを受け取り、件数と直近の予約日しか返さないので
-- 他人のメールを入れても個人情報は漏れない。
-- ============================================================================
create or replace function public.check_booking_eligibility(
  p_customer_email text,
  p_start_at timestamptz
) returns table(
  active_count int,
  max_allowed int,
  has_nearby boolean,
  nearby_start_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  c_horizon constant interval := interval '3 months';
  c_max_in_horizon constant int := 3;
  c_min_gap constant interval := interval '7 days';
begin
  select count(*)::int into active_count
  from public.reservations
  where lower(customer_email) = lower(p_customer_email)
    and status in ('pending', 'confirmed')
    and start_at >= now()
    and start_at <= now() + c_horizon;

  max_allowed := c_max_in_horizon;

  select r.start_at into nearby_start_at
  from public.reservations r
  where lower(r.customer_email) = lower(p_customer_email)
    and r.status in ('pending', 'confirmed')
    and r.start_at > p_start_at - c_min_gap
    and r.start_at < p_start_at + c_min_gap
  order by r.start_at
  limit 1;

  has_nearby := nearby_start_at is not null;
  return next;
end;
$$;

grant execute on function public.check_booking_eligibility(text, timestamptz)
  to anon, authenticated;
