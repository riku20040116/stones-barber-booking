-- ============================================================================
-- オプションメニューに「お顔剃り」を追加する。
--   価格 1,000円 / 所要 15分
--   オプション一覧の先頭に出したいので sort_order は既存の頭（510）より小さい 505。
-- ============================================================================
insert into public.menus (
  slug, category, name, description,
  price, price_label, duration_min, note,
  is_option, age_group, sort_order, is_active
)
values (
  'opt-face-shave', 'option', 'お顔剃り', '産毛までしっかり。お肌の角質もオフしてすっきり。',
  1000, null, 15, null,
  true, null, 505, true
)
on conflict (slug) do update set
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  price_label = excluded.price_label,
  duration_min = excluded.duration_min,
  note = excluded.note,
  is_option = excluded.is_option,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;
