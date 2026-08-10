"use client";
/**
 * 予約照会・キャンセルのクライアントフロー。
 *  - フォーム入力 → 照会 → 詳細表示 → キャンセル（任意）
 */
import * as React from "react";
import Link from "next/link";
import { Loader2Icon, CheckIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { formatHumanJst } from "@/lib/timezone";
import { isWebCancellable } from "@/lib/calendar";
import {
  lookupReservation,
  cancelReservation,
  type LookupReservationResult,
} from "./actions";

type LookupSuccess = Extract<LookupReservationResult, { ok: true }>;

const STATUS_LABELS: Record<string, { label: string; tone: "ok" | "warn" | "danger" }> = {
  pending: { label: "受付中", tone: "warn" },
  confirmed: { label: "確定", tone: "ok" },
  cancelled: { label: "キャンセル済", tone: "danger" },
  completed: { label: "完了", tone: "ok" },
  no_show: { label: "未来店", tone: "danger" },
};

export function LookupFlow() {
  const [code, setCode] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<LookupSuccess | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await lookupReservation({ code, email });
      if (res.ok) {
        setResult(res);
      } else {
        setError(res.error);
      }
    });
  }

  function reset() {
    setResult(null);
    setError(null);
  }

  if (result) {
    return (
      <ReservationDetail
        data={result}
        email={email}
        code={code}
        onReset={reset}
        onCancelled={() => {
          setResult({
            ...result,
            reservation: { ...result.reservation, status: "cancelled" },
          });
        }}
      />
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-2">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="code">予約番号</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="SB-20260502-AB12"
              autoComplete="off"
              autoCapitalize="characters"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@mail.com"
              autoComplete="email"
              required
            />
          </div>
          {error && (
            <Alert>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2Icon className="animate-spin" />
                  照会中...
                </>
              ) : (
                "照会する"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ReservationDetail({
  data,
  code,
  email,
  onReset,
  onCancelled,
}: {
  data: LookupSuccess;
  code: string;
  email: string;
  onReset: () => void;
  onCancelled: () => void;
}) {
  const { reservation, items } = data;
  const status = STATUS_LABELS[reservation.status] ?? {
    label: reservation.status,
    tone: "warn" as const,
  };
  const start = new Date(reservation.start_at);
  const cancellable =
    reservation.status === "pending" || reservation.status === "confirmed";
  const webCancellable = cancellable && isWebCancellable(start);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  function performCancel() {
    setCancelError(null);
    startTransition(async () => {
      const res = await cancelReservation({ code, email });
      if (res.ok) {
        toast.success("予約をキャンセルしました");
        onCancelled();
        setConfirmOpen(false);
      } else {
        setCancelError(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-5 py-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                予約番号
              </p>
              <p className="mt-1 font-mono text-xl font-bold tracking-widest">
                {reservation.code}
              </p>
            </div>
            <Badge
              variant={
                status.tone === "ok"
                  ? "default"
                  : status.tone === "danger"
                    ? "destructive"
                    : "secondary"
              }
            >
              {status.label}
            </Badge>
          </div>

          <Section label="日時">
            <p className="text-sm font-medium">{formatHumanJst(start)}</p>
          </Section>

          <Section label="お客様">
            <dl className="grid gap-1 text-sm">
              <Row label="お名前" value={reservation.customer_name} />
              <Row label="メール" value={reservation.customer_email} />
              <Row label="電話" value={reservation.customer_phone} />
            </dl>
          </Section>

          <Section label="メニュー">
            {items.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {items.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span>{it.name_snapshot}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {it.price_snapshot.toLocaleString("ja-JP")}円
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                メニュー詳細の取得に失敗しました（合計のみ表示）。
              </p>
            )}
            <p className="mt-2 text-sm">
              <span className="text-muted-foreground">合計: </span>
              <span className="font-medium tabular-nums">
                {reservation.total_price.toLocaleString("ja-JP")}円〜
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                （
                {reservation.payment_method === "in_store"
                  ? "店舗払い"
                  : "オンライン決済"}
                ）
              </span>
            </p>
          </Section>
        </CardContent>
      </Card>

      {reservation.status === "cancelled" && (
        <Alert>
          <AlertDescription>
            このご予約はキャンセル済です。
          </AlertDescription>
        </Alert>
      )}

      {cancellable && !webCancellable && (
        <Alert>
          <AlertDescription>
            <p className="font-medium">
              Webキャンセル期限（予約日の7日前）を過ぎています。
            </p>
            <p className="mt-2">
              キャンセルご希望の場合は、お手数ですが店舗までお電話ください。
              管理者にて手続きを承ります。
            </p>
            <p className="mt-2 font-heading text-lg font-bold tabular-nums tracking-tight">
              <a
                href="tel:0922318037"
                className="underline-offset-4 hover:underline"
              >
                092-231-8037
              </a>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              営業時間: 平日 9:30〜19:30 / 土日祝 9:00〜19:00（月曜・第3火曜 定休）
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onReset}>
          ← 別の予約を照会する
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button render={<Link href="/" />} variant="outline">
            トップへ
          </Button>
          {webCancellable && (
            <Button
              variant="destructive"
              onClick={() => {
                setCancelError(null);
                setConfirmOpen(true);
              }}
            >
              予約をキャンセルする
            </Button>
          )}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>予約をキャンセルしますか？</DialogTitle>
            <DialogDescription>
              {formatHumanJst(start)} のご予約をキャンセルします。この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>
          {cancelError && (
            <Alert>
              <AlertDescription>{cancelError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
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
                  キャンセル中...
                </>
              ) : (
                <>
                  <CheckIcon />
                  キャンセル確定
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5rem_1fr] items-baseline gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
