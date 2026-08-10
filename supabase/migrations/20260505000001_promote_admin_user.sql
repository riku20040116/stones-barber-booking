-- ============================================================================
-- 管理者ユーザーを admin ロールに昇格する。
--
-- 前提:
--   1) Supabase ダッシュボード → Authentication → Users → "Add user"
--      → "Create new user" でメール `riku20040116@gmail.com` /
--      パスワード `Riku-20040116` を作成する（"Auto Confirm User" にチェック）。
--   2) 新規ユーザー登録時に handle_new_user() トリガが
--      public.profiles に行を 1 つ自動挿入する（role = 'customer'）。
--   3) 本 SQL を SQL Editor で実行すると、その profile を admin に昇格する。
--
-- 既に admin になっている場合は何もしない（冪等）。
-- ============================================================================
update public.profiles
set role = 'admin'
where lower(email) = lower('riku20040116@gmail.com')
  and role <> 'admin';

-- 反映確認用
select id, email, role
from public.profiles
where lower(email) = lower('riku20040116@gmail.com');
