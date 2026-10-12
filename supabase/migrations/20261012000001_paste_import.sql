-- ============================================================================
-- 手書き予約表の「貼り付け取り込み」用
--
--   1. 予約の登録経路（source）に 'handwritten'（手書き取り込み）を足す
--   2. 取り込んだ予約をまとめて登録する関数 import_handwritten_reservations
--      - 1 件でも登録できなければ、全部登録しない（まとめて取り消し）
--      - 時間が重なる予約・同じ予約（同じ開始時刻・同じお名前）は登録しない
--      - 確定・店頭払い・未払い。メールは送らない（アプリ側でも送らない）
--
-- 既存の予約・create_reservation（Web 予約）には手を付けない。
-- 何度実行しても同じ結果になる（冪等）。
-- 20260921000001_customers.sql の source の変更と同じ内容なので、どちらを先に実行してもよい。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. source に 'handwritten' を足す
--    既存の制約は名前を決め打ちせずに探して消す（自動命名の名前が環境で違っても困らないように）
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%source%'
  loop
    execute format('alter table public.reservations drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.reservations add constraint reservations_source_check
  check (source in ('web', 'phone', 'walkin', 'handwritten'));

-- ----------------------------------------------------------------------------
-- 2. まとめて登録する関数
--
-- p_rows: [{ "start_at": "2026-10-20T10:00:00+09:00", "end_at": "...",
--            "name": "山田", "phone": "", "notes": "", "menu_ids": ["uuid", ...] }, ...]
--
-- 登録できない行があったときは、全部を取り消して次の形のエラーを返す:
--   import_row_error:<行の番号（1 から）>:<理由>
--   理由: invalid_time / invalid_name / invalid_menu / past / duplicate / slot_taken
-- ----------------------------------------------------------------------------
create or replace function public.import_handwritten_reservations(p_rows jsonb)
returns table(row_index int, reservation_id uuid, reservation_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb;
  v_idx int := 0;
  v_start timestamptz;
  v_end timestamptz;
  v_name text;
  v_menu_ids uuid[];
  v_menu_count int;
  v_total_price int;
  v_new_id uuid;
  v_new_code text;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'import_empty' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 100 then
    raise exception 'import_too_many' using errcode = 'P0001';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;

    -- 時刻
    begin
      v_start := (v_row->>'start_at')::timestamptz;
      v_end := (v_row->>'end_at')::timestamptz;
    exception when others then
      raise exception 'import_row_error:%:invalid_time', v_idx using errcode = 'P0001';
    end;
    if v_start is null or v_end is null or v_end <= v_start
       or v_end - v_start > interval '8 hours' then
      raise exception 'import_row_error:%:invalid_time', v_idx using errcode = 'P0001';
    end if;
    if v_start < now() then
      raise exception 'import_row_error:%:past', v_idx using errcode = 'P0001';
    end if;

    -- お名前
    v_name := trim(coalesce(v_row->>'name', ''));
    if v_name = '' then
      raise exception 'import_row_error:%:invalid_name', v_idx using errcode = 'P0001';
    end if;

    -- メニュー（すべて販売中のメニューであること）
    begin
      select coalesce(array_agg(x::uuid), '{}') into v_menu_ids
      from jsonb_array_elements_text(coalesce(v_row->'menu_ids', '[]'::jsonb)) as t(x);
    exception when others then
      raise exception 'import_row_error:%:invalid_menu', v_idx using errcode = 'P0001';
    end;
    select count(*), coalesce(sum(m.price), 0) into v_menu_count, v_total_price
    from public.menus m
    where m.id = any(v_menu_ids) and m.is_active = true;
    if cardinality(v_menu_ids) = 0 or v_menu_count <> cardinality(v_menu_ids) then
      raise exception 'import_row_error:%:invalid_menu', v_idx using errcode = 'P0001';
    end if;

    -- 同じ予約（同じ開始時刻・同じお名前）がすでにある
    if exists (
      select 1 from public.reservations r
      where r.status in ('pending', 'confirmed')
        and r.start_at = v_start
        and regexp_replace(r.customer_name, '[[:space:]　]|(様|さん)$', '', 'g')
          = regexp_replace(v_name, '[[:space:]　]|(様|さん)$', '', 'g')
    ) then
      raise exception 'import_row_error:%:duplicate', v_idx using errcode = 'P0001';
    end if;

    -- 登録（時間の重なりは no_overlap_active 制約が弾く）
    begin
      insert into public.reservations (
        start_at, end_at,
        customer_name, customer_email, customer_phone,
        total_price, payment_method, payment_status, status, source, notes
      ) values (
        v_start, v_end,
        v_name, '', trim(coalesce(v_row->>'phone', '')),
        v_total_price, 'in_store', 'unpaid', 'confirmed', 'handwritten',
        nullif(trim(coalesce(v_row->>'notes', '')), '')
      )
      returning public.reservations.id, public.reservations.code
      into v_new_id, v_new_code;
    exception
      when exclusion_violation then
        raise exception 'import_row_error:%:slot_taken', v_idx using errcode = 'P0001';
    end;

    insert into public.reservation_items (
      reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order
    )
    select v_new_id, m.id, m.name, m.price, m.duration_min, t.ord
    from unnest(v_menu_ids) with ordinality as t(menu_id, ord)
    join public.menus m on m.id = t.menu_id
    order by t.ord;

    row_index := v_idx;
    reservation_id := v_new_id;
    reservation_code := v_new_code;
    return next;
  end loop;
end;
$$;

-- 管理画面のサーバー処理（service_role）からだけ呼べるようにする
revoke all on function public.import_handwritten_reservations(jsonb) from public;
revoke all on function public.import_handwritten_reservations(jsonb) from anon, authenticated;
grant execute on function public.import_handwritten_reservations(jsonb) to service_role;
