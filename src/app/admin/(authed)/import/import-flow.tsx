"use client";
/**
 * 手書き予約表の取り込み画面。
 *
 *   写真を選ぶ → 読み取る → 1 件ずつ確認・修正 → 登録
 *
 * すでにシステムに入っている予約と時間が重なる行があると、ポップアップで知らせ、
 * 「変更対象（手書き / システム）」と「変更内容（登録しない・キャンセル・日時変更）」
 * を入力してもらう。
 */
import * as React from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ImageIcon,
  Loader2Icon,
  RefreshCwIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { parseCourseText } from "@/lib/sheet/menu-codes";
import type {
  CommitRowResult,
  ConflictInfo,
  DraftRow,
  Resolution,
  SheetMeta,
} from "@/lib/sheet/types";
import { commitImportAction, readSheetAction, recheckAction } from "./actions";

// -----------------------------------------------------------------------------
// 写真の縮小（長辺 2576px の JPEG にする）
//   読み取りモデルが扱える最大の解像度。これより大きくても精度は上がらず、
//   送信が重くなるだけなので端末側で縮める。
// -----------------------------------------------------------------------------
const MAX_EDGE = 2576;

async function fileToJpeg(
  file: File,
): Promise<{ mediaType: "image/jpeg"; data: string }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      "写真を読み込めませんでした。iPhone の場合は「設定 → カメラ → フォーマット → 互換性優先」にしてから撮影してください。",
    );
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("写真の変換に失敗しました。");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("写真の変換に失敗しました。"))),
      "image/jpeg",
      0.9,
    ),
  );
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("写真の読み込みに失敗しました。"));
    reader.readAsDataURL(blob);
  });
  return { mediaType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

// -----------------------------------------------------------------------------
// 表示用の小物
// -----------------------------------------------------------------------------
const DOW = ["日", "月", "火", "水", "木", "金", "土"];

function dateLabel(date: string): string {
  if (!date) return "日付未定";
  const d = new Date(`${date}T12:00:00+09:00`);
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${DOW[d.getDay()]}）`;
}

function sourceLabel(source: string | null): string {
  switch (source) {
    case "web":
      return "Web予約";
    case "phone":
      return "電話";
    case "walkin":
      return "来店";
    case "handwritten":
      return "手書き";
    default:
      return "";
  }
}

function hasUnresolved(rows: DraftRow[]): boolean {
  return rows.some((r) => r.include && r.conflicts.length > 0 && !r.resolution);
}

function resolutionLabel(r: Resolution, row: DraftRow): string {
  if (r.target === "sheet") {
    return r.action === "skip"
      ? "手書きの予約は登録しない"
      : `手書きの予約を ${dateLabel(r.date)} ${r.start} に変更して登録`;
  }
  const c = row.conflicts.find((x) => x.reservationId === r.reservationId);
  const who = c ? `${c.reservationCode}（${c.name} 様）` : "システムの予約";
  return r.action === "cancel"
    ? `${who} をキャンセルして、手書きの予約を登録`
    : `${who} を ${dateLabel(r.date)} ${r.start} に移動して、手書きの予約を登録`;
}

// =============================================================================
// 本体
// =============================================================================
export function ImportFlow({ configured }: { configured: boolean }) {
  const [phase, setPhase] = React.useState<"upload" | "review" | "done">("upload");
  const [rows, setRows] = React.useState<DraftRow[]>([]);
  const [meta, setMeta] = React.useState<SheetMeta | null>(null);
  const [results, setResults] = React.useState<CommitRowResult[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const [dialog, setDialog] = React.useState<null | "notice" | "commit">(null);
  const [pending, startTransition] = React.useTransition();

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  function handleRead(images: File[], fallbackWeekStart: string) {
    startTransition(async () => {
      let payload;
      try {
        payload = await Promise.all(images.map(fileToJpeg));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "写真の準備に失敗しました");
        return;
      }
      const res = await readSheetAction({
        images: payload,
        fallbackWeekStart: fallbackWeekStart || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRows(res.rows);
      setMeta(res.meta);
      setDirty(false);
      setPhase("review");
      if (res.rows.length === 0) {
        toast.warning("予約が 1 件も読み取れませんでした。写真をご確認ください。");
      } else {
        toast.success(`${res.rows.length} 件の予約を読み取りました。内容を確認してください。`);
      }
      // すでに入っている予約と重なる行があれば、すぐに知らせる
      if (hasUnresolved(res.rows)) setDialog("notice");
    });
  }

  function handleRecheck() {
    startTransition(async () => {
      const res = await recheckAction(rows);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRows(res.rows);
      setDirty(false);
      if (hasUnresolved(res.rows)) setDialog("notice");
      else toast.success("確認しました。");
    });
  }

  function handleCommit(current: DraftRow[] = rows) {
    startTransition(async () => {
      const res = await commitImportAction(current);
      if (res.ok) {
        setResults(res.results);
        setPhase("done");
        const ok = res.results.filter((r) => r.ok && r.reservationCode).length;
        toast.success(`${ok} 件の予約を登録しました。`);
        return;
      }
      if (res.needsResolution) {
        setRows(res.rows);
        setDirty(false);
        setDialog("commit");
        return;
      }
      toast.error(res.error);
    });
  }

  function applyResolutions(map: Map<string, Resolution | null>, thenCommit: boolean) {
    const next = rows.map((r) =>
      map.has(r.key) ? { ...r, resolution: map.get(r.key) ?? null } : r,
    );
    setRows(next);
    setDialog(null);
    if (thenCommit) handleCommit(next);
  }

  if (phase === "upload") {
    return <UploadPanel configured={configured} pending={pending} onRead={handleRead} />;
  }

  if (phase === "done") {
    return (
      <ResultsPanel
        rows={rows}
        results={results}
        onRestart={() => {
          setRows([]);
          setResults([]);
          setMeta(null);
          setPhase("upload");
        }}
      />
    );
  }

  const included = rows.filter((r) => r.include);
  const conflictRows = included.filter((r) => r.conflicts.length > 0);
  const warnRows = included.filter((r) => r.warnings.length > 0);

  return (
    <div className="space-y-4">
      {meta && (meta.sheetWarnings.length > 0 || meta.weekStart) && (
        <Card>
          <CardContent className="space-y-2 py-1 text-sm">
            {meta.weekStart && (
              <p>
                用紙の週: <strong>{dateLabel(meta.weekStart)}</strong> から（A 列）
              </p>
            )}
            {meta.sheetWarnings.map((w, i) => (
              <p key={i} className="flex items-start gap-1.5 text-amber-700">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                {w}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 上部の操作バー */}
      <div className="sticky top-14 z-10 -mx-4 flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-100/95 px-4 py-2 backdrop-blur md:top-0">
        <p className="mr-auto text-sm text-zinc-700">
          {included.length} 件を登録予定
          {conflictRows.length > 0 && (
            <span className="ml-2 font-semibold text-red-700">重複 {conflictRows.length} 件</span>
          )}
          {warnRows.length > 0 && (
            <span className="ml-2 text-amber-700">要確認 {warnRows.length} 件</span>
          )}
        </p>
        {conflictRows.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setDialog("notice")} disabled={pending}>
            <AlertTriangleIcon /> 重複を解決する
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleRecheck} disabled={pending}>
          <RefreshCwIcon /> {dirty ? "直した内容をチェック" : "もう一度チェック"}
        </Button>
        <Button size="sm" className="font-bold" onClick={() => handleCommit()} disabled={pending || included.length === 0}>
          {pending ? <Loader2Icon className="animate-spin" /> : <CheckCircle2Icon />}
          登録する
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-zinc-600">
            予約が読み取れませんでした。
            <Button variant="link" onClick={() => setPhase("upload")}>
              写真を選び直す
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <RowCard
              key={row.key}
              row={row}
              onChange={(patch) => updateRow(row.key, patch)}
              onOpenResolve={() => setDialog("notice")}
            />
          ))}
        </div>
      )}

      <ConflictDialog
        open={dialog !== null}
        mode={dialog ?? "notice"}
        rows={rows}
        pending={pending}
        onClose={() => setDialog(null)}
        onApply={applyResolutions}
      />
    </div>
  );
}

// =============================================================================
// 1) 写真を選ぶ
// =============================================================================
function UploadPanel({
  configured,
  pending,
  onRead,
}: {
  configured: boolean;
  pending: boolean;
  onRead: (images: File[], fallbackWeekStart: string) => void;
}) {
  const [page1, setPage1] = React.useState<File | null>(null);
  const [page2, setPage2] = React.useState<File | null>(null);
  const [weekStart, setWeekStart] = React.useState("");

  return (
    <Card>
      <CardContent className="space-y-5 py-2">
        <div className="grid gap-4 md:grid-cols-2">
          <PhotoPicker
            id="page1"
            label="予約表（1ページ目）"
            required
            file={page1}
            onChange={setPage1}
          />
          <PhotoPicker
            id="page2"
            label="お客様メモ（2ページ目・任意）"
            hint="新規のお客様の電話番号を書いた場合に一緒に撮ってください"
            file={page2}
            onChange={setPage2}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="weekStart">この用紙の週（A 列の日付）</Label>
          <Input
            id="weekStart"
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="max-w-48"
          />
          <p className="text-xs text-zinc-500">
            用紙に書いた日付が読み取れなかったときに使います。空欄でも構いません。
          </p>
        </div>

        <div className="rounded-md bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-600">
          <p className="font-semibold text-zinc-700">うまく読み取るコツ</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>用紙の四隅の黒い四角が全部写るように、真上から撮ってください。</li>
            <li>明るい場所で、影や反射が入らないようにしてください。</li>
            <li>読み取りには 1〜2 分かかることがあります。画面を閉じずにお待ちください。</li>
          </ul>
        </div>

        <Button
          size="lg"
          className="h-12 w-full font-bold sm:w-auto"
          disabled={!configured || !page1 || pending}
          onClick={() => page1 && onRead(page2 ? [page1, page2] : [page1], weekStart)}
        >
          {pending ? (
            <>
              <Loader2Icon className="animate-spin" /> 読み取り中…（1〜2分）
            </>
          ) : (
            "写真を読み取る"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function PhotoPicker({
  id,
  label,
  hint,
  required,
  file,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  // プレビュー用の一時 URL。ファイルが変わるか画面を離れたら解放する。
  const preview = React.useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </Label>
      <label
        htmlFor={id}
        className="flex h-44 cursor-pointer items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-zinc-300 bg-white text-sm text-zinc-500 hover:border-zinc-400"
      >
        {file && preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- 選んだ写真のプレビュー（ローカルの blob URL）
          <img src={preview} alt={label} className="h-full w-full object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-1">
            <ImageIcon className="size-6" />
            写真を選ぶ・撮る
          </span>
        )}
      </label>
      <input
        id={id}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      {file && (
        <button
          type="button"
          className="text-xs text-zinc-500 underline"
          onClick={() => onChange(null)}
        >
          選び直す
        </button>
      )}
    </div>
  );
}

// =============================================================================
// 2) 1 件ずつの確認
// =============================================================================
function RowCard({
  row,
  onChange,
  onOpenResolve,
}: {
  row: DraftRow;
  onChange: (patch: Partial<DraftRow>) => void;
  onOpenResolve: () => void;
}) {
  const parsed = parseCourseText(row.courseText);
  const selectedCandidate =
    row.customer.mode === "existing"
      ? row.candidates.find((c) => c.id === (row.customer as { id: string }).id)
      : undefined;
  const customerValue =
    row.customer.mode === "existing" ? row.customer.id : row.customer.mode === "new" ? "__new" : "";

  return (
    <Card
      className={cn(
        !row.include && "opacity-50",
        row.include && row.conflicts.length > 0 && !row.resolution && "ring-2 ring-red-400",
      )}
    >
      <CardContent className="space-y-3 py-1">
        {/* 見出し */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4"
              checked={row.include}
              onChange={(e) => onChange({ include: e.target.checked })}
            />
            登録する
          </label>
          <Badge variant="outline">列 {row.column}</Badge>
          <span className="text-sm font-semibold">
            {dateLabel(row.date)} {row.start}〜{row.end}
          </span>
          <span className="text-sm text-zinc-600">
            手書き: 「{row.name}
            {row.memoNo != null && `（${row.memoNo}）`} {row.courseText}」
          </span>
          {row.memoPhone && (
            <Badge variant="secondary">メモの電話番号 {row.memoPhone}</Badge>
          )}
          {row.confidence !== "high" && (
            <Badge variant={row.confidence === "low" ? "destructive" : "secondary"}>
              自信{row.confidence === "low" ? "低" : "中"}
            </Badge>
          )}
          <span className="ml-auto text-sm tabular-nums text-zinc-700">
            {row.totalPrice.toLocaleString()}円 / {row.menuDuration}分
          </span>
        </div>

        {/* 編集欄 */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">日付</Label>
            <Input type="date" value={row.date} onChange={(e) => onChange({ date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">開始</Label>
              <Input type="time" step={900} value={row.start} onChange={(e) => onChange({ start: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">終了</Label>
              <Input type="time" step={900} value={row.end} onChange={(e) => onChange({ end: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">名前（手書き）</Label>
            <Input value={row.name} onChange={(e) => onChange({ name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">メニュー記号</Label>
            <Input value={row.courseText} onChange={(e) => onChange({ courseText: e.target.value })} placeholder="C2+剃" />
            <p className="text-[11px] text-zinc-500">
              {parsed.codes.length > 0 ? `→ ${parsed.codes.join(" / ")}` : "記号が読めません"}
              {parsed.unknown.length > 0 && (
                <span className="text-red-600">（不明: {parsed.unknown.join(" ")}）</span>
              )}
            </p>
          </div>
        </div>

        {/* お客様 */}
        <div className="grid gap-3 rounded-md bg-zinc-50 p-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <Label className="text-xs">お客様（顧客リストから選ぶ）</Label>
            <select
              className={cn(
                "h-9 w-full rounded-md border bg-white px-2 text-sm",
                row.customer.mode === "unset" ? "border-red-400" : "border-zinc-300",
              )}
              value={customerValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__new") {
                  onChange({ customer: { mode: "new", name: row.name, phone: row.memoPhone } });
                } else if (v) {
                  onChange({ customer: { mode: "existing", id: v } });
                } else {
                  onChange({ customer: { mode: "unset" } });
                }
              }}
            >
              <option value="">— 選んでください —</option>
              {row.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{c.reason}）{c.phone ? ` ${c.phone}` : ""}
                </option>
              ))}
              <option value="__new">＋ 新しいお客様として顧客リストに追加</option>
            </select>
            {row.candidates.length === 0 && (
              <p className="text-[11px] text-zinc-500">顧客リストに似た名前の方はいません。</p>
            )}
          </div>

          {row.customer.mode === "existing" && selectedCandidate && (
            <ContactCells phone={selectedCandidate.phone} email={selectedCandidate.email} />
          )}
          {row.customer.mode === "new" && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">登録する名前</Label>
                <Input
                  className="w-36"
                  value={row.customer.name}
                  onChange={(e) =>
                    onChange({
                      customer: { mode: "new", name: e.target.value, phone: (row.customer as { phone: string }).phone },
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">電話番号</Label>
                <Input
                  className={cn("w-40", !row.customer.phone && "border-amber-400 bg-amber-50")}
                  placeholder="不明"
                  value={row.customer.phone}
                  onChange={(e) =>
                    onChange({
                      customer: { mode: "new", name: (row.customer as { name: string }).name, phone: e.target.value },
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* 重複 */}
        {row.conflicts.length > 0 && (
          <div className="space-y-1 rounded-md border border-red-200 bg-red-50 p-3 text-sm">
            {row.conflicts.map((c, i) => (
              <ConflictLine key={i} c={c} />
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {row.resolution ? (
                <span className="text-zinc-800">
                  <CheckCircle2Icon className="mr-1 inline size-4 text-emerald-600" />
                  {resolutionLabel(row.resolution, row)}
                </span>
              ) : (
                <span className="font-semibold text-red-700">解決方法が決まっていません</span>
              )}
              <Button variant="outline" size="xs" onClick={onOpenResolve}>
                {row.resolution ? "変更する" : "解決する"}
              </Button>
            </div>
          </div>
        )}

        {/* 確認してほしいこと */}
        {(row.warnings.length > 0 || row.aiRemarks) && (
          <ul className="space-y-0.5 text-xs">
            {row.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-1 text-amber-800">
                <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                {w}
              </li>
            ))}
            {row.aiRemarks && <li className="text-zinc-500">読み取りメモ: {row.aiRemarks}</li>}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** 顧客の連絡先。空欄は色をつけて「未登録」と出す。 */
function ContactCells({ phone, email }: { phone: string | null; email: string | null }) {
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <span className={cn("rounded px-2 py-1", phone ? "bg-white" : "bg-amber-100 text-amber-900")}>
        電話: {phone || "未登録"}
      </span>
      <span className={cn("rounded px-2 py-1", email ? "bg-white" : "bg-amber-100 text-amber-900")}>
        メール: {email || "未登録"}
      </span>
    </div>
  );
}

function ConflictLine({ c }: { c: ConflictInfo }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-red-900">
      <AlertTriangleIcon className="size-4" />
      {c.kind === "system" ? (
        <>
          システムの予約 <strong>{c.reservationCode}</strong> {c.name} 様 {c.start}〜{c.end}
          {c.source && <Badge variant="outline">{sourceLabel(c.source)}</Badge>}
        </>
      ) : (
        <>
          この写真の別の行（{c.name} 様 {c.start}〜{c.end}）と重なっています
        </>
      )}
      {c.likelySame && <Badge variant="secondary">同じ予約の可能性大</Badge>}
    </p>
  );
}

// =============================================================================
// 3) 重複の解決（ポップアップ）
// =============================================================================
type Draft = {
  target: "sheet" | "system";
  action: "skip" | "cancel" | "move";
  date: string;
  start: string;
};

function initialDraft(row: DraftRow): Draft {
  const r = row.resolution;
  if (r) {
    return {
      target: r.target,
      action: r.action,
      date: r.action === "move" ? r.date : row.date,
      start: r.action === "move" ? r.start : row.start,
    };
  }
  // 同じ予約の可能性が高ければ「手書き分を登録しない」を初期値にする
  const likelySame = row.conflicts.some((c) => c.likelySame);
  return { target: "sheet", action: likelySame ? "skip" : "move", date: row.date, start: row.start };
}

/**
 * 入力中の内容を解決方法に変換する。まだ決まっていなければ null（決定ボタンを押せない）。
 * 「日時を変更する」で元と同じ日時のままなら、同じ枠に戻るだけなので未決定とみなす。
 */
function draftToResolution(d: Draft, row: DraftRow): Resolution | null {
  if (d.target === "sheet") {
    if (d.action === "skip") return { target: "sheet", action: "skip" };
    if (!d.date || !d.start) return null;
    if (d.date === row.date && d.start === row.start) return null;
    return { target: "sheet", action: "move", date: d.date, start: d.start };
  }
  const sys = row.conflicts.find((c) => c.kind === "system");
  if (!sys?.reservationId) return null;
  if (d.action === "cancel") return { target: "system", action: "cancel", reservationId: sys.reservationId };
  if (!d.date || !d.start) return null;
  if (d.date === sys.date && d.start === sys.start) return null;
  return { target: "system", action: "move", reservationId: sys.reservationId, date: d.date, start: d.start };
}

function ConflictDialog({
  open,
  mode,
  rows,
  pending,
  onClose,
  onApply,
}: {
  open: boolean;
  mode: "notice" | "commit";
  rows: DraftRow[];
  pending: boolean;
  onClose: () => void;
  onApply: (map: Map<string, Resolution | null>, thenCommit: boolean) => void;
}) {
  const targets = React.useMemo(
    () => rows.filter((r) => r.include && r.conflicts.length > 0),
    [rows],
  );
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});

  // 開いたときに、その時点の行から入力欄を作り直す
  const [lastOpen, setLastOpen] = React.useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setDrafts(Object.fromEntries(targets.map((r) => [r.key, initialDraft(r)])));
    }
  }

  const resolutions = new Map(
    targets.map((r) => [r.key, drafts[r.key] ? draftToResolution(drafts[r.key]!, r) : null]),
  );
  const incomplete = [...resolutions.values()].some((v) => v === null);

  function setDraft(key: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [key]: { ...d[key]!, ...patch } }));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangleIcon className="size-5 text-red-600" />
            予約が重複しています（{targets.length} 件）
          </DialogTitle>
          <DialogDescription>
            手書きの予約表に、すでにシステムに入っている予約と時間が重なるものがあります。
            1 件ずつ、どちらを変更するか（変更対象）と、どう変更するか（変更内容）を選んでください。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {targets.map((row) => {
            const d = drafts[row.key];
            if (!d) return null;
            const systemConflicts = row.conflicts.filter((c) => c.kind === "system");
            // システム側を動かせるのは、重なっている相手が「システムの予約 1 件だけ」のとき
            const canTargetSystem =
              systemConflicts.length === 1 && row.conflicts.every((c) => c.kind === "system");

            return (
              <div key={row.key} className="space-y-3 rounded-md border border-zinc-200 p-3">
                <div className="text-sm">
                  <p className="font-semibold">
                    手書き: {dateLabel(row.date)} {row.start}〜{row.end}　{row.name} 様　{row.courseText}
                  </p>
                  {row.conflicts.map((c, i) => (
                    <ConflictLine key={i} c={c} />
                  ))}
                </div>

                <fieldset className="space-y-1">
                  <legend className="text-xs font-semibold text-zinc-600">変更対象</legend>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={d.target === "sheet"}
                        onChange={() =>
                          setDraft(row.key, { target: "sheet", action: "skip", date: row.date, start: row.start })
                        }
                      />
                      手書きの予約
                    </label>
                    <label className={cn("flex items-center gap-1.5", !canTargetSystem && "opacity-40")}>
                      <input
                        type="radio"
                        disabled={!canTargetSystem}
                        checked={d.target === "system"}
                        onChange={() => {
                          const c = systemConflicts[0]!;
                          setDraft(row.key, { target: "system", action: "move", date: c.date, start: c.start });
                        }}
                      />
                      システムの予約
                      {systemConflicts[0] && `（${systemConflicts[0].reservationCode}）`}
                    </label>
                  </div>
                  {!canTargetSystem && (
                    <p className="text-[11px] text-zinc-500">
                      重なっている予約が複数あるため、手書きの予約側で調整してください。
                    </p>
                  )}
                </fieldset>

                <fieldset className="space-y-1">
                  <legend className="text-xs font-semibold text-zinc-600">変更内容</legend>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {d.target === "sheet" ? (
                      <label className="flex items-center gap-1.5">
                        <input type="radio" checked={d.action === "skip"} onChange={() => setDraft(row.key, { action: "skip" })} />
                        登録しない（同じ予約・書き間違い）
                      </label>
                    ) : (
                      <label className="flex items-center gap-1.5">
                        <input type="radio" checked={d.action === "cancel"} onChange={() => setDraft(row.key, { action: "cancel" })} />
                        キャンセルする
                      </label>
                    )}
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={d.action === "move"} onChange={() => setDraft(row.key, { action: "move" })} />
                      日時を変更する
                    </label>
                  </div>
                  {d.action === "move" && (
                    <div className="flex flex-wrap items-end gap-2 pt-1">
                      <div className="space-y-1">
                        <Label className="text-xs">変更後の日付</Label>
                        <Input type="date" value={d.date} onChange={(e) => setDraft(row.key, { date: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">変更後の開始時刻</Label>
                        <Input
                          type="time"
                          step={900}
                          value={d.start}
                          onChange={(e) => setDraft(row.key, { start: e.target.value })}
                        />
                      </div>
                      <p className="pb-2 text-[11px] text-zinc-500">所要時間はそのままです</p>
                    </div>
                  )}
                  {!resolutions.get(row.key) && (
                    <p className="text-[11px] font-semibold text-red-700">
                      {d.action === "move" ? "変更後の日時を、今と違う日時にしてください。" : "変更内容を選んでください。"}
                    </p>
                  )}
                  {d.target === "system" && d.action === "cancel" && (
                    <p className="text-[11px] text-amber-700">
                      お客様へのキャンセルのご連絡は、お店から直接お願いします（自動メールは送りません）。
                    </p>
                  )}
                </fieldset>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            あとで決める
          </Button>
          <Button
            className="font-bold"
            disabled={incomplete || pending}
            onClick={() => onApply(resolutions, mode === "commit")}
          >
            {pending && <Loader2Icon className="animate-spin" />}
            {mode === "commit" ? "この内容で登録する" : "この内容で決定"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// 4) 結果
// =============================================================================
function ResultsPanel({
  rows,
  results,
  onRestart,
}: {
  rows: DraftRow[];
  results: CommitRowResult[];
  onRestart: () => void;
}) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const okCount = results.filter((r) => r.ok && r.reservationCode).length;
  const failCount = results.filter((r) => !r.ok).length;

  return (
    <Card>
      <CardContent className="space-y-4 py-2">
        <p className="text-lg font-bold">
          {okCount} 件を登録しました
          {failCount > 0 && <span className="ml-2 text-red-700">（{failCount} 件は登録できませんでした）</span>}
        </p>
        <ul className="divide-y divide-zinc-100 text-sm">
          {results.map((res) => {
            const row = byKey.get(res.key);
            return (
              <li key={res.key} className="flex flex-wrap items-center gap-2 py-2">
                {res.ok ? (
                  <CheckCircle2Icon className="size-4 text-emerald-600" />
                ) : (
                  <XCircleIcon className="size-4 text-red-600" />
                )}
                {row && (
                  <span className="font-medium">
                    {dateLabel(row.date)} {row.start} {row.name} 様
                  </span>
                )}
                <span className={res.ok ? "text-zinc-600" : "text-red-700"}>{res.message}</span>
                {res.reservationCode && (
                  <Badge variant="outline" className="tabular-nums">
                    {res.reservationCode}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button render={<Link href="/admin/calendar" />}>カレンダーで確認</Button>
          <Button variant="outline" render={<Link href="/admin/customers" />}>
            顧客リストを見る
          </Button>
          <Button variant="ghost" onClick={onRestart}>
            別の写真を取り込む
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
