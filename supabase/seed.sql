-- ============================================================================
-- STONE'S BARBER 初期データ
-- ----------------------------------------------------------------------------
-- メニュー、店舗設定。
-- 適用方法:
--   supabase db reset       (ローカル環境を初期化＋seed)
--   または直接 psql で流す。
-- ============================================================================

-- メニュー
insert into public.menus (slug, category, name, description, price, price_label, duration_min, note, is_option, age_group, sort_order)
values
  ('cut-adult-shave', 'cut', 'カット・シャンプー・顔剃り（大人）', 'STONE''S BARBER の基本メニュー。顔剃り込みでさっぱり仕上げ。', 4500, null, 50, null, false, 'adult', 10),
  ('cut-adult', 'cut', 'カット・シャンプー（大人）', null, 3500, null, 35, null, false, 'adult', 20),
  ('cut-high-school', 'cut', 'カット・シャンプー（高校生）', null, 3200, null, 30, null, false, 'high-school', 30),
  ('cut-junior-high', 'cut', 'カット・シャンプー（中学生）', null, 2900, null, 30, null, false, 'junior-high', 40),
  ('cut-child', 'cut', 'カット・シャンプー（0歳〜小学生）', null, 2600, null, 25, null, false, 'child', 50),

  ('course-headspa', 'course', 'ヘッドスパコース', 'メンズカット ＋ 頭皮スパ ＋ 耳洗い', 5500, null, 80, null, false, null, 110),
  ('course-facespa', 'course', 'フェイススパコース', 'メンズカット ＋ 角質落とし ＋ フェイススパ ＋ フェイスパック', 5500, null, 80, null, false, null, 120),
  ('course-king', 'course', 'キングコース', 'メンズカット ＋ ヘッドスパコース ＋ フェイススパコース の全部入り', 6500, null, 110, null, false, null, 130),

  ('color-standard', 'color', 'カラー', '長さ・種類により料金変動。カット込。', 7000, '7,000円〜', 90, '顔剃込 +1,000円', false, null, 210),
  ('color-bleach', 'color', 'ブリーチ', 'カット込', 8500, '8,500円〜', 120, '顔剃込 +1,000円', false, null, 220),
  ('color-mesh', 'color', 'メッシュ', 'カット込', 9000, '9,000円〜', 110, '顔剃込 +1,000円', false, null, 230),
  ('color-gray-blend', 'color', '白髪ぼかし', null, 5500, null, 70, '顔剃込 6,500円', false, null, 240),

  ('perm-standard', 'perm', 'パーマ', 'カット込', 8500, '8,500円〜', 100, '顔剃込 +1,000円', false, null, 310),
  ('perm-spiral', 'perm', 'スパイラルパーマ', 'カット込', 8800, '8,800円〜', 110, null, false, null, 320),
  ('perm-twist-spiral', 'perm', 'ツイストスパイラルパーマ', 'カット込', 9000, '9,000円〜', 120, null, false, null, 330),
  ('perm-wet', 'perm', '濡れパン', 'カット込', 8500, '8,500円〜', 100, null, false, null, 340),
  ('perm-twist', 'perm', 'ツイスト', 'カット込', 10500, '10,500円〜', 130, null, false, null, 350),

  ('straighten-standard', 'straighten', '縮毛矯正', 'カット込', 9000, '9,000円〜', 150, '顔剃込 9,500円〜', false, null, 410),

  ('opt-scalp-spa', 'option', '頭皮スパ', '炭酸クレンジング ＋ 頭皮マッサージ', 700, null, 20, null, true, null, 510),
  ('opt-face-spa', 'option', 'フェイススパ', '米ぬか配合クリームで顔全体を引き上げマッサージ', 600, null, 20, null, true, null, 520),
  ('opt-face-pack', 'option', 'フェイスパック', 'リフトエッセンス／クレイの2種から選択', 300, null, 10, null, true, null, 530),
  ('opt-exfoliation', 'option', '角質落とし', '毛穴の汚れと古い角質を除去', 200, null, 10, null, true, null, 540),
  ('opt-ear-wash', 'option', '耳洗い', '炭酸泡で耳の奥までクリーニング', 400, null, 15, null, true, null, 550),
  ('opt-nose-wax', 'option', '鼻脱毛', 'ワックスで手前部分のみ。痛みほぼなし。', 400, null, 10, null, true, null, 560),
  ('opt-eyebrow-shave', 'option', '眉毛剃', null, 300, null, 5, null, true, null, 570),
  ('opt-design-line', 'option', '分け目ライン・デザインライン', '本数・種類により料金が異なります', 200, '200〜1,000円', 10, null, true, null, 580),
  ('opt-skin-fade', 'option', 'スキンフェード追加', '技術と時間を要するため別料金', 500, null, 15, null, true, null, 590)
on conflict (slug) do update set
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  price_label = excluded.price_label,
  duration_min = excluded.duration_min,
  note = excluded.note,
  is_option = excluded.is_option,
  age_group = excluded.age_group,
  sort_order = excluded.sort_order;

-- 店舗情報の公開設定（フロントエンドが SELECT する）
insert into public.settings (key, value)
values (
  'store_info',
  jsonb_build_object(
    'name', 'STONE''S BARBER',
    'concept', 'いつまでも男らしく',
    'phone', '092-231-8037',
    'address', '福岡市東区若宮2丁目2-37 永正店舗105'
  )
)
on conflict (key) do update set value = excluded.value;

-- メールテンプレート（管理画面から編集する想定。デフォルトを投入）
insert into public.settings (key, value)
values
  ('email_template_confirmation', jsonb_build_object(
    'subject', '【STONE''S BARBER】ご予約ありがとうございます',
    'greeting', '{{customer_name}} 様',
    'body', E'この度はご予約いただきありがとうございます。\n以下の内容でご予約を承りました。\n\n■ 予約番号: {{code}}\n■ 日時: {{datetime}}\n■ メニュー: {{menus}}\n■ 合計: {{total_price}}円\n\nご来店をお待ちしております。'
  )),
  ('email_template_reminder', jsonb_build_object(
    'subject', '【STONE''S BARBER】明日のご予約のリマインド',
    'greeting', '{{customer_name}} 様',
    'body', E'明日のご予約のお時間が近づきましたのでお知らせいたします。\n\n■ 予約番号: {{code}}\n■ 日時: {{datetime}}\n■ メニュー: {{menus}}\n\nお気をつけてお越しください。'
  )),
  ('email_template_cancellation', jsonb_build_object(
    'subject', '【STONE''S BARBER】ご予約をキャンセルしました',
    'greeting', '{{customer_name}} 様',
    'body', E'下記のご予約をキャンセルいたしました。\n\n■ 予約番号: {{code}}\n■ 日時: {{datetime}}\n\nまたのご利用をお待ちしております。'
  ))
on conflict (key) do nothing;
