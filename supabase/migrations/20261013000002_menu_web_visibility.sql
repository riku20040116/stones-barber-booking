-- ============================================================================
-- オーナー様の返信（2026-10-13・2 回目）の反映
--
--   ① カット・シャンプー（0歳〜小学生）… 25 分 → 45 分
--   ② ツイスト                         … 130 分 → 180 分
--   ③ オプションは、ネット予約では「お顔剃り」「スキンフェード」の 2 つだけにする。
--      ほかの 8 つは、お店のメニューとしては残す（消さない・販売停止にもしない）。
--      → メニューに「ネット予約に出すか」の列（show_on_web）を足し、8 つだけ false にする。
--         手動予約登録・手書き予約表の取り込みでは、今までどおり選べる。
--
-- 料金は変えない。すでに入っている予約も変えない。何度実行しても同じ結果になる。
--
-- 実行の順番: この SQL を先に実行してから、アプリを本番に反映する。
--   （先に実行しても、今のアプリは新しい列を見ないので何も変わらない。
--     ①② の時間だけが、実行した時点でネット予約に反映される）
-- ============================================================================

-- --- ①② 所要時間 ---------------------------------------------------------
update public.menus set duration_min = 45  where slug = 'cut-child';   -- 25 → 45
update public.menus set duration_min = 180 where slug = 'perm-twist';  -- 130 → 180

-- --- ③ ネット予約に出すかどうか ---------------------------------------------
alter table public.menus
  add column if not exists show_on_web boolean not null default true;

comment on column public.menus.show_on_web is
  'ネット予約のメニューに出すか。false でもお店のメニューとしては有効（手動登録・手書き取り込みでは選べる）';

update public.menus set show_on_web = false
where slug in (
  'opt-scalp-spa',      -- 頭皮スパ
  'opt-face-spa',       -- フェイススパ
  'opt-face-pack',      -- フェイスパック
  'opt-exfoliation',    -- 角質落とし
  'opt-ear-wash',       -- 耳洗い
  'opt-nose-wax',       -- 鼻脱毛
  'opt-eyebrow-shave',  -- 眉毛剃
  'opt-design-line'     -- 分け目ライン・デザインライン
);

-- --- 反映確認（実行すると下に一覧が出る）-----------------------------------
select slug, name, duration_min, is_active, show_on_web
from public.menus
order by sort_order;
