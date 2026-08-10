"use client";
import * as React from "react";
import { useActionState } from "react";
import { Loader2Icon, PlusIcon, CheckIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { upsertHoliday, type SaveHolidayResult } from "./actions";

export function HolidayForm() {
  const [state, formAction, pending] = useActionState<
    SaveHolidayResult | null,
    FormData
  >(upsertHoliday, null);
  const error = state && !state.ok ? state.error : null;
  const [type, setType] = React.useState<"closed" | "special_hours">("closed");

  React.useEffect(() => {
    if (state?.ok) toast.success("登録しました");
  }, [state]);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="date" className="text-xs text-zinc-600">
            日付 *
          </Label>
          <Input id="date" name="date" type="date" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="type" className="text-xs text-zinc-600">
            種別 *
          </Label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) =>
              setType(e.target.value as "closed" | "special_hours")
            }
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            <option value="closed">休業</option>
            <option value="special_hours">特別営業時間</option>
          </select>
        </div>
        <div className="grid gap-1.5 md:col-span-1">
          <Label htmlFor="reason" className="text-xs text-zinc-600">
            理由（任意）
          </Label>
          <Input
            id="reason"
            name="reason"
            maxLength={200}
            placeholder="例: 設備点検"
          />
        </div>
      </div>

      {type === "special_hours" && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="open_time" className="text-xs text-zinc-600">
              開店時刻 *
            </Label>
            <Input id="open_time" name="open_time" type="time" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="close_time" className="text-xs text-zinc-600">
              閉店時刻 *
            </Label>
            <Input id="close_time" name="close_time" type="time" required />
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <>
              <Loader2Icon className="animate-spin" />
              登録中...
            </>
          ) : state?.ok ? (
            <>
              <CheckIcon />
              登録しました
            </>
          ) : (
            <>
              <PlusIcon />
              登録
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
