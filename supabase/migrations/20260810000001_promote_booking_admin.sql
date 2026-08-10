-- ============================================================================
-- Web予約アプリの管理者ユーザーを admin ロールに昇格する。
--
-- 推奨は `node scripts/create-admin.mjs`（アカウント作成と昇格を一度に行う）。
-- ダッシュボードから手作業でやりたい場合はこちらを使う。
--
-- 手順:
--   1) Supabase ダッシュボード → Authentication → Users → "Add user"
--      → "Create new user"
--        Email    : inotokoya1119@yahoo.co.jp
--        Password : （設定したパスワード）
--        "Auto Confirm User" にチェックを入れる
--   2) handle_new_user() トリガが public.profiles に行を1つ作る（role = 'customer'）
--   3) この SQL を SQL Editor で実行して admin に昇格する
--
-- 既に admin の場合は何もしない（冪等）。
-- ============================================================================
update public.profiles
set role = 'admin',
    updated_at = now()
where lower(email) = lower('inotokoya1119@yahoo.co.jp')
  and role <> 'admin';

-- 反映確認用（0 行なら手順1のユーザー作成がまだ）
select id, email, role
from public.profiles
where lower(email) = lower('inotokoya1119@yahoo.co.jp');
