-- ============================================================================
-- 料金改定の反映（2026-09 時点の公式サイト https://www.stonesbarber.com/メニュー/ 準拠）
--
-- オプション（頭皮スパ・フェイススパ・フェイスパック・角質落とし・耳洗い・
-- 鼻脱毛・眉毛剃・分け目ライン・スキンフェード）は据え置きのため対象外。
-- 所要時間（duration_min）も変更なし。
--
-- 要確認（公式サイトの表記どおりに入れている）:
--   縮毛矯正 … 本体 9,500円〜 / 顔剃込 9,500円〜 で同額。
--   他カテゴリは「顔剃込 +1,000円」なので、サイト側の更新漏れの可能性がある。
--   オーナー様に確認が取れたら note を修正すること。
-- ============================================================================

-- --- カット ---------------------------------------------------------------
update public.menus set price = 4800 where slug = 'cut-adult-shave';       -- 4,500 → 4,800
update public.menus set price = 3800 where slug = 'cut-adult';             -- 3,500 → 3,800
update public.menus set price = 3300 where slug = 'cut-high-school';       -- 3,200 → 3,300
update public.menus set price = 3000 where slug = 'cut-junior-high';       -- 2,900 → 3,000
update public.menus set price = 2700 where slug = 'cut-child';             -- 2,600 → 2,700

-- --- コース ---------------------------------------------------------------
-- サイト上で「★メンズカット = カット・シャンプー・顔剃り」と定義が明示されたので
-- 説明文もあわせて更新する。
update public.menus
set price = 5800,                                                          -- 5,500 → 5,800
    description = 'カット・シャンプー・顔剃り ＋ 頭皮スパ ＋ 耳洗い'
where slug = 'course-headspa';

update public.menus
set price = 5800,                                                          -- 5,500 → 5,800
    description = 'カット・シャンプー・顔剃り ＋ 角質落とし ＋ フェイススパ ＋ フェイスパック'
where slug = 'course-facespa';

update public.menus
set price = 6800,                                                          -- 6,500 → 6,800
    description = 'カット・シャンプー・顔剃り ＋ ヘッドスパコース ＋ フェイススパコース の全部入り'
where slug = 'course-king';

-- --- カラー（すべてカット込）-----------------------------------------------
update public.menus
set price = 7500, price_label = '7,500円〜', note = '顔剃込 +1,000円'       -- 7,000 → 7,500
where slug = 'color-standard';

update public.menus
set price = 9000, price_label = '9,000円〜', note = '顔剃込 +1,000円'       -- 8,500 → 9,000
where slug = 'color-bleach';

update public.menus
set price = 9500, price_label = '9,500円〜', note = '顔剃込 +1,000円'       -- 9,000 → 9,500
where slug = 'color-mesh';

update public.menus
set price = 6000, note = '顔剃込 7,000円'                                   -- 5,500 → 6,000
where slug = 'color-gray-blend';

-- --- パーマ（すべてカット込）-----------------------------------------------
update public.menus
set price = 9000, price_label = '9,000円〜', note = '顔剃込 +1,000円'       -- 8,500 → 9,000
where slug = 'perm-standard';

update public.menus
set price = 9300, price_label = '9,300円〜'                                 -- 8,800 → 9,300
where slug = 'perm-spiral';

update public.menus
set price = 9500, price_label = '9,500円〜'                                 -- 9,000 → 9,500
where slug = 'perm-twist-spiral';

update public.menus
set price = 9000, price_label = '9,000円〜'                                 -- 8,500 → 9,000
where slug = 'perm-wet';

update public.menus
set price = 11700, price_label = '11,700円〜'                               -- 10,500 → 11,700
where slug = 'perm-twist';

-- --- 縮毛矯正 -------------------------------------------------------------
update public.menus
set price = 9500, price_label = '9,500円〜', note = '顔剃込 9,500円〜'      -- 9,000 → 9,500
where slug = 'straighten-standard';

-- --- 反映確認 -------------------------------------------------------------
select slug, name, price, price_label, note
from public.menus
where is_option = false
order by sort_order;
