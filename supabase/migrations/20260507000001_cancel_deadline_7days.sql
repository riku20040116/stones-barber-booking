-- ============================================================================
-- キャンセル期限を「前日 18:00」→「7 日前 0:00」に変更する。
-- お客様による Web キャンセルは予約日の 7 日前まで。
-- それ以降は店舗へ電話連絡 → 管理者が管理画面から取消、という運用に変更。
-- ============================================================================
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
  -- 予約日の 7 日前 0:00 (JST) を締切とする
  v_cutoff := (date_trunc('day', timezone('Asia/Tokyo', v_start)) - interval '7 days')
              at time zone 'Asia/Tokyo';
  if now() >= v_cutoff then
    raise exception 'cancel_deadline_passed' using errcode = 'P0001';
  end if;
  update public.reservations set status = 'cancelled' where code = p_code;
  return 'cancelled'::reservation_status;
end;
$$;

grant execute on function public.cancel_reservation(text, text) to anon, authenticated;
