-- ============================================================================
-- 顧客リスト（customers）
--
-- 目的:
--   1) Web 予約・管理画面の手動登録・手書き予約表の取り込み、どの経路で予約が
--      入っても顧客リストが自動で更新されるようにする。
--   2) 手書き予約表の「名前」から顧客を特定できるようにする。
--
-- 仕組み:
--   reservations に customer_record_id を足し、BEFORE INSERT/UPDATE トリガで
--   顧客を特定（なければ作成）して紐づける。経路ごとにコードを書かなくてよい。
--
-- 顧客の特定ルール（resolve_customer_id）:
--   1. メールアドレスが一致                   → 同じ人
--   2. 電話番号 と 名前 が両方一致            → 同じ人
--      （電話番号だけだと、家族で番号を共有している父と息子を同じ人にしてしまう）
--   3. 名前が一致 かつ 相手に連絡先が無い     → 同じ人
--      （手書き予約で名前だけ登録された人が、あとで Web 予約してきたケース）
--   4. どれにも当たらない                     → 新しい顧客を作る
--
-- 既に入っている値は上書きしない。空欄だけ埋める。
-- 誤って別人に紐づいても、手入力した情報が消えることは無い。
--
-- 「customer_id」は Supabase Auth のユーザー（profiles）を指す既存の列で、
-- ログインしないお客様が大半のため実質使われていない。混同しないよう
-- 新しい列は customer_record_id という名前にしている。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 名前・電話番号の比較用キー
-- ----------------------------------------------------------------------------
-- 名前: 全角/半角の揺れ（ＡＢＣ / ABC、全角スペース）を吸収し、空白を除いて小文字化。
--       「田中 太郎」「田中　太郎」「田中太郎」を同じものとして扱う。
-- plpgsql にしているのは、SQL 関数だとインライン展開されて索引の IMMUTABLE 判定が
-- 中身（normalize）に対して行われ、環境によっては索引作成が失敗するため。
create or replace function public.customer_name_key(p_name text)
returns text language plpgsql immutable as $$
begin
  return lower(regexp_replace(normalize(coalesce(p_name, ''), NFKC), '\s+', '', 'g'));
end;
$$;

-- 電話番号: 数字だけを残す。「090-1234-5678」「09012345678」「090 1234 5678」を同一視。
create or replace function public.phone_digits(p_phone text)
returns text language plpgsql immutable as $$
begin
  return regexp_replace(normalize(coalesce(p_phone, ''), NFKC), '\D', '', 'g');
end;
$$;

-- ----------------------------------------------------------------------------
-- 顧客テーブル
-- ----------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone text,
  email text,
  notes text,
  -- どこから最初に登録されたか。手書き由来は連絡先が欠けていることが多い。
  source text not null default 'web'
    check (source in ('web', 'admin', 'handwritten')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_email_idx
  on public.customers (lower(email));
create index if not exists customers_phone_idx
  on public.customers (public.phone_digits(phone));
create index if not exists customers_name_idx
  on public.customers (public.customer_name_key(name));

drop trigger if exists set_updated_at_customers on public.customers;
create trigger set_updated_at_customers before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
drop policy if exists "customers_admin_all" on public.customers;
create policy "customers_admin_all" on public.customers
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 予約 → 顧客の紐づけ
-- ----------------------------------------------------------------------------
alter table public.reservations
  add column if not exists customer_record_id uuid
    references public.customers(id) on delete set null;
create index if not exists reservations_customer_record_idx
  on public.reservations (customer_record_id);

-- 手書き予約表からの取り込みを source として区別できるようにする。
-- 既存の制約は名前を決め打ちせずに探して消す（自動命名の名前が環境で違っても、
-- 古い制約が残って 'handwritten' を弾く、ということが起きないように）。
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%source%'
  loop
    execute format('alter table public.reservations drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.reservations add constraint reservations_source_check
  check (source in ('web', 'phone', 'walkin', 'handwritten'));

-- ----------------------------------------------------------------------------
-- 顧客の特定（なければ作成）
-- ----------------------------------------------------------------------------
create or replace function public.resolve_customer_id(
  p_name text,
  p_email text,
  p_phone text,
  p_source text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_digits text := nullif(public.phone_digits(p_phone), '');
  v_key text := public.customer_name_key(p_name);
begin
  -- 1. メールアドレス
  if v_email is not null then
    select c.id into v_id from public.customers c
    where lower(c.email) = v_email
    order by c.created_at limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  -- 2. 電話番号 + 名前
  if v_digits is not null and v_key <> '' then
    select c.id into v_id from public.customers c
    where public.phone_digits(c.phone) = v_digits
      and public.customer_name_key(c.name) = v_key
    order by c.created_at limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  -- 3. 名前が一致し、相手に連絡先が何も無い（手書きで名前だけ登録された人）
  if v_key <> '' then
    select c.id into v_id from public.customers c
    where public.customer_name_key(c.name) = v_key
      and coalesce(c.phone, '') = ''
      and coalesce(c.email, '') = ''
    order by c.created_at limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  -- 4. 新規作成
  insert into public.customers (name, phone, email, source)
  values (
    trim(coalesce(p_name, '（名前不明）')),
    nullif(trim(coalesce(p_phone, '')), ''),
    v_email,
    case when p_source in ('web', 'admin', 'handwritten') then p_source else 'admin' end
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Web から直接呼ばれると、誰でも顧客を作ったり既存の顧客の有無を探れたりする。
-- トリガ（所有者権限で動く）からだけ使うので、外部からの実行は禁止する。
revoke execute on function public.resolve_customer_id(text, text, text, text)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 予約の INSERT / 連絡先の UPDATE で顧客リストを自動更新するトリガ
-- ----------------------------------------------------------------------------
create or replace function public.sync_reservation_customer()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.customer_record_id is null then
    new.customer_record_id := public.resolve_customer_id(
      new.customer_name,
      new.customer_email,
      new.customer_phone,
      case new.source
        when 'web' then 'web'
        when 'handwritten' then 'handwritten'
        else 'admin'
      end
    );
  end if;

  -- 顧客側の空欄だけを予約の連絡先で埋める（既存の値は上書きしない）
  update public.customers c
  set phone = coalesce(nullif(c.phone, ''), nullif(trim(coalesce(new.customer_phone, '')), '')),
      email = coalesce(nullif(c.email, ''), nullif(lower(trim(coalesce(new.customer_email, ''))), ''))
  where c.id = new.customer_record_id
    and (
      (coalesce(c.phone, '') = '' and coalesce(trim(new.customer_phone), '') <> '')
      or (coalesce(c.email, '') = '' and coalesce(trim(new.customer_email), '') <> '')
    );

  return new;
end;
$$;

drop trigger if exists sync_reservation_customer_trg on public.reservations;
create trigger sync_reservation_customer_trg
  before insert or update of customer_name, customer_email, customer_phone, customer_record_id
  on public.reservations
  for each row execute function public.sync_reservation_customer();

-- ----------------------------------------------------------------------------
-- 一覧表示用のビュー（来店回数・最終来店・次回予約）
--   security_invoker = true なので、見られるかどうかは customers / reservations の
--   RLS に従う（= 管理者だけ）。
-- ----------------------------------------------------------------------------
create or replace view public.customer_summaries
with (security_invoker = true) as
select
  c.id,
  c.name,
  c.phone,
  c.email,
  c.notes,
  c.source,
  c.created_at,
  c.updated_at,
  count(r.id) filter (
    where r.status = 'completed'
       or (r.status = 'confirmed' and r.start_at < now())
  )::int as visit_count,
  max(r.start_at) filter (
    where r.status in ('completed', 'confirmed') and r.start_at < now()
  ) as last_visit_at,
  min(r.start_at) filter (
    where r.status in ('pending', 'confirmed') and r.start_at >= now()
  ) as next_reservation_at,
  count(r.id) filter (
    where r.status in ('pending', 'confirmed') and r.start_at >= now()
  )::int as upcoming_count
from public.customers c
left join public.reservations r on r.customer_record_id = c.id
group by c.id;

revoke all on public.customer_summaries from anon;
grant select on public.customer_summaries to authenticated;

-- ----------------------------------------------------------------------------
-- 既存の予約から顧客リストを作る（古い予約から順に処理して、同じ人をまとめる）
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select id, customer_name, customer_email, customer_phone, source
    from public.reservations
    where customer_record_id is null
    order by created_at
  loop
    update public.reservations
    set customer_record_id = public.resolve_customer_id(
      r.customer_name,
      r.customer_email,
      r.customer_phone,
      case r.source
        when 'web' then 'web'
        when 'handwritten' then 'handwritten'
        else 'admin'
      end
    )
    where id = r.id;
  end loop;
end $$;

-- 反映確認
select
  (select count(*) from public.customers) as customers,
  (select count(*) from public.reservations where customer_record_id is null) as unlinked_reservations;
