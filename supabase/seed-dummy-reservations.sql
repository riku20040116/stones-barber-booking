-- ============================================================================
-- STONE'S BARBER ダミー予約データ（動作確認用）
-- 生成日時: 2026-08-10 11:58
-- 対象: 2026-08-11(火) 〜 2026-08-16(日) の 6 営業日 × 8 名 = 48 件
--   ※ 2026-08-10(月) / 2026-08-17(月) は定休のため除外
--   ※ 2026-08-11(火) は第2火曜なので営業日（第3火曜の連休には該当せず）
-- 特徴: メールが @dummy.example なので、あとで一括削除できます
-- ============================================================================

-- 既存のダミーを消してから入れ直す（再実行しても重複しない）
delete from public.reservation_items where reservation_id in (
  select id from public.reservations where customer_email like '%@dummy.example'
);
delete from public.reservations where customer_email like '%@dummy.example';

-- 01. 2026-08-11(火) 09:30-10:00  池田 直樹 様  3,200円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-11T09:30:00+09:00'::timestamptz, '2026-08-11T10:00:00+09:00'::timestamptz, '池田 直樹', 'dummy01@dummy.example', '090-3273-3756',
         3200, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】火曜 09:30-10:00 / カット・シャンプー（高校生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-11T09:30:00+09:00'::timestamptz, '2026-08-11T10:00:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-high-school';

-- 02. 2026-08-11(火) 10:15-10:55  鈴木 健太 様  3,000円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-11T10:15:00+09:00'::timestamptz, '2026-08-11T10:55:00+09:00'::timestamptz, '鈴木 健太', 'dummy02@dummy.example', '090-9873-9306',
         3000, 'in_store', 'unpaid', null, 'confirmed', 'phone', '【ダミーデータ】火曜 10:15-10:55 / カット・シャンプー（0歳〜小学生） 耳洗い'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-11T10:15:00+09:00'::timestamptz, '2026-08-11T10:55:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-child'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 2 from ins cross join public.menus m where m.slug = 'opt-ear-wash';

-- 03. 2026-08-11(火) 11:15-12:10  森 颯太 様  4,200円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-11T11:15:00+09:00'::timestamptz, '2026-08-11T12:10:00+09:00'::timestamptz, '森 颯太', 'dummy03@dummy.example', '090-2454-5325',
         4200, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】火曜 11:15-12:10 / カット・シャンプー（大人） 頭皮スパ'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-11T11:15:00+09:00'::timestamptz, '2026-08-11T12:10:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 2 from ins cross join public.menus m where m.slug = 'opt-scalp-spa';

-- 04. 2026-08-11(火) 13:30-14:45  加藤 拓也 様  4,900円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-11T13:30:00+09:00'::timestamptz, '2026-08-11T14:45:00+09:00'::timestamptz, '加藤 拓也', 'dummy04@dummy.example', '090-1147-2638',
         4900, 'in_store', 'unpaid', null, 'confirmed', 'phone', '【ダミーデータ】火曜 13:30-14:45 / 初回+15分 / カット・シャンプー（大人） お顔剃り 鼻脱毛'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-11T13:30:00+09:00'::timestamptz, '2026-08-11T14:45:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 2 from ins cross join public.menus m where m.slug = 'opt-face-shave'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 3 from ins cross join public.menus m where m.slug = 'opt-nose-wax';

-- 05. 2026-08-11(火) 15:15-15:40  木村 涼 様  2,600円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-11T15:15:00+09:00'::timestamptz, '2026-08-11T15:40:00+09:00'::timestamptz, '木村 涼', 'dummy05@dummy.example', '090-3456-2758',
         2600, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】火曜 15:15-15:40 / カット・シャンプー（0歳〜小学生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-11T15:15:00+09:00'::timestamptz, '2026-08-11T15:40:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-child';

-- 06. 2026-08-11(火) 16:15-16:40  清水 海斗 様  2,600円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-11T16:15:00+09:00'::timestamptz, '2026-08-11T16:40:00+09:00'::timestamptz, '清水 海斗', 'dummy06@dummy.example', '090-1389-6921',
         2600, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】火曜 16:15-16:40 / カット・シャンプー（0歳〜小学生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-11T16:15:00+09:00'::timestamptz, '2026-08-11T16:40:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-child';

-- 07. 2026-08-11(火) 17:15-18:05  清水 拓也 様  4,500円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-11T17:15:00+09:00'::timestamptz, '2026-08-11T18:05:00+09:00'::timestamptz, '清水 拓也', 'dummy07@dummy.example', '090-3869-3239',
         4500, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】火曜 17:15-18:05 / カット・シャンプー・顔剃り（大人）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-11T17:15:00+09:00'::timestamptz, '2026-08-11T18:05:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult-shave';

-- 08. 2026-08-11(火) 18:30-18:55  山田 颯太 様  2,600円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-11T18:30:00+09:00'::timestamptz, '2026-08-11T18:55:00+09:00'::timestamptz, '山田 颯太', 'dummy08@dummy.example', '090-8558-4998',
         2600, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】火曜 18:30-18:55 / カット・シャンプー（0歳〜小学生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-11T18:30:00+09:00'::timestamptz, '2026-08-11T18:55:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-child';

-- 09. 2026-08-12(水) 09:30-10:05  林 和也 様  3,500円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-12T09:30:00+09:00'::timestamptz, '2026-08-12T10:05:00+09:00'::timestamptz, '林 和也', 'dummy09@dummy.example', '090-5078-4983',
         3500, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】水曜 09:30-10:05 / カット・シャンプー（大人）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-12T09:30:00+09:00'::timestamptz, '2026-08-12T10:05:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult';

-- 10. 2026-08-12(水) 10:30-11:00  田中 和也 様  3,200円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-12T10:30:00+09:00'::timestamptz, '2026-08-12T11:00:00+09:00'::timestamptz, '田中 和也', 'dummy10@dummy.example', '090-7152-2300',
         3200, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】水曜 10:30-11:00 / カット・シャンプー（高校生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-12T10:30:00+09:00'::timestamptz, '2026-08-12T11:00:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-high-school';

-- 11. 2026-08-12(水) 11:15-11:45  林 優作 様  3,200円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-12T11:15:00+09:00'::timestamptz, '2026-08-12T11:45:00+09:00'::timestamptz, '林 優作', 'dummy11@dummy.example', '090-6322-2523',
         3200, 'in_store', 'unpaid', null, 'confirmed', 'phone', '【ダミーデータ】水曜 11:15-11:45 / カット・シャンプー（高校生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-12T11:15:00+09:00'::timestamptz, '2026-08-12T11:45:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-high-school';

-- 12. 2026-08-12(水) 13:15-13:45  伊藤 蓮 様  2,900円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-12T13:15:00+09:00'::timestamptz, '2026-08-12T13:45:00+09:00'::timestamptz, '伊藤 蓮', 'dummy12@dummy.example', '090-4752-2262',
         2900, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】水曜 13:15-13:45 / カット・シャンプー（中学生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-12T13:15:00+09:00'::timestamptz, '2026-08-12T13:45:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-junior-high';

-- 13. 2026-08-12(水) 14:15-14:55  山口 涼 様  2,600円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-12T14:15:00+09:00'::timestamptz, '2026-08-12T14:55:00+09:00'::timestamptz, '山口 涼', 'dummy13@dummy.example', '090-1193-6795',
         2600, 'in_store', 'unpaid', null, 'confirmed', 'phone', '【ダミーデータ】水曜 14:15-14:55 / 初回+15分 / カット・シャンプー（0歳〜小学生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-12T14:15:00+09:00'::timestamptz, '2026-08-12T14:55:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-child';

-- 14. 2026-08-12(水) 15:30-16:35  山本 直樹 様  5,500円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-12T15:30:00+09:00'::timestamptz, '2026-08-12T16:35:00+09:00'::timestamptz, '山本 直樹', 'dummy14@dummy.example', '090-2970-7341',
         5500, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】水曜 15:30-16:35 / カット・シャンプー・顔剃り（大人） お顔剃り'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-12T15:30:00+09:00'::timestamptz, '2026-08-12T16:35:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult-shave'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 2 from ins cross join public.menus m where m.slug = 'opt-face-shave';

-- 15. 2026-08-12(水) 17:15-18:10  井上 翼 様  4,600円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-12T17:15:00+09:00'::timestamptz, '2026-08-12T18:10:00+09:00'::timestamptz, '井上 翼', 'dummy15@dummy.example', '090-2779-5022',
         4600, 'in_store', 'unpaid', null, 'confirmed', 'phone', '【ダミーデータ】水曜 17:15-18:10 / カット・シャンプー（高校生） 鼻脱毛 お顔剃り'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-12T17:15:00+09:00'::timestamptz, '2026-08-12T18:10:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-high-school'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 2 from ins cross join public.menus m where m.slug = 'opt-nose-wax'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 3 from ins cross join public.menus m where m.slug = 'opt-face-shave';

-- 16. 2026-08-12(水) 18:30-19:25  池田 隼人 様  4,200円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-12T18:30:00+09:00'::timestamptz, '2026-08-12T19:25:00+09:00'::timestamptz, '池田 隼人', 'dummy16@dummy.example', '090-1683-1497',
         4200, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】水曜 18:30-19:25 / カット・シャンプー（大人） 頭皮スパ'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-12T18:30:00+09:00'::timestamptz, '2026-08-12T19:25:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 2 from ins cross join public.menus m where m.slug = 'opt-scalp-spa';

-- 17. 2026-08-13(木) 09:30-09:55  山口 直樹 様  2,600円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-13T09:30:00+09:00'::timestamptz, '2026-08-13T09:55:00+09:00'::timestamptz, '山口 直樹', 'dummy17@dummy.example', '090-8446-3294',
         2600, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】木曜 09:30-09:55 / カット・シャンプー（0歳〜小学生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-13T09:30:00+09:00'::timestamptz, '2026-08-13T09:55:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-child';

-- 18. 2026-08-13(木) 10:30-11:15  小林 湊 様  3,200円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-13T10:30:00+09:00'::timestamptz, '2026-08-13T11:15:00+09:00'::timestamptz, '小林 湊', 'dummy18@dummy.example', '090-2958-9641',
         3200, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】木曜 10:30-11:15 / 初回+15分 / カット・シャンプー（高校生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-13T10:30:00+09:00'::timestamptz, '2026-08-13T11:15:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-high-school';

-- 19. 2026-08-13(木) 11:45-12:15  鈴木 直樹 様  2,900円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-13T11:45:00+09:00'::timestamptz, '2026-08-13T12:15:00+09:00'::timestamptz, '鈴木 直樹', 'dummy19@dummy.example', '090-5087-3961',
         2900, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】木曜 11:45-12:15 / カット・シャンプー（中学生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-13T11:45:00+09:00'::timestamptz, '2026-08-13T12:15:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-junior-high';

-- 20. 2026-08-13(木) 13:30-14:30  林 誠 様  4,000円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-13T13:30:00+09:00'::timestamptz, '2026-08-13T14:30:00+09:00'::timestamptz, '林 誠', 'dummy20@dummy.example', '090-3265-3574',
         4000, 'in_store', 'unpaid', null, 'confirmed', 'phone', '【ダミーデータ】木曜 13:30-14:30 / カット・シャンプー（中学生） 鼻脱毛 頭皮スパ'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-13T13:30:00+09:00'::timestamptz, '2026-08-13T14:30:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-junior-high'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 2 from ins cross join public.menus m where m.slug = 'opt-nose-wax'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 3 from ins cross join public.menus m where m.slug = 'opt-scalp-spa';

-- 21. 2026-08-13(木) 15:00-15:30  山口 直樹 様  2,900円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-13T15:00:00+09:00'::timestamptz, '2026-08-13T15:30:00+09:00'::timestamptz, '山口 直樹', 'dummy21@dummy.example', '090-4086-9433',
         2900, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】木曜 15:00-15:30 / カット・シャンプー（中学生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-13T15:00:00+09:00'::timestamptz, '2026-08-13T15:30:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-junior-high';

-- 22. 2026-08-13(木) 15:45-16:20  高橋 誠 様  3,000円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-13T15:45:00+09:00'::timestamptz, '2026-08-13T16:20:00+09:00'::timestamptz, '高橋 誠', 'dummy22@dummy.example', '090-7447-6244',
         3000, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】木曜 15:45-16:20 / カット・シャンプー（0歳〜小学生） 鼻脱毛'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-13T15:45:00+09:00'::timestamptz, '2026-08-13T16:20:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-child'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 2 from ins cross join public.menus m where m.slug = 'opt-nose-wax';

-- 23. 2026-08-13(木) 17:00-18:05  森 和也 様  4,500円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-13T17:00:00+09:00'::timestamptz, '2026-08-13T18:05:00+09:00'::timestamptz, '森 和也', 'dummy23@dummy.example', '090-6201-4445',
         4500, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】木曜 17:00-18:05 / 初回+15分 / カット・シャンプー（大人） お顔剃り'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-13T17:00:00+09:00'::timestamptz, '2026-08-13T18:05:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 2 from ins cross join public.menus m where m.slug = 'opt-face-shave';

-- 24. 2026-08-13(木) 18:30-19:20  伊藤 翔 様  4,500円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-13T18:30:00+09:00'::timestamptz, '2026-08-13T19:20:00+09:00'::timestamptz, '伊藤 翔', 'dummy24@dummy.example', '090-1076-7572',
         4500, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】木曜 18:30-19:20 / カット・シャンプー・顔剃り（大人）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-13T18:30:00+09:00'::timestamptz, '2026-08-13T19:20:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult-shave';

-- 25. 2026-08-14(金) 09:30-10:20  加藤 海斗 様  4,500円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-14T09:30:00+09:00'::timestamptz, '2026-08-14T10:20:00+09:00'::timestamptz, '加藤 海斗', 'dummy25@dummy.example', '090-1296-3149',
         4500, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】金曜 09:30-10:20 / カット・シャンプー・顔剃り（大人）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-14T09:30:00+09:00'::timestamptz, '2026-08-14T10:20:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult-shave';

-- 26. 2026-08-14(金) 10:45-12:25  森 悠斗 様  8,500円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-14T10:45:00+09:00'::timestamptz, '2026-08-14T12:25:00+09:00'::timestamptz, '森 悠斗', 'dummy26@dummy.example', '090-8389-1514',
         8500, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】金曜 10:45-12:25 / パーマ'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-14T10:45:00+09:00'::timestamptz, '2026-08-14T12:25:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'perm-standard';

-- 27. 2026-08-14(金) 13:45-14:15  清水 圭 様  2,900円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-14T13:45:00+09:00'::timestamptz, '2026-08-14T14:15:00+09:00'::timestamptz, '清水 圭', 'dummy27@dummy.example', '090-7275-1199',
         2900, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】金曜 13:45-14:15 / カット・シャンプー（中学生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-14T13:45:00+09:00'::timestamptz, '2026-08-14T14:15:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-junior-high';

-- 28. 2026-08-14(金) 14:30-15:15  伊藤 涼 様  2,900円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-14T14:30:00+09:00'::timestamptz, '2026-08-14T15:15:00+09:00'::timestamptz, '伊藤 涼', 'dummy28@dummy.example', '090-4925-9843',
         2900, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】金曜 14:30-15:15 / 初回+15分 / カット・シャンプー（中学生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-14T14:30:00+09:00'::timestamptz, '2026-08-14T15:15:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-junior-high';

-- 29. 2026-08-14(金) 15:30-16:10  田中 駿 様  2,600円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-14T15:30:00+09:00'::timestamptz, '2026-08-14T16:10:00+09:00'::timestamptz, '田中 駿', 'dummy29@dummy.example', '090-9111-7484',
         2600, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】金曜 15:30-16:10 / 初回+15分 / カット・シャンプー（0歳〜小学生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-14T15:30:00+09:00'::timestamptz, '2026-08-14T16:10:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-child';

-- 30. 2026-08-14(金) 17:00-17:45  池田 大輔 様  3,900円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-14T17:00:00+09:00'::timestamptz, '2026-08-14T17:45:00+09:00'::timestamptz, '池田 大輔', 'dummy30@dummy.example', '090-7638-5358',
         3900, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】金曜 17:00-17:45 / カット・シャンプー（大人） 鼻脱毛'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-14T17:00:00+09:00'::timestamptz, '2026-08-14T17:45:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 2 from ins cross join public.menus m where m.slug = 'opt-nose-wax';

-- 31. 2026-08-14(金) 18:00-18:45  田中 健太 様  3,300円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-14T18:00:00+09:00'::timestamptz, '2026-08-14T18:45:00+09:00'::timestamptz, '田中 健太', 'dummy31@dummy.example', '090-3592-9729',
         3300, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】金曜 18:00-18:45 / カット・シャンプー（中学生） 耳洗い'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-14T18:00:00+09:00'::timestamptz, '2026-08-14T18:45:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-junior-high'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 2 from ins cross join public.menus m where m.slug = 'opt-ear-wash';

-- 32. 2026-08-14(金) 19:00-19:30  吉田 大輔 様  2,900円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-14T19:00:00+09:00'::timestamptz, '2026-08-14T19:30:00+09:00'::timestamptz, '吉田 大輔', 'dummy32@dummy.example', '090-1977-4299',
         2900, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】金曜 19:00-19:30 / カット・シャンプー（中学生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-14T19:00:00+09:00'::timestamptz, '2026-08-14T19:30:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-junior-high';

-- 33. 2026-08-15(土) 09:00-09:35  清水 健太 様  3,500円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-15T09:00:00+09:00'::timestamptz, '2026-08-15T09:35:00+09:00'::timestamptz, '清水 健太', 'dummy33@dummy.example', '090-3867-4569',
         3500, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】土曜 09:00-09:35 / カット・シャンプー（大人）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-15T09:00:00+09:00'::timestamptz, '2026-08-15T09:35:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult';

-- 34. 2026-08-15(土) 10:30-11:20  渡辺 涼 様  3,500円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-15T10:30:00+09:00'::timestamptz, '2026-08-15T11:20:00+09:00'::timestamptz, '渡辺 涼', 'dummy34@dummy.example', '090-1295-7003',
         3500, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】土曜 10:30-11:20 / 初回+15分 / カット・シャンプー（大人）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-15T10:30:00+09:00'::timestamptz, '2026-08-15T11:20:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult';

-- 35. 2026-08-15(土) 11:45-12:15  吉田 海斗 様  3,200円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-15T11:45:00+09:00'::timestamptz, '2026-08-15T12:15:00+09:00'::timestamptz, '吉田 海斗', 'dummy35@dummy.example', '090-5716-3023',
         3200, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】土曜 11:45-12:15 / カット・シャンプー（高校生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-15T11:45:00+09:00'::timestamptz, '2026-08-15T12:15:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-high-school';

-- 36. 2026-08-15(土) 13:15-13:40  池田 翼 様  2,600円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-15T13:15:00+09:00'::timestamptz, '2026-08-15T13:40:00+09:00'::timestamptz, '池田 翼', 'dummy36@dummy.example', '090-9623-2551',
         2600, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】土曜 13:15-13:40 / カット・シャンプー（0歳〜小学生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-15T13:15:00+09:00'::timestamptz, '2026-08-15T13:40:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-child';

-- 37. 2026-08-15(土) 14:15-14:45  井上 圭 様  2,900円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-15T14:15:00+09:00'::timestamptz, '2026-08-15T14:45:00+09:00'::timestamptz, '井上 圭', 'dummy37@dummy.example', '090-9055-1728',
         2900, 'in_store', 'unpaid', null, 'confirmed', 'phone', '【ダミーデータ】土曜 14:15-14:45 / カット・シャンプー（中学生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-15T14:15:00+09:00'::timestamptz, '2026-08-15T14:45:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-junior-high';

-- 38. 2026-08-15(土) 15:00-15:50  小林 健太 様  4,500円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-15T15:00:00+09:00'::timestamptz, '2026-08-15T15:50:00+09:00'::timestamptz, '小林 健太', 'dummy38@dummy.example', '090-8683-5136',
         4500, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】土曜 15:00-15:50 / カット・シャンプー・顔剃り（大人）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-15T15:00:00+09:00'::timestamptz, '2026-08-15T15:50:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult-shave';

-- 39. 2026-08-15(土) 16:15-17:05  佐藤 駿 様  3,900円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-15T16:15:00+09:00'::timestamptz, '2026-08-15T17:05:00+09:00'::timestamptz, '佐藤 駿', 'dummy39@dummy.example', '090-7412-9661',
         3900, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】土曜 16:15-17:05 / カット・シャンプー（高校生） 頭皮スパ'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-15T16:15:00+09:00'::timestamptz, '2026-08-15T17:05:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-high-school'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 2 from ins cross join public.menus m where m.slug = 'opt-scalp-spa';

-- 40. 2026-08-15(土) 17:30-19:00  山田 翼 様  7,000円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-15T17:30:00+09:00'::timestamptz, '2026-08-15T19:00:00+09:00'::timestamptz, '山田 翼', 'dummy40@dummy.example', '090-7863-2514',
         7000, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】土曜 17:30-19:00 / カラー'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-15T17:30:00+09:00'::timestamptz, '2026-08-15T19:00:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'color-standard';

-- 41. 2026-08-16(日) 09:00-09:40  佐藤 隼人 様  3,000円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-16T09:00:00+09:00'::timestamptz, '2026-08-16T09:40:00+09:00'::timestamptz, '佐藤 隼人', 'dummy41@dummy.example', '090-6644-9720',
         3000, 'in_store', 'unpaid', null, 'confirmed', 'phone', '【ダミーデータ】日曜 09:00-09:40 / カット・シャンプー（0歳〜小学生） 耳洗い'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-16T09:00:00+09:00'::timestamptz, '2026-08-16T09:40:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-child'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 2 from ins cross join public.menus m where m.slug = 'opt-ear-wash';

-- 42. 2026-08-16(日) 10:00-10:35  林 誠 様  3,500円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-16T10:00:00+09:00'::timestamptz, '2026-08-16T10:35:00+09:00'::timestamptz, '林 誠', 'dummy42@dummy.example', '090-5085-4066',
         3500, 'in_store', 'unpaid', null, 'confirmed', 'phone', '【ダミーデータ】日曜 10:00-10:35 / カット・シャンプー（大人）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-16T10:00:00+09:00'::timestamptz, '2026-08-16T10:35:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult';

-- 43. 2026-08-16(日) 11:00-11:35  林 和也 様  3,500円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-16T11:00:00+09:00'::timestamptz, '2026-08-16T11:35:00+09:00'::timestamptz, '林 和也', 'dummy43@dummy.example', '090-8251-1100',
         3500, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】日曜 11:00-11:35 / カット・シャンプー（大人）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-16T11:00:00+09:00'::timestamptz, '2026-08-16T11:35:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult';

-- 44. 2026-08-16(日) 12:15-12:45  伊藤 翼 様  3,200円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-16T12:15:00+09:00'::timestamptz, '2026-08-16T12:45:00+09:00'::timestamptz, '伊藤 翼', 'dummy44@dummy.example', '090-5574-4253',
         3200, 'in_store', 'unpaid', null, 'confirmed', 'phone', '【ダミーデータ】日曜 12:15-12:45 / カット・シャンプー（高校生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-16T12:15:00+09:00'::timestamptz, '2026-08-16T12:45:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-high-school';

-- 45. 2026-08-16(日) 14:00-15:35  伊藤 優作 様  5,900円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-16T14:00:00+09:00'::timestamptz, '2026-08-16T15:35:00+09:00'::timestamptz, '伊藤 優作', 'dummy45@dummy.example', '090-1117-8525',
         5900, 'in_store', 'unpaid', null, 'confirmed', 'phone', '【ダミーデータ】日曜 14:00-15:35 / ヘッドスパコース 耳洗い'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-16T14:00:00+09:00'::timestamptz, '2026-08-16T15:35:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'course-headspa'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 2 from ins cross join public.menus m where m.slug = 'opt-ear-wash';

-- 46. 2026-08-16(日) 16:00-16:30  山口 翔 様  3,200円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-16T16:00:00+09:00'::timestamptz, '2026-08-16T16:30:00+09:00'::timestamptz, '山口 翔', 'dummy46@dummy.example', '090-1604-6517',
         3200, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】日曜 16:00-16:30 / カット・シャンプー（高校生）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-16T16:00:00+09:00'::timestamptz, '2026-08-16T16:30:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-high-school';

-- 47. 2026-08-16(日) 16:45-17:30  小林 涼 様  3,300円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-16T16:45:00+09:00'::timestamptz, '2026-08-16T17:30:00+09:00'::timestamptz, '小林 涼', 'dummy47@dummy.example', '090-4373-9310',
         3300, 'in_store', 'unpaid', null, 'confirmed', 'phone', '【ダミーデータ】日曜 16:45-17:30 / カット・シャンプー（中学生） 耳洗い'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-16T16:45:00+09:00'::timestamptz, '2026-08-16T17:30:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-junior-high'
  union all
  select ins.id, m.id, m.name, m.price, m.duration_min, 2 from ins cross join public.menus m where m.slug = 'opt-ear-wash';

-- 48. 2026-08-16(日) 18:15-18:50  中村 隼人 様  3,500円
with ins as (
  insert into public.reservations (
    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,
    total_price, payment_method, payment_status, stripe_payment_intent,
    status, source, notes
  )
  select null, '2026-08-16T18:15:00+09:00'::timestamptz, '2026-08-16T18:50:00+09:00'::timestamptz, '中村 隼人', 'dummy48@dummy.example', '090-9919-8527',
         3500, 'in_store', 'unpaid', null, 'confirmed', 'web', '【ダミーデータ】日曜 18:15-18:50 / カット・シャンプー（大人）'
  where not exists (
    select 1 from public.reservations x
    where x.status in ('pending','confirmed')
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange('2026-08-16T18:15:00+09:00'::timestamptz, '2026-08-16T18:50:00+09:00'::timestamptz, '[)')
  )
  returning id
)
insert into public.reservation_items
  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)
  select ins.id, m.id, m.name, m.price, m.duration_min, 1 from ins cross join public.menus m where m.slug = 'cut-adult';

-- ----------------------------------------------------------------------------
-- 確認用: 入ったダミーの一覧
-- ----------------------------------------------------------------------------
select start_at at time zone 'Asia/Tokyo' as jst_start,
       end_at   at time zone 'Asia/Tokyo' as jst_end,
       code, customer_name, total_price, status, source
from public.reservations
where customer_email like '%@dummy.example'
order by start_at;

-- ----------------------------------------------------------------------------
-- 【ダミーを全部消したいとき】下の 2 行だけを実行してください
-- ----------------------------------------------------------------------------
-- delete from public.reservation_items where reservation_id in (
--   select id from public.reservations where customer_email like '%@dummy.example');
-- delete from public.reservations where customer_email like '%@dummy.example';
