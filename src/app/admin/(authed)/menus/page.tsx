/**
 * 管理画面 / メニュー一覧。
 * カテゴリでグループ化、トグルで公開/非公開を切替。
 */
import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchAllMenus } from "@/lib/admin/menus";
import {
  MENU_CATEGORY_META,
  MENU_CATEGORY_ORDER,
  formatMenuPrice,
  formatDurationMin,
  groupMenusByCategory,
} from "@/lib/reservation/menu-format";
import { MenuActiveToggle } from "./menu-active-toggle";

export const metadata = {
  title: "メニュー管理 | 管理画面",
};

export default async function AdminMenusPage() {
  const menus = await fetchAllMenus();
  const grouped = groupMenusByCategory(menus);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
            Menus
          </p>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            メニュー管理
          </h1>
        </div>
        <Button size="sm" render={<Link href="/admin/menus/new" />}>
          <PlusIcon /> 新規メニュー
        </Button>
      </header>

      {MENU_CATEGORY_ORDER.map((cat) => {
        const items = grouped[cat];
        if (items.length === 0) return null;
        const meta = MENU_CATEGORY_META[cat];
        return (
          <Card key={cat}>
            <CardContent className="space-y-3 py-2">
              <div>
                <h2 className="font-heading text-base font-medium">
                  {meta.label}
                </h2>
                <p className="text-xs text-zinc-500">{meta.description}</p>
              </div>
              <ul className="divide-y divide-zinc-100">
                {items.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center gap-3 py-2.5"
                  >
                    <Link
                      href={`/admin/menus/${m.id}`}
                      className="flex-1 min-w-0 hover:underline"
                    >
                      <p className="truncate text-sm font-medium">
                        {m.name}
                        {m.is_option && (
                          <span className="ml-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-normal text-zinc-600">
                            オプション
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {m.slug} · {formatMenuPrice(m)} ·{" "}
                        {formatDurationMin(m.duration_min)}
                      </p>
                    </Link>
                    <MenuActiveToggle
                      menuId={m.id}
                      initialActive={m.is_active}
                    />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      {menus.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-zinc-500">
            まだメニューが登録されていません。
          </CardContent>
        </Card>
      )}
    </div>
  );
}
