-- ============================================================================
-- 縮毛矯正メニューの description を「カット込」に更新する。
-- 既存の Supabase DB に対して実行することで反映される。
-- 新規環境では seed.sql 側にも同じ値が反映済み。
-- ============================================================================
update public.menus
set description = 'カット込'
where slug = 'straighten-standard'
  and (description is null or description = '');
