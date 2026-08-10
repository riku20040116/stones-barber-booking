"use client";
/**
 * 予約詳細のクライアント側操作。
 *  - ステータス変更（ドロップダウン or ボタン群）
 *  - メモの編集
 *  - キャンセル確認ダイアログ
 */
import * as React from "react";
import { CalendarClockIcon, Loader2Icon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  rescheduleReservation,
  updateReservationNotes,
  updateReservationStatus,
} from "./actions";
import { formatDateJst, formatTimeJst } from "@/lib/timezone";
import type { ReservationStatus } from "@/types/database";

const STATUS_BUTTONS: {
  value: ReservationStatus;
  label: string;
  variant: "default" | "outline" | "destructive" | "secondary";
}[] = [
  { value: "pending", label: "受付中に戻す", variant: "secondary" },
  { value: "confirmed", label: "確定", variant: "default" },
  { value: "completed", label: "完了", variant: "outline" },
  { value: "no_show", label: "未来店", variant: "destructive" },
];

export function ReservationDetailActions({
  reservationId,
  currentStatus,
  notes,
  startIso,
  endIso,
}: {
  reservationId: string;
  currentStatus: ReservationStatus;
  notes: string | null;
  startIso: string;
  endIso: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  function applyStatus(next: ReservationStatus) {
    if (next === currentStatus) return;
    setError(null);
    startTransition(async () => {
      const res = await updateReservationStatus({
        id: reservationId,
        status: next,
      });
      if (res.ok) {
        toast.success("ステータスを更新しました");
      } else {
        setError(res.error);
      }
    });
  }

  function performCancel() {
    setError(null);
    startTransition(async () => {
      const res = await updateReservationStatus({
        id: reservationId,
        status: "cancelled",
      });
      if (res.ok) {
        toast.success("予約をキャンセルしました");
        setConfirmCancel(false);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <Card>
        <CardContent className="space-y-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            ステータス操作
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_BUTTONS.map((btn) => (
              <Button
                key={btn.value}
                size="sm"
                variant={
                  btn.value === currentStatus ? "default" : btn.variant
                }
                disabled={pending || btn.value === currentStatus}
                onClick={() => applyStatus(btn.value)}
              >
                {btn.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="destructive"
              disabled={pending || currentStatus === "cancelled"}
              onClick={() => {
                setError(null);
                setConfirmCancel(true);
              }}
            >
              キャンセル
            </Button>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <RescheduleEditor
        reservationId={reservationId}
        startIso={startIso}
        endIso={endIso}
      />

      <NotesEditor reservationId={reservationId} initial={notes} />

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>予約をキャンセルしますか？</DialogTitle>
            <DialogDescription>
              この操作は取り消せません。お客様への通知が必要な場合は別途ご連絡ください。
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmCancel(false)}
              disabled={pending}
            >
              戻る
            </Button>
            <Button
              variant="destructive"
              onClick={performCancel}
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2Icon className="animate-spin" />
                  処理中...
                </>
              ) : (
                "キャンセル確定"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RescheduleEditor({
  reservationId,
  startIso,
  endIso,
}: {
  reservationId: string;
  startIso: string;
  endIso: string;
}) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const initialDuration = Math.round(
    (end.getTime() - start.getTime()) / 60_000,
  );

  const [date, setDate] = React.useState(formatDateJst(start));
  const [time, setTime] = React.useState(formatTimeJst(start));
  const [duration, setDuration] = React.useState(initialDuration);
  const [notify, setNotify] = React.useState(true);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const dirty =
    date !== formatDateJst(start) ||
    time !== formatTimeJst(start) ||
    duration !== initialDuration;

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await rescheduleReservation({
        id: reservationId,
        date,
        time,
        durationMin: duration,
        notify,
      });
      if (res.ok) {
        toast.success("予約日時を変更しました");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-2">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
          <CalendarClockIcon className="size-3.5" />
          日時変更
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rs-date" className="text-xs text-zinc-600">
              日付
            </Label>
            <Input
              id="rs-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rs-time" className="text-xs text-zinc-600">
              開始時刻
            </Label>
            <Input
              id="rs-time"
              type="time"
              step={900}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rs-duration" className="text-xs text-zinc-600">
              所要時間（分）
            </Label>
            <Input
              id="rs-duration"
              type="number"
              min={5}
              max={600}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="size-4 accent-zinc-900"
            />
            お客様に変更通知メールを送る
          </label>
          <Button
            size="sm"
            variant={dirty ? "default" : "outline"}
            disabled={pending || !dirty}
            onClick={save}
          >
            {pending ? (
              <>
                <Loader2Icon className="animate-spin" />
                変更中...
              </>
            ) : (
              "日時を変更する"
            )}
          </Button>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function NotesEditor({
  reservationId,
  initial,
}: {
  reservationId: string;
  initial: string | null;
}) {
  const [value, setValue] = React.useState(initial ?? "");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const dirty = (value || null) !== (initial ?? null);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateReservationNotes({
        id: reservationId,
        notes: value.trim().length > 0 ? value.trim() : null,
      });
      if (res.ok) {
        toast.success("メモを更新しました");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-2 py-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            管理メモ（お客様には表示されません）
          </p>
          <Button
            size="sm"
            variant={dirty ? "default" : "outline"}
            disabled={pending || !dirty}
            onClick={save}
          >
            {pending ? (
              <>
                <Loader2Icon className="animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <SaveIcon />
                保存
              </>
            )}
          </Button>
        </div>
        <Textarea
          rows={3}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="例: アレルギーあり / 過去の対応履歴など"
        />
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
