import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MenuForm } from "../menu-form";
import { updateMenu } from "../actions";
import { fetchMenuById } from "@/lib/admin/menus";

export const metadata = {
  title: "メニュー編集 | 管理画面",
};

type Params = Promise<{ id: string }>;

export default async function AdminMenuEditPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const menu = await fetchMenuById(id);
  if (!menu) notFound();

  const action = updateMenu.bind(null, id);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <Button variant="ghost" size="sm" render={<Link href="/admin/menus" />}>
          <ArrowLeftIcon /> 一覧へ戻る
        </Button>
      </div>
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
          Edit Menu
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {menu.name}
        </h1>
      </header>
      <Card>
        <CardContent className="py-2">
          <MenuForm action={action} initial={menu} submitLabel="保存" />
        </CardContent>
      </Card>
    </div>
  );
}
