# STONE'S BARBER Web予約アプリ

理容室 STONE'S BARBER（福岡市東区若宮）の **Web予約専用アプリ**。
店舗紹介サイト（<https://www.stonesbarber.com/>）とは役割を分け、
このアプリは「予約すること」と「予約を管理すること」だけを扱う。

- 予約フルサイト版（紹介ページ込み）: `C:\dev\stones-barber`
- このアプリ: 予約 + 予約に関わる管理だけ

---

## 画面構成

### お客様向け（Web予約画面）

| パス | 内容 |
| --- | --- |
| `/` | 予約導線・営業時間・営業日カレンダー・管理者画面への遷移 |
| `/reservations/new` | 予約ウィザード（メニュー → 日時 → お客様情報 → 確認） |
| `/reservations/lookup` | 予約の確認・キャンセル |

### 店舗スタッフ向け（管理者画面）

Web予約画面に出る内容を決めるものだけを置いている。

| パス | 内容 |
| --- | --- |
| `/admin` | ダッシュボード（今日の予約・今週の件数） |
| `/admin/reservations` | 予約一覧・詳細・日時変更・キャンセル |
| `/admin/reservations/new` | 手動予約登録（電話予約の記帳） |
| `/admin/reservations/force-cancel` | 期限を過ぎた予約の強制キャンセル |
| `/admin/calendar` | 予約カレンダー |
| `/admin/menus` | メニューの追加・編集・公開/非公開 |
| `/admin/holidays` | 臨時休業・特別営業時間 |
| `/admin/settings` | 営業時間ルールの確認・データバックアップ |

顧客管理（CRM）や店舗紹介情報の編集はこのアプリには置いていない。

---

## 入口の認証（2段構え）

| 対象 | 方式 | 既定値 |
| --- | --- | --- |
| お客様（Web予約画面） | HTTP Basic 認証 | ID `STONES` / パスワード `2018` |
| 店舗スタッフ（`/admin`） | Supabase のメール + パスワード | `inotokoya1119@yahoo.co.jp` |

`/admin` は Basic 認証を**通さない**（`src/middleware.ts` の
`BASIC_AUTH_BYPASS_PREFIXES`）。管理画面は自前のログインで守られているので、
オーナーがパスワードを二度入れる必要がないようにしている。

Basic 認証の ID は**大文字小文字を区別する**。`stones` では通らない。

`SITE_PASSWORD` を空にすると Basic 認証が外れ、誰でも予約できる状態になる
（＝本公開）。

### 管理者アカウントの作成 / パスワード変更

```bash
npm run create-admin
```

`.env.local` の `SUPABASE_SERVICE_ROLE_KEY` を使って、
`inotokoya1119@yahoo.co.jp` を作成し `profiles.role = 'admin'` に昇格する。
既にいる場合はパスワードを上書きする。別のアカウントにしたい場合:

```bash
node scripts/create-admin.mjs someone@example.com 'PASSWORD'
```

ダッシュボードから手作業でやりたい場合は
`supabase/migrations/20260810000001_promote_booking_admin.sql` を参照。

---

## セットアップ

```bash
npm install
cp .env.local.example .env.local   # 各値を設定
npm run create-admin               # 管理者アカウントを作る
npm run dev                        # http://localhost:3100
```

Supabase のマイグレーションは `supabase/migrations/` をファイル名順に
SQL Editor で実行する。動作確認用のダミー予約は
`supabase/seed-dummy-reservations.sql`（`scripts/gen_dummy_reservations.py` で再生成可）。

### ポート

紹介サイト版（`C:\dev\stones-barber`）が 3000 を使うので、
このアプリは **3100** を使う。同時に起動しても衝突しない。

---

## ⚠ 同じ Supabase を共有するときの注意

紹介サイト版とこのアプリは**同じ Supabase プロジェクトを見ている**。
両方を Vercel にデプロイする場合、次の点に注意すること。

1. **Cron はどちらか一方だけ有効にする。**
   両方で `/api/cron/daily` が動くと、リマインドメール・バックアップ・
   月次レポートがお客様とオーナーに二重に届く。
   使わない側の `vercel.json` から `crons` を削除する。
2. **メニュー・休業日はどちらの管理画面からでも同じデータを編集できる。**
   運用は片方に寄せたほうが混乱しない。
3. **Stripe Webhook も一方だけに登録する。**

---

## 主要な技術

- Next.js 16（App Router / Server Actions / Turbopack）
- Supabase（PostgreSQL / Auth / RLS）
- Tailwind CSS v4 + shadcn/ui（Base UI）
- nodemailer（SMTP）またはResend
- Vercel

## 予約ロジックの要点

- 予約枠は **15分単位**（`src/lib/calendar.ts` の `SLOT_GRANULARITY_MIN`）
- 定休は毎週月曜 + 第3火曜（第3月曜との連休）
- 営業時間は 火〜金 9:30–19:30 / 土日 9:00–19:00
  （**祝日はコードで判定していない**。`/admin/holidays` で個別に登録する）
- 昼帯（11:00–15:00）に60分の連続空きが残らない予約は受け付けない
- 日時は必ず `src/lib/timezone.ts` の `formatInTimeZone` 系を使う。
  `date-fns-tz` の `format` はサーバーのローカルタイムゾーンで描画するため、
  Vercel（UTC）で日付がずれる。
