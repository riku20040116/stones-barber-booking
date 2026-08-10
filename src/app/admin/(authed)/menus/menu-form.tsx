"use client";
import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MENU_CATEGORY_META, MENU_CATEGORY_ORDER } from "@/lib/reservation/menu-format";
import type { MenuRow } from "@/lib/admin/menus";
import type { SaveMenuResult } from "./actions";

type FormAction = (
  prev: SaveMenuResult | null,
  fd: FormData,
) => Promise<SaveMenuResult>;

export function MenuForm({
  action,
  initial,
  submitLabel,
}: {
  action: FormAction;
  initial?: Partial<MenuRow>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<
    SaveMenuResult | null,
    FormData
  >(action, null);
  const error = state && !state.ok ? state.error : null;

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="メニュー名 *" htmlFor="name">
          <Input
            id="name"
            name="name"
            required
            maxLength={80}
            defaultValue={initial?.name ?? ""}
          />
        </Field>
        <Field label="slug *（英数+ハイフン）" htmlFor="slug">
          <Input
            id="slug"
            name="slug"
            required
            maxLength={64}
            pattern="[a-z0-9\-]+"
            defaultValue={initial?.slug ?? ""}
          />
        </Field>
      </div>

      <Field label="カテゴリ *" htmlFor="category">
        <select
          id="category"
          name="category"
          required
          defaultValue={initial?.category ?? "cut"}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          {MENU_CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {MENU_CATEGORY_META[c].label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="説明" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={initial?.description ?? ""}
        />
      </Field>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="価格 (円) *" htmlFor="price">
          <Input
            id="price"
            name="price"
            type="number"
            min={0}
            max={1000000}
            required
            defaultValue={initial?.price ?? 0}
          />
        </Field>
        <Field label="価格ラベル（任意 / 例: 4,500円〜）" htmlFor="price_label">
          <Input
            id="price_label"
            name="price_label"
            maxLength={40}
            defaultValue={initial?.price_label ?? ""}
          />
        </Field>
        <Field label="所要時間 (分) *" htmlFor="duration_min">
          <Input
            id="duration_min"
            name="duration_min"
            type="number"
            min={0}
            max={600}
            required
            defaultValue={initial?.duration_min ?? 30}
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="補足メモ" htmlFor="note">
          <Input
            id="note"
            name="note"
            maxLength={200}
            defaultValue={initial?.note ?? ""}
          />
        </Field>
        <Field label="年代/属性（任意）" htmlFor="age_group">
          <Input
            id="age_group"
            name="age_group"
            maxLength={40}
            defaultValue={initial?.age_group ?? ""}
          />
        </Field>
      </div>

      <Field
        label="画像 URL（任意 / 例: /images/site/xxx.jpg または https://...）"
        htmlFor="image_url"
      >
        <Input
          id="image_url"
          name="image_url"
          maxLength={500}
          placeholder="/images/site/i568546dac8ece8d3.jpg"
          defaultValue={initial?.image_url ?? ""}
        />
      </Field>

      <Field label="表示順 (sort_order)" htmlFor="sort_order">
        <Input
          id="sort_order"
          name="sort_order"
          type="number"
          min={0}
          max={9999}
          defaultValue={initial?.sort_order ?? 0}
        />
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_option"
            defaultChecked={initial?.is_option ?? false}
            className="size-4 accent-zinc-900"
          />
          オプション扱い（追加メニュー）
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={initial?.is_active ?? true}
            className="size-4 accent-zinc-900"
          />
          公開する
        </label>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          render={<Link href="/admin/menus" />}
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2Icon className="animate-spin" />
              保存中...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-zinc-600">
        {label}
      </Label>
      {children}
    </div>
  );
}
