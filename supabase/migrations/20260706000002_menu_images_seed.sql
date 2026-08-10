-- ============================================================================
-- 既存メニューに、公開サイトから取り込んだ写真を割り当てる（任意・見栄え用）。
-- 画像は public/images/site 配下にあるものを流用。
-- 管理画面のメニュー編集からいつでも差し替え可能。
-- ============================================================================
update public.menus set image_url = '/images/site/i568546dac8ece8d3.jpg' where slug = 'cut-adult-shave' and image_url is null;
update public.menus set image_url = '/images/site/i568546dac8ece8d3.jpg' where slug = 'cut-adult' and image_url is null;

update public.menus set image_url = '/images/site/i23ee0c37d140845f.jpg' where slug = 'course-headspa' and image_url is null;
update public.menus set image_url = '/images/site/i44ae15c2dc5da0a3.jpg' where slug = 'course-facespa' and image_url is null;
update public.menus set image_url = '/images/site/i99598aeaa084562e.jpg' where slug = 'course-king' and image_url is null;

update public.menus set image_url = '/images/site/i9e5b19df3ba53582.jpg' where slug = 'color-standard' and image_url is null;
update public.menus set image_url = '/images/site/ia1131cf1a93411df.jpg' where slug = 'perm-standard' and image_url is null;
update public.menus set image_url = '/images/site/i3ec519511a650a39.jpg' where slug = 'straighten-standard' and image_url is null;

update public.menus set image_url = '/images/site/idfb9a281db0b7f5a.jpg' where slug = 'opt-scalp-spa' and image_url is null;
update public.menus set image_url = '/images/site/i3185013912e90ac5.jpg' where slug = 'opt-face-spa' and image_url is null;
update public.menus set image_url = '/images/site/i80fa6f49db346f01.jpg' where slug = 'opt-ear-wash' and image_url is null;
