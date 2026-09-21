"use client";
/**
 * 顧客情報の編集フォーム。空欄は色をつけて「分かったら入力してください」と示す。
 */
import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { saveCustomer } from "./actions";

export function CustomerForm({
  initial,
}: {
  initial: { id: string; name: string; phone: string; email: string; notes: string };
}) {
  const [form, setForm] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveCustomer(form);
      if (res.ok) toast.success("保存しました");
      else toast.error(res.error);
    });
  }

  const missingClass = "border-amber-400 bg-amber-50";

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="name">お名前</Label>
        <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">
          電話番号
          {!form.phone && <span className="ml-2 text-xs font-normal text-amber-700">未登録</span>}
        </Label>
        <Input
          id="phone"
          inputMode="tel"
          placeholder="090-1234-5678"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          className={cn(!form.phone && missingClass)}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="email">
          メールアドレス
          {!form.email && <span className="ml-2 text-xs font-normal text-amber-700">未登録</span>}
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="example@mail.com"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          className={cn(!form.email && missingClass)}
        />
        <p className="text-xs text-zinc-500">
          入力すると、これからのご予約で連絡先が空のものにも反映されます。
        </p>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="notes">メモ（お店用）</Label>
        <Textarea
          id="notes"
          rows={3}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="髪質・好み・注意点など"
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          保存する
        </Button>
      </div>
    </form>
  );
}
