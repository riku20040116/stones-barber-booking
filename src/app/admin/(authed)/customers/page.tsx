/**
 * 管理画面 / 顧客リスト。
 *  - Web 予約・手動登録・手書き予約の取り込みで自動的に増える
 *  - 電話番号・メールが分からない欄は色をつけて「未登録」と出す
 */
import Link from "next/link";
import { SearchIcon, UsersIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fetchCustomers, isMissing } from "@/lib/admin/customers";
import { formatDateJst } from "@/lib/timezone";

export const metadata = {
  title: "顧客リスト | 管理画面",
};

const SOURCE_LABEL: Record<string, string> = {
  web: "Web",
  admin: "管理画面",
  handwritten: "手書き",
};

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = formatDateJst(new Date(iso));
  return `${d.slice(0, 4)}/${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
}

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; missing?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const missingOnly = sp.missing === "1";
  const res = await fetchCustomers({ q, missingOnly });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
          Customers
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight">顧客リスト</h1>
        <p className="text-sm text-zinc-600">
          予約が入ると自動で追加・更新されます。
          <span className="mx-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">色つき</span>
          の欄はまだ分かっていない情報です。お客様にお会いしたときに伺って登録してください。
        </p>
      </header>

      <form className="flex flex-wrap items-center gap-2" action="/admin/customers">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="名前・電話番号・メールで検索"
            className="w-72 bg-white pl-8"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="missing" value="1" defaultChecked={missingOnly} className="size-4" />
          情報が足りない人だけ
        </label>
        <Button type="submit" size="sm">
          絞り込む
        </Button>
        {(q || missingOnly) && (
          <Button variant="ghost" size="sm" render={<Link href="/admin/customers" />}>
            条件をクリア
          </Button>
        )}
      </form>

      {!res.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{res.error}</AlertDescription>
        </Alert>
      ) : res.customers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-sm text-zinc-500">
            <UsersIcon className="size-6" />
            {q || missingOnly ? "条件に合うお客様はいません。" : "まだお客様が登録されていません。"}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">お名前</th>
                  <th className="px-3 py-2 font-medium">電話番号</th>
                  <th className="px-3 py-2 font-medium">メール</th>
                  <th className="px-3 py-2 text-right font-medium">来店</th>
                  <th className="px-3 py-2 font-medium">最終来店</th>
                  <th className="px-3 py-2 font-medium">次回のご予約</th>
                  <th className="px-3 py-2 font-medium">登録元</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {res.customers.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-2">
                      <Link href={`/admin/customers/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <MissingCell value={c.phone} />
                    </td>
                    <td className="px-3 py-2">
                      <MissingCell value={c.email} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.visit_count}回</td>
                    <td className="px-3 py-2 tabular-nums">{shortDate(c.last_visit_at)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {c.next_reservation_at ? (
                        <>
                          {shortDate(c.next_reservation_at)}
                          {c.upcoming_count > 1 && (
                            <span className="ml-1 text-xs text-zinc-500">ほか{c.upcoming_count - 1}件</span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">{SOURCE_LABEL[c.source] ?? c.source}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {res.ok && res.customers.length >= 500 && (
        <p className="text-xs text-zinc-500">500 件まで表示しています。検索で絞り込んでください。</p>
      )}
    </div>
  );
}

function MissingCell({ value }: { value: string | null }) {
  const missing = isMissing(value);
  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5",
        missing ? "bg-amber-100 text-amber-900" : "tabular-nums",
      )}
    >
      {missing ? "未登録" : value}
    </span>
  );
}
