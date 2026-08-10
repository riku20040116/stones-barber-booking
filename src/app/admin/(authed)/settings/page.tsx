/**
 * 管理画面 / 営業設定。
 *
 * このアプリは「Web予約」専用なので、予約画面の中身を決めるものだけを置く。
 *  - 営業時間ルール（calendar.ts でハードコード。表示のみ）
 *  - 休業日ページへの導線
 *  - データバックアップ
 * 店舗紹介用の情報（住所・コンセプト等）は紹介サイト側で管理するため、ここには置かない。
 */
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BackupButton } from "./backup-button";

export const metadata = {
  title: "営業設定 | 管理画面",
};

const HOURS_SUMMARY = [
  { label: "月曜", value: "定休日" },
  { label: "火曜", value: "9:30〜19:30（第3週は連休）" },
  { label: "水曜〜金曜", value: "9:30〜19:30" },
  { label: "土曜・日曜・祝日", value: "9:00〜19:00" },
];

const SLOT_SUMMARY = [
  { label: "予約枠の単位", value: "15分" },
  { label: "予約受付の開始", value: "本日から" },
  { label: "お客様がキャンセルできる期限", value: "予約日の7日前まで" },
  {
    label: "7日を切ったキャンセル",
    value: "お客様は操作できません（管理画面の「強制キャンセル」で対応）",
  },
];

export default async function AdminSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
          Settings
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          営業設定
        </h1>
        <p className="text-sm text-zinc-500">
          Web予約画面の表示を決める設定です。
        </p>
      </header>

      <Card>
        <CardContent className="space-y-3 py-2">
          <div>
            <h2 className="text-sm font-medium text-zinc-700">営業時間（基本）</h2>
            <p className="text-xs text-zinc-500">
              現在はソースコードに固定されています。変更したい場合は開発者にご連絡ください。
            </p>
          </div>
          <ul className="divide-y divide-zinc-100 text-sm">
            {HOURS_SUMMARY.map((h) => (
              <li key={h.label} className="flex items-center gap-3 py-1.5">
                <span className="w-32 shrink-0 text-zinc-500">{h.label}</span>
                <span>{h.value}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-2">
          <div>
            <h2 className="text-sm font-medium text-zinc-700">予約ルール</h2>
            <p className="text-xs text-zinc-500">
              お客様の予約画面に適用されているルールです。
            </p>
          </div>
          <ul className="divide-y divide-zinc-100 text-sm">
            {SLOT_SUMMARY.map((s) => (
              <li key={s.label} className="flex gap-3 py-1.5">
                <span className="w-40 shrink-0 text-zinc-500">{s.label}</span>
                <span>{s.value}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-2">
          <div>
            <h2 className="text-sm font-medium text-zinc-700">
              休業日・特別営業時間
            </h2>
            <p className="text-xs text-zinc-500">
              基本ルール以外の休業日や、一時的な営業時間変更を登録できます。
              登録するとお客様の予約画面にもすぐ反映されます。
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            render={<Link href="/admin/holidays" />}
          >
            休業日管理ページへ
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-2">
          <div>
            <h2 className="text-sm font-medium text-zinc-700">
              データバックアップ
            </h2>
            <p className="text-xs text-zinc-500">
              予約・メニューなどの全データを JSON ファイルにして、
              管理者メール宛に添付送信します。毎週月曜 早朝にも自動送信されます。
              届いたメールは削除せず保管してください（障害時の復旧に使用します）。
            </p>
          </div>
          <BackupButton />
        </CardContent>
      </Card>
    </div>
  );
}
