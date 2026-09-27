"use client";
/**
 * 「OK」を押すまで閉じないお知らせ用のポップアップ。
 *
 * 予約できなかった理由など、読み飛ばされると困るメッセージに使う。
 *  - 右上の ✖ は出さない
 *  - 画面の外側をクリックしても、Esc キーを押しても閉じない
 *  - 閉じる手段は「OK」ボタンだけ
 *
 * （自動で消えるトースト通知だと、気づかないうちに消えてしまうため）
 */
import * as React from "react";
import { AlertTriangleIcon, InfoIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type Notice = {
  title: string;
  message: string;
  tone?: "error" | "info";
};

export function NoticeDialog({
  notice,
  onOk,
}: {
  /** null のときは閉じている */
  notice: Notice | null;
  onOk: () => void;
}) {
  const tone = notice?.tone ?? "error";
  const Icon = tone === "error" ? AlertTriangleIcon : InfoIcon;

  return (
    <Dialog
      open={notice !== null}
      // 外側のクリック・Esc・その他の「閉じて」要求はすべて無視する。
      // open を親が握っているので、ここで何もしなければ開いたままになる。
      onOpenChange={() => {}}
      disablePointerDismissal
    >
      <DialogContent showCloseButton={false} role="alertdialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Icon
              className={tone === "error" ? "size-5 text-red-600" : "size-5 text-sky-600"}
              aria-hidden
            />
            {notice?.title}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            {notice?.message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button size="lg" className="h-12 w-full font-bold sm:w-32" onClick={onOk} autoFocus>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
