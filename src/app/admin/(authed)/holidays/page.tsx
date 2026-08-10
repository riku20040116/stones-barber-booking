/**
 * 管理画面 / 休業日・特別営業時間。
 *  - 過去〜未来の一覧（過去は折りたたみ可能）
 *  - 新規登録 / 削除
 */
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateJst } from "@/lib/timezone";
import type { Database } from "@/types/database";
import { HolidayForm } from "./holiday-form";
import { HolidayRow } from "./holiday-row";

export const metadata = {
  title: "休業日管理 | 管理画面",
};

type HolidayRowDb = Database["public"]["Tables"]["holiday_overrides"]["Row"];

export default async function AdminHolidaysPage() {
  const supabase = await createSupabaseServerClient();
  const today = formatDateJst(new Date());
  const { data, error } = await supabase
    .from("holiday_overrides")
    .select("*")
    .order("date", { ascending: true });
  if (error) console.error("fetch holidays error:", error);

  const all: HolidayRowDb[] = data ?? [];
  const future = all.filter((h) => h.date >= today);
  const past = all.filter((h) => h.date < today);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
          Holidays
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          休業日・特別営業時間
        </h1>
        <p className="text-sm text-zinc-600">
          基本カレンダー（毎週月・第3火）以外の休業や、臨時の営業時間変更を登録します。
        </p>
      </header>

      <Card>
        <CardContent className="space-y-3 py-2">
          <h2 className="text-sm font-medium text-zinc-700">新規登録</h2>
          <HolidayForm />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-2">
          <h2 className="text-sm font-medium text-zinc-700">
            今後の予定 ({future.length})
          </h2>
          {future.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">
              登録されている予定はありません。
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {future.map((h) => (
                <HolidayRow key={h.date} holiday={h} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {past.length > 0 && (
        <Card>
          <CardContent className="space-y-3 py-2">
            <details>
              <summary className="cursor-pointer text-sm font-medium text-zinc-700">
                過去の登録 ({past.length})
              </summary>
              <ul className="mt-3 divide-y divide-zinc-100">
                {past.map((h) => (
                  <HolidayRow key={h.date} holiday={h} />
                ))}
              </ul>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
