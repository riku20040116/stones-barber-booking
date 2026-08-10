"use client";
/**
 * 手動予約登録フォーム。
 *  - メニューをチェックすると所要時間・合計が自動計算される。
 *  - 所要時間は自動計算値を初期値とし、手動で微調整できる。
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createManualReservation } from "./actions";

type MenuLite = {
  id: string;
  name: string;
  price: number;
  duration_min: number;
  is_option: boolean;
};

export function ManualReservationForm({ menus }: { menus: MenuLite[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<string[]>([]);
  // 手動で所要時間を上書きした場合はその値を保持。null の間はメニューから自動算出。
  const [durationOverride, setDurationOverride] = React.useState<number | null>(
    null,
  );
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const menuById = React.useMemo(
    () => new Map(menus.map((m) => [m.id, m])),
    [menus],
  );
  const selectedMenus = selected
    .map((id) => menuById.get(id))
    .filter((m): m is MenuLite => Boolean(m));
  const autoDuration = selectedMenus.reduce(
    (sum, m) => sum + m.duration_min,
    0,
  );
  const totalPrice = selectedMenus.reduce((sum, m) => sum + m.price, 0);

  // 実効の所要時間: 手動上書きがあればそれ、無ければ自動算出（最低 5 分）
  const duration = durationOverride ?? (autoDuration > 0 ? autoDuration : 30);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createManualReservation({
        date: String(fd.get("date") ?? ""),
        time: String(fd.get("time") ?? ""),
        durationMin: duration,
        menuIds: selected,
        customerName: String(fd.get("customerName") ?? "").trim(),
        customerPhone: String(fd.get("customerPhone") ?? "").trim(),
        customerEmail: String(fd.get("customerEmail") ?? "").trim() || null,
        source: (String(fd.get("source") ?? "phone") as "phone" | "walkin"),
        notes: String(fd.get("notes") ?? "").trim() || null,
      });
      if (res.ok) {
        toast.success(`予約を登録しました（${res.code}）`);
        router.push(`/admin/reservations/${res.id}`);
      } else {
        setError(res.error);
        toast.error(res.error);
      }
    });
  }

  const grouped = {
    main: menus.filter((m) => !m.is_option),
    option: menus.filter((m) => m.is_option),
  };

  return (
    <form action={submit} className="space-y-5">
      {/* 日時 */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            日時
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="date" className="text-xs text-zinc-600">
                日付 *
              </Label>
              <Input id="date" name="date" type="date" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="time" className="text-xs text-zinc-600">
                開始時刻 *
              </Label>
              <Input id="time" name="time" type="time" step={900} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="duration" className="text-xs text-zinc-600">
                所要時間（分）*
              </Label>
              <Input
                id="duration"
                type="number"
                min={5}
                max={600}
                step={5}
                value={duration}
                onChange={(e) => setDurationOverride(Number(e.target.value))}
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* メニュー */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              メニュー（任意・複数可）
            </p>
            <p className="text-sm">
              合計{" "}
              <span className="font-bold tabular-nums">
                {totalPrice.toLocaleString("ja-JP")}円
              </span>
              <span className="ml-2 text-xs text-zinc-500">
                自動所要 {autoDuration}分
              </span>
            </p>
          </div>
          <div className="grid gap-1.5">
            <p className="text-[11px] font-medium text-zinc-500">主メニュー</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {grouped.main.map((m) => (
                <MenuCheck
                  key={m.id}
                  menu={m}
                  checked={selected.includes(m.id)}
                  onToggle={() => toggle(m.id)}
                />
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <p className="text-[11px] font-medium text-zinc-500">オプション</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {grouped.option.map((m) => (
                <MenuCheck
                  key={m.id}
                  menu={m}
                  checked={selected.includes(m.id)}
                  onToggle={() => toggle(m.id)}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* お客様 */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            お客様情報
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="customerName" className="text-xs text-zinc-600">
                お名前 *
              </Label>
              <Input id="customerName" name="customerName" required maxLength={50} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="customerPhone" className="text-xs text-zinc-600">
                電話番号 *
              </Label>
              <Input
                id="customerPhone"
                name="customerPhone"
                type="tel"
                required
                maxLength={20}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="customerEmail" className="text-xs text-zinc-600">
              メール（任意 / 入力すると確認メールを送れます ※現状は送信しません）
            </Label>
            <Input
              id="customerEmail"
              name="customerEmail"
              type="email"
              maxLength={120}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="source" className="text-xs text-zinc-600">
              受付方法
            </Label>
            <select
              id="source"
              name="source"
              defaultValue="phone"
              className="h-8 w-40 rounded-lg border border-input bg-transparent px-2 text-sm"
            >
              <option value="phone">電話</option>
              <option value="walkin">来店</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="notes" className="text-xs text-zinc-600">
              メモ（任意・お客様には表示されません）
            </Label>
            <Textarea id="notes" name="notes" rows={2} maxLength={1000} />
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2Icon className="animate-spin" />
              登録中...
            </>
          ) : (
            "この内容で予約を登録"
          )}
        </Button>
      </div>
    </form>
  );
}

function MenuCheck({
  menu,
  checked,
  onToggle,
}: {
  menu: MenuLite;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={
        "flex cursor-pointer items-center justify-between gap-2 rounded-md border p-2 text-sm " +
        (checked ? "border-primary bg-primary/5" : "border-border")
      }
    >
      <span className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="size-4 accent-zinc-900"
        />
        {menu.name}
      </span>
      <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
        {menu.duration_min}分 / {menu.price.toLocaleString("ja-JP")}円
      </span>
    </label>
  );
}
