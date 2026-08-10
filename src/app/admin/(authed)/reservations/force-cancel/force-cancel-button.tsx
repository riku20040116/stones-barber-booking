"use client";
/**
 * 強制キャンセルボタン + 確認ダイアログ + 備考入力。
 */
import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { forceCancelReservation } from "./actions";

export function ForceCancelButton({
  id,
  customerName,
}: {
  id: string;
  customerName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function performCancel() {
    setError(null);
    startTransition(async () => {
      const res = await forceCancelReservation({ id, notes });
      if (res.ok) {
        toast.success(`${customerName} 様の予約をキャンセルしました`);
        setOpen(false);
        setNotes("");
      } else {
        setError(res.error);
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        強制キャンセル
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>強制キャンセル</DialogTitle>
            <DialogDescription>
              {customerName} 様のご予約をキャンセルします。お客様にキャンセル受付メールが送信されます。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="cancel-notes" className="text-xs text-zinc-600">
              社内メモ（任意。お客様には見えません）
            </Label>
            <Textarea
              id="cancel-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例: お客様から本日 14:00 にお電話。前日の発熱のため。"
              rows={3}
            />
          </div>
          {error && (
            <Alert>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
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
                "キャンセルを確定する"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
