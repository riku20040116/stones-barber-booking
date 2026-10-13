-- ============================================================================
-- メニューの所要時間の見直し（2026-10-13 オーナー様の LINE の返信どおり）
--
--   実際の施術より少し長めに枠を取り、紙の予約表の書き方（カット 45 分など）に合わせる。
--   料金は変えない。すでに入っている予約の時間も変えない（これから入る予約から新しい時間になる）。
--   何度実行しても同じ結果になる。
--
-- この SQL に入れていないもの（オーナー様に確認中）:
--   - カット・シャンプー（0歳〜小学生） … 今 25 分のまま
--   - ツイスト                         … 今 130 分のまま
--   - オプション（お顔剃り・スキンフェード以外の 8 つをどうするか）… 今のまま
--
-- 変えないもの: カラー 90 分 / ブリーチ 120 分 / ツイストスパイラルパーマ 120 分 /
--               お顔剃り 15 分 / スキンフェード 15 分（返信の時間が今と同じ）
-- ============================================================================

-- --- カット ---------------------------------------------------------------
update public.menus set duration_min = 60  where slug = 'cut-adult-shave';      -- 50 → 60
update public.menus set duration_min = 45  where slug = 'cut-adult';            -- 35 → 45
update public.menus set duration_min = 45  where slug = 'cut-high-school';      -- 30 → 45
update public.menus set duration_min = 45  where slug = 'cut-junior-high';      -- 30 → 45

-- --- コース ---------------------------------------------------------------
update public.menus set duration_min = 75  where slug = 'course-headspa';       -- 80 → 75
update public.menus set duration_min = 75  where slug = 'course-facespa';       -- 80 → 75
update public.menus set duration_min = 90  where slug = 'course-king';          -- 110 → 90

-- --- カラー ---------------------------------------------------------------
update public.menus set duration_min = 120 where slug = 'color-mesh';           -- 110 → 120
update public.menus set duration_min = 90  where slug = 'color-gray-blend';     -- 70 → 90

-- --- パーマ ---------------------------------------------------------------
update public.menus set duration_min = 120 where slug = 'perm-standard';        -- 100 → 120
update public.menus set duration_min = 120 where slug = 'perm-spiral';          -- 110 → 120
update public.menus set duration_min = 105 where slug = 'perm-wet';             -- 100 → 105

-- --- 縮毛矯正 -------------------------------------------------------------
update public.menus set duration_min = 120 where slug = 'straighten-standard';  -- 150 → 120

-- --- 反映確認（実行すると下に一覧が出る）-----------------------------------
select slug, name, duration_min, price, is_active
from public.menus
order by sort_order;
