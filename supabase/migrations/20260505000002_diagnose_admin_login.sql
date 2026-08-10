-- ============================================================================
-- 管理者ログインができないときの診断 SQL。
-- ふつうの運用では実行不要。問題切り分け時に Supabase の SQL Editor で流す。
-- ============================================================================

-- 1) auth.users にこのメールが存在するか?
--    存在しない → ダッシュボード Authentication → Users で "Add user" 必要
select
  id,
  email,
  email_confirmed_at,
  created_at
from auth.users
where lower(email) = lower('riku20040116@gmail.com');

-- 2) public.profiles にこのメールが存在し、role が admin か?
--    profiles に行が無い場合 → handle_new_user トリガが走らなかった可能性。
--    role が customer の場合 → 別途昇格 SQL が必要。
select
  id,
  email,
  role,
  created_at
from public.profiles
where lower(email) = lower('riku20040116@gmail.com');

-- 3) profiles を直接 admin に昇格（role が customer のままなら実行）
--    （冪等。既に admin なら何も変わらない）
update public.profiles
set role = 'admin'
where lower(email) = lower('riku20040116@gmail.com')
  and role <> 'admin';

-- 4) auth.users の email_confirmed_at が NULL のとき
--    → "Auto Confirm User" がオフのまま登録された。確認メールを開くか、
--      下記でメール確認状態を強制 ON にする（運用上の最終手段）。
--    実行する場合のみコメントを外す。
-- update auth.users
-- set email_confirmed_at = coalesce(email_confirmed_at, now())
-- where lower(email) = lower('riku20040116@gmail.com');
