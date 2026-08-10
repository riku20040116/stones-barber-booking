# デプロイ手順（Web予約アプリ）

GitHub にコードを置き、Vercel がそれを読んで公開する、という流れ。
所要 15 分ほど。

---

## 前提

- ローカルの `C:\dev\stones-barber-booking` はコミット済み（`main` ブランチ）
- GitHub アカウント: `riku20040116`
- Vercel には既存プロジェクト `stones-barber` がある（そのまま残す）

---

## 1. GitHub にリポジトリを作る

<https://github.com/new> を開いて、次のとおり入力する。

| 項目 | 値 |
| --- | --- |
| Repository name | `stones-barber-booking` |
| Description | （空でよい） |
| 公開設定 | **Private** を選ぶ |
| Add a README file | **チェックしない** |
| .gitignore / license | **どちらも None** |

「Create repository」を押す。

> README や .gitignore を追加すると、こちらから push するときに衝突する。
> 必ず空のまま作ること。

## 2. コードを push する

リポジトリを作ったら、私に「作りました」と伝えてください。
こちらで次を実行します（手動でやる場合はこのコマンド）。

```bash
cd C:\dev\stones-barber-booking && git remote add origin https://github.com/riku20040116/stones-barber-booking.git && git push -u origin main
```

## 3. Vercel にインポートする

1. <https://vercel.com/new> を開く
2. `stones-barber-booking` を探して「Import」
   - 出てこない場合は「Adjust GitHub App Permissions」から
     このリポジトリへのアクセスを許可する
3. 設定はすべて既定のままでよい
   （Framework Preset が Next.js になっていることだけ確認）
4. **まだ Deploy は押さない。** 先に環境変数を入れる

## 4. 環境変数を入れる

`C:\dev\stones-barber-booking\.env.production.txt` をメモ帳などで開き、
中身を全部コピーする。

Vercel のインポート画面の「Environment Variables」を開き、
貼り付け欄にそのまま貼る（Vercel が自動で 1 行ずつに分解してくれる）。

- Environment は **Production / Preview / Development を全部チェック**
- `#` で始まる行はコメントなので、貼っても無視される

貼り終わったら「Deploy」を押す。

## 5. URL を確定させる

デプロイが終わると `https://stones-barber-booking.vercel.app` のような
URL が発行される。実際の URL を確認したら:

1. Vercel → Settings → Environment Variables
2. `NEXT_PUBLIC_APP_URL` を**実際の URL** に書き換える
3. Deployments → 最新のものの「…」→ **Redeploy**

> ここを直さないと、お客様に届く予約完了メールのリンクが
> 間違った URL を指してしまう。

## 6. Deployment Protection を切る

Vercel の既定では、プロジェクトに Vercel のログインがないと見られない
設定（Deployment Protection）が入っていることがある。
オーナー様はこれを持っていないので切る。

Settings → Deployment Protection → **Vercel Authentication を Disabled**

> これを切っても誰でも見られるようにはならない。
> このアプリは自前の Basic 認証（STONES / 2018）で守られている。

## 7. 動作確認

| 確認すること | 期待する結果 |
| --- | --- |
| URL を開く | ID / パスワードを聞くポップアップが出る |
| `STONES` / `2018` を入力 | 予約トップページが表示される |
| `/admin` を開く | Basic 認証なしでログイン画面が出る |
| 管理者でログイン | `inotokoya1119@yahoo.co.jp` で入れる |
| テスト予約を 1 件入れる | 予約者とオーナーにメールが届く |

テスト予約は管理画面から削除できる。

## 8. Cron の確認

Settings → Cron Jobs に `/api/cron/daily` が 1 つだけ出ていること。

あわせて **既存プロジェクト `stones-barber` 側の Cron が空になっている**ことも
確認する（`vercel.json` から外して push 済みだが、再デプロイしないと反映されない）。
詳しくは `C:\dev\stones-barber\docs\cron-ownership.md` を参照。

---

## 補足: 独自ドメインについて

`book.stonesbarber.com` のようなサブドメインは、Jimdo が CNAME レコードを
設定できないため使えない（Jimdo サポート確認済み）。
`*.vercel.app` のまま運用する。
