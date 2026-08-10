import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MenuForm } from "../menu-form";
import { createMenu } from "../actions";

export const metadata = {
  title: "新規メニュー | 管理画面",
};

export default function AdminMenuNewPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <Button variant="ghost" size="sm" render={<Link href="/admin/menus" />}>
          <ArrowLeftIcon /> 一覧へ戻る
        </Button>
      </div>
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
          New Menu
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          新規メニュー
        </h1>
      </header>
      <Card>
        <CardContent className="py-2">
          <MenuForm action={createMenu} submitLabel="作成" />
        </CardContent>
      </Card>
    </div>
  );
}
