"use client";
import * as React from "react";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteHoliday } from "./actions";
import type { Database } from "@/types/database";

type HolidayRowDb = Database["public"]["Tables"]["holiday_overrides"]["Row"];

export function HolidayRow({ holiday }: { holiday: HolidayRowDb }) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function performDelete() {
    startTransition(async () => {
      const res = await deleteHoliday({ date: holiday.date });
      if (res.ok) {
        toast.success("削除しました");
        setConfirmOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <span className="w-32 text-sm tabular-nums">{holiday.date}</span>
      {holiday.type === "closed" ? (
        <Badge variant="destructive">休業</Badge>
      ) : (
        <Badge variant="secondary">
          特別営業 {(holiday.open_time ?? "").slice(0, 5)}–
          {(holiday.close_time ?? "").slice(0, 5)}
        </Badge>
      )}
      <span className="flex-1 text-sm text-zinc-600">
        {holiday.reason ?? "—"}
      </span>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="削除"
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2Icon />
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{holiday.date} の登録を削除しますか？</DialogTitle>
            <DialogDescription>
              削除すると、この日の例外設定は基本カレンダーに戻ります。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={performDelete}
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2Icon className="animate-spin" />
                  削除中...
                </>
              ) : (
                "削除する"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
