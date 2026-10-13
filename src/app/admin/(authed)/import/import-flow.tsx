"use client";
/**
 * 手書き予約表の取り込み画面（貼り付け）。
 *
 *   ① 予約表を撮影 → ② Google レンズで文字をコピー → ③「貼り付け」→ ④「読み込む」
 *   → 一覧で確認・修正（直すたびにその場で判定し直す）→ チェックした行を「登録する」
 *
 * 判定（OK・要確認・エラー）は lib/paste-import/judge.ts。サーバーも登録の直前に同じ判定をする。
 */
import * as React from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClipboardPasteIcon,
  Loader2Icon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NoticeDialog, type Notice } from "@/components/ui/notice-dialog";
import { cn } from "@/lib/utils";
import type { HolidayOverride } from "@/lib/calendar";
import { formatDateJst, formatTimeJst } from "@/lib/timezone";
import { blankRow, fromMinutes, menuMinutes, syncEnd } from "@/lib/paste-import/draft";
import { judgeRows, withJudgement } from "@/lib/paste-import/judge";
import { makeDayHours } from "@/lib/paste-import/hours";
import type {
  DraftRow,
  ExistingReservation,
  Judged,
  JudgeStatus,
  MenuEntry,
} from "@/lib/paste-import/types";
import { analyzePasteAction, commitPasteAction, refreshJudgeDataAction } from "./actions";

// -----------------------------------------------------------------------------
// 表示の部品
// -----------------------------------------------------------------------------

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026-10-20" → "2026年10月20日（火）" */
function dateLabel(d: string, withYear = true): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "日付なし";
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const dow = DOW[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return `${withYear ? `${y}年` : ""}${m}月${day}日（${dow}）`;
}

/** "09:30" → "9:30" */
function t(s: string): string {
  return s ? s.replace(/^0(\d)/, "$1") : "--:--";
}

/** 8:00〜21:00 の 15 分おき（今の値が 15 分おきでなければ、それも入れる） */
const TIME_STEPS = Array.from({ length: (21 - 8) * 4 + 1 }, (_, i) => fromMinutes(8 * 60 + i * 15));
function timeOptions(current: string): string[] {
  return current && !TIME_STEPS.includes(current) ? [...TIME_STEPS, current].sort() : TIME_STEPS;
}

const STATUS_STYLE: Record<JudgeStatus, { label: string; badge: string; card: string; Icon: typeof CheckCircle2Icon }> = {
  ok: { label: "OK", badge: "bg-emerald-600 text-white", card: "border-emerald-300", Icon: CheckCircle2Icon },
  check: { label: "要確認", badge: "bg-amber-500 text-white", card: "border-amber-400 bg-amber-50/40", Icon: AlertTriangleIcon },
  error: { label: "エラー", badge: "bg-red-600 text-white", card: "border-red-400 bg-red-50/40", Icon: XCircleIcon },
};

const fieldClass =
  "h-12 w-full rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/20";

// -----------------------------------------------------------------------------
// 画面
// -----------------------------------------------------------------------------

type Data = {
  menus: MenuEntry[];
  existing: ExistingReservation[];
  overrides: HolidayOverride[];
};

type View = { rows: DraftRow[]; judged: Judged[] };

function judge(rows: DraftRow[], data: Data): View {
  const now = new Date();
  const judged = judgeRows(rows, {
    nowDate: formatDateJst(now),
    nowTime: formatTimeJst(now),
    dayHours: makeDayHours(data.overrides),
    existing: data.existing,
  });
  return { rows: withJudgement(rows, judged), judged };
}

export function ImportFlow({ today }: { today: string }) {
  const [phase, setPhase] = React.useState<"input" | "review" | "done">("input");
  const [baseDate, setBaseDate] = React.useState(today);
  const [text, setText] = React.useState("");
  const [pasteHelp, setPasteHelp] = React.useState(false);
  const [busy, setBusy] = React.useState<"" | "analyze" | "commit">("");
  const [data, setData] = React.useState<Data>({ menus: [], existing: [], overrides: [] });
  const [view, setView] = React.useState<View>({ rows: [], judged: [] });
  const [unreadLines, setUnreadLines] = React.useState<string[]>([]);
  const [ignoredLines, setIgnoredLines] = React.useState<string[]>([]);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [done, setDone] = React.useState<{ count: number; skipped: number } | null>(null);
  const seq = React.useRef(1);
  const textRef = React.useRef<HTMLTextAreaElement>(null);

  const menuBySlug = React.useMemo(() => new Map(data.menus.map((m) => [m.slug, m])), [data.menus]);
  const mains = data.menus.filter((m) => !m.isOption);
  const options = data.menus.filter((m) => m.isOption);
  const checkedRows = view.rows.filter((r) => r.checked);

  // ---- 入力 -----------------------------------------------------------------

  async function pasteFromClipboard() {
    setPasteHelp(false);
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) {
        setPasteHelp(true);
        return;
      }
      setText((cur) => (cur.trim() ? `${cur.trimEnd()}\n${clip}` : clip));
      toast.success("貼り付けました");
    } catch {
      setPasteHelp(true);
      textRef.current?.focus();
    }
  }

  async function analyze() {
    if (!text.trim()) {
      setNotice({ title: "文字がありません", message: "先に「貼り付け」を押して、予約表の文字を入れてください。" });
      return;
    }
    setBusy("analyze");
    try {
      const res = await analyzePasteAction({ text, baseDate });
      if (!res.ok) {
        setNotice({ title: "読み込めませんでした", message: res.error });
        return;
      }
      const d: Data = { menus: res.menus, existing: res.existing, overrides: res.overrides };
      setData(d);
      setView(judge(res.rows, d));
      setUnreadLines(res.unreadLines);
      setIgnoredLines(res.ignoredLines);
      setPhase("review");
      window.scrollTo({ top: 0 });
      if (res.rows.length === 0) {
        setNotice({
          tone: "info",
          title: "予約が見つかりませんでした",
          message: "時刻・お名前・メニューが読み取れませんでした。\n下の「読み取れなかった行」を見て、必要なら「行を足す」で入力してください。",
        });
      }
    } catch {
      setNotice({ title: "読み込めませんでした", message: "通信できませんでした。電波の良い所で、もう一度お試しください。" });
    } finally {
      setBusy("");
    }
  }

  // ---- 確認・修正 -----------------------------------------------------------

  function edit(key: string, patch: Partial<DraftRow>, opts: { syncEnd?: boolean } = {}) {
    setView((v) =>
      judge(
        v.rows.map((r) => {
          if (r.key !== key) return r;
          const next = { ...r, ...patch };
          return opts.syncEnd ? syncEnd(next, data.menus) : next;
        }),
        data,
      ),
    );
  }

  function toggleChecked(key: string, checked: boolean) {
    setView((v) => ({ ...v, rows: v.rows.map((r) => (r.key === key ? { ...r, checked } : r)) }));
  }

  function removeRow(key: string) {
    const before = view.rows;
    setView(judge(before.filter((r) => r.key !== key), data));
    toast("行を消しました", {
      action: { label: "元に戻す", onClick: () => setView(judge(before, data)) },
    });
  }

  function addRow() {
    const last = view.rows.at(-1);
    setView(judge([...view.rows, blankRow(last?.date || baseDate, seq.current++)], data));
  }

  function restart() {
    setPhase("input");
    setView({ rows: [], judged: [] });
    setUnreadLines([]);
    setIgnoredLines([]);
    setDone(null);
  }

  // ---- 登録 -----------------------------------------------------------------

  async function commit() {
    setConfirmOpen(false);
    const targets = view.rows.filter((r) => r.checked);
    if (targets.length === 0) return;
    setBusy("commit");
    try {
      const res = await commitPasteAction({ rows: targets });
      if (res.ok) {
        setDone({ count: res.count, skipped: view.rows.length - targets.length });
        setPhase("done");
        window.scrollTo({ top: 0 });
        return;
      }
      // 画面を開いている間に入った予約などで判定が変わったかもしれない → 最新で判定し直す
      const until = targets.map((r) => r.date).sort().at(-1) ?? baseDate;
      const fresh = await refreshJudgeDataAction({ until });
      if (fresh.ok) {
        const d = { ...data, existing: fresh.existing, overrides: fresh.overrides };
        setData(d);
        setView(judge(view.rows, d));
      }
      setNotice({ title: "登録できませんでした", message: res.error });
    } catch {
      setNotice({
        title: "登録できたか分かりません",
        message: "通信が途中で切れました。\n二重に登録しないよう、先に「予約一覧」で登録されたか確かめてください。",
      });
    } finally {
      setBusy("");
    }
  }

  // ---- 表示 -----------------------------------------------------------------

  if (phase === "done" && done) {
    return (
      <div className="space-y-5 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-5">
        <p className="flex items-center gap-2 text-xl font-bold text-emerald-800">
          <CheckCircle2Icon className="size-7" aria-hidden />
          {done.count} 件の予約を登録しました
        </p>
        {done.skipped > 0 && (
          <p className="text-base text-zinc-700">チェックしなかった {done.skipped} 件は登録していません。</p>
        )}
        <p className="text-base text-zinc-700">ネット予約の画面では、この時間は予約できなくなりました。</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button size="lg" className="h-14 text-base font-bold" render={<Link href="/admin/reservations" />}>
            予約一覧を見る
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 text-base"
            onClick={() => {
              setText("");
              restart();
            }}
          >
            続けて取り込む
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "input") {
    return (
      <div className="space-y-6">
        <ol className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 text-base leading-relaxed">
          {[
            "予約表を撮影する",
            "Google フォトで写真を開き、「レンズ」から文字を選んでコピーする",
            "この画面に戻って「貼り付け」を押す",
            "「読み込む」を押す",
          ].map((s, i) => (
            <li key={s} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-bold text-white">
                {i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>

        <div className="space-y-2">
          <label htmlFor="base-date" className="block text-base font-bold">
            この予約表の日付
          </label>
          <input
            id="base-date"
            type="date"
            value={baseDate}
            onChange={(e) => setBaseDate(e.target.value || today)}
            className={cn(fieldClass, "max-w-xs")}
          />
          <p className="text-sm text-zinc-600">日付が書かれていない予約は、この日付になります。</p>
        </div>

        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-14 w-full border-2 text-lg font-bold"
            onClick={pasteFromClipboard}
          >
            <ClipboardPasteIcon className="size-6" aria-hidden /> 貼り付け
          </Button>
          {pasteHelp && (
            <p className="rounded-md bg-amber-50 p-3 text-base text-amber-900" role="status">
              「貼り付け」が使えませんでした。下の枠を<strong>長押し</strong>して「貼り付け」を選んでください。
            </p>
          )}
          <Textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={"ここに予約表の文字が入ります\n例）10:00 山田 C2"}
            className="min-h-48 text-base"
            aria-label="予約表の文字"
          />
          {text && (
            <button type="button" className="text-sm text-zinc-500 underline" onClick={() => setText("")}>
              文字を消す
            </button>
          )}
        </div>

        <Button
          type="button"
          size="lg"
          className="h-14 w-full text-lg font-bold"
          disabled={busy !== ""}
          onClick={analyze}
        >
          {busy === "analyze" ? <Loader2Icon className="size-6 animate-spin" aria-hidden /> : null}
          読み込む
        </Button>
        <p className="text-sm text-zinc-600">「読み込む」を押しても、まだ登録はされません。次の画面で確かめてから登録します。</p>

        <NoticeDialog notice={notice} onOk={() => setNotice(null)} />
      </div>
    );
  }

  // ---- 確認画面 ----
  const counts = { ok: 0, check: 0, error: 0 };
  view.judged.forEach((j) => counts[j.status]++);
  const perDay = [...view.rows.reduce((m, r) => m.set(r.date, (m.get(r.date) ?? 0) + 1), new Map<string, number>())]
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-5 pb-28">
      {/* 「読み込む」で終わったと思われやすいので、まだ登録されていないことを先に伝える */}
      <p className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-base font-bold leading-relaxed text-amber-900" role="status">
        まだ登録されていません。中身を確かめてから、いちばん下の「登録する」を押してください。
      </p>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-lg font-bold">読み取った予約：{view.rows.length} 件</p>
        {perDay.length > 0 && (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-base sm:grid-cols-3">
            {perDay.map(([d, n]) => (
              <li key={d}>
                {dateLabel(d, false)}　<strong>{n} 件</strong>
              </li>
            ))}
          </ul>
        )}
        <p className="text-base leading-relaxed text-zinc-700">
          紙と見比べて、<strong>件数と中身</strong>が合っているか確かめてください。
          紙で ✖ を付けた（取り消した）予約は、「この行を消す」で消してください。
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-emerald-600 px-3 py-1 font-bold text-white">OK {counts.ok}</span>
          <span className="rounded-full bg-amber-500 px-3 py-1 font-bold text-white">要確認 {counts.check}</span>
          <span className="rounded-full bg-red-600 px-3 py-1 font-bold text-white">エラー {counts.error}</span>
        </div>
        <p className="text-sm text-zinc-600">
          OK はチェック済み。要確認は中身を見てから自分でチェック。エラーは直すまで登録できません。
        </p>
        <Button type="button" variant="outline" className="h-11" onClick={restart}>
          <RotateCcwIcon aria-hidden /> 貼り付けからやり直す
        </Button>
      </section>

      {view.rows.map((row, i) => (
        <RowCard
          key={row.key}
          row={row}
          judged={view.judged[i]!}
          mains={mains}
          options={options}
          menuBySlug={menuBySlug}
          onEdit={edit}
          onToggle={toggleChecked}
          onRemove={removeRow}
        />
      ))}

      <Button type="button" variant="outline" size="lg" className="h-14 w-full border-2 border-dashed text-base" onClick={addRow}>
        <PlusIcon className="size-5" aria-hidden /> 行を足す
      </Button>

      {unreadLines.length > 0 && (
        <section className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-base font-bold text-amber-900">読み取れなかった行（{unreadLines.length}）</p>
          <p className="text-sm text-amber-900">予約が入っていたら「行を足す」で入力してください。</p>
          <ul className="space-y-1 font-mono text-sm text-zinc-700">
            {unreadLines.map((l, i) => (
              <li key={i} className="break-all">{l}</li>
            ))}
          </ul>
        </section>
      )}
      {ignoredLines.length > 0 && (
        <details className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
          <summary className="cursor-pointer">予約ではないと判断して読み飛ばした行（{ignoredLines.length}）</summary>
          <ul className="mt-2 space-y-1 font-mono">
            {ignoredLines.map((l, i) => (
              <li key={i} className="break-all">{l}</li>
            ))}
          </ul>
        </details>
      )}

      {/* 下に固定の登録ボタン */}
      {/* md 以上は左にサイドバー（w-60）があるので、その分だけ右に寄せる */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 p-3 backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <p className="shrink-0 text-base">
            チェック <strong className="text-xl">{checkedRows.length}</strong> 件
          </p>
          <Button
            type="button"
            size="lg"
            className="h-14 flex-1 text-lg font-bold"
            disabled={checkedRows.length === 0 || busy !== ""}
            onClick={() => setConfirmOpen(true)}
          >
            {busy === "commit" ? <Loader2Icon className="size-6 animate-spin" aria-hidden /> : null}
            登録する
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg">{checkedRows.length} 件の予約を登録します</DialogTitle>
            <DialogDescription className="text-base text-foreground">
              メールは送りません。登録すると、ネット予約ではこの時間を選べなくなります。
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-base">
            {checkedRows.map((r) => (
              <li key={r.key}>
                {dateLabel(r.date, false)} {t(r.start)}〜{t(r.end)}　{r.name}様
                <span className="text-sm text-muted-foreground">{menuBySlug.get(r.mainSlug)?.code ?? ""}</span>
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="lg" className="h-12" onClick={() => setConfirmOpen(false)}>
              やめる
            </Button>
            <Button size="lg" className="h-12 font-bold" onClick={commit}>
              登録する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NoticeDialog notice={notice} onOk={() => setNotice(null)} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// 1 件分のカード
// -----------------------------------------------------------------------------

function RowCard({
  row,
  judged,
  mains,
  options,
  menuBySlug,
  onEdit,
  onToggle,
  onRemove,
}: {
  row: DraftRow;
  judged: Judged;
  mains: MenuEntry[];
  options: MenuEntry[];
  menuBySlug: Map<string, MenuEntry>;
  onEdit: (key: string, patch: Partial<DraftRow>, opts?: { syncEnd?: boolean }) => void;
  onToggle: (key: string, checked: boolean) => void;
  onRemove: (key: string) => void;
}) {
  const st = STATUS_STYLE[judged.status];
  const id = (s: string) => `${row.key}-${s}`;
  const minutes = menuMinutes(row.mainSlug, row.optionSlugs, menuBySlug);
  const endNote =
    row.endSource === "written"
      ? "紙に書いた時刻"
      : row.endSource === "menu"
        ? minutes > 0
          ? `メニューの時間（${minutes}分）`
          : "メニューを選ぶと決まります"
        : "手で直した時刻";
  const label = (m: MenuEntry) => (m.code ? `${m.code} ${m.name}` : m.name);

  return (
    <article className={cn("space-y-4 rounded-xl border-2 bg-white p-4", st.card)}>
      <div className="flex items-start justify-between gap-3">
        <label
          className={cn(
            "flex min-h-12 items-center gap-3 rounded-lg border px-3 text-base font-bold",
            judged.status === "error" ? "cursor-not-allowed border-zinc-200 text-zinc-400" : "cursor-pointer border-zinc-300",
          )}
        >
          <input
            type="checkbox"
            className="size-6 accent-zinc-900"
            checked={row.checked}
            disabled={judged.status === "error"}
            onChange={(e) => onToggle(row.key, e.target.checked)}
          />
          登録する
        </label>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold", st.badge)}>
          <st.Icon className="size-4" aria-hidden />
          {st.label}
        </span>
      </div>

      <p className="text-lg font-bold">
        {dateLabel(row.date)}　{t(row.start)}〜{t(row.end)}
      </p>

      {judged.reasons.length > 0 && (
        <ul className="space-y-1">
          {judged.reasons.map((r, i) => (
            <li
              key={i}
              className={cn(
                "rounded-md px-3 py-2 text-base",
                i < judged.errorCount ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900",
              )}
            >
              {r}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={id("date")} className="text-sm font-bold">日付</label>
          <input
            id={id("date")}
            type="date"
            value={row.date}
            onChange={(e) => onEdit(row.key, { date: e.target.value })}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <span className="text-sm font-bold">時刻</span>
          <div className="flex items-center gap-2">
            <select
              aria-label="始まり"
              value={row.start}
              onChange={(e) => onEdit(row.key, { start: e.target.value }, { syncEnd: true })}
              className={fieldClass}
            >
              <option value="">始まり</option>
              {timeOptions(row.start).map((v) => (
                <option key={v} value={v}>{t(v)}</option>
              ))}
            </select>
            <span aria-hidden>〜</span>
            <select
              aria-label="終わり"
              value={row.end}
              onChange={(e) => onEdit(row.key, { end: e.target.value, endSource: "manual" })}
              className={fieldClass}
            >
              <option value="">終わり</option>
              {timeOptions(row.end).map((v) => (
                <option key={v} value={v}>{t(v)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600">
            <span>終わり：{endNote}</span>
            {row.endSource !== "menu" && (
              <button
                type="button"
                className="underline"
                onClick={() => onEdit(row.key, { endSource: "menu" }, { syncEnd: true })}
              >
                メニューの時間にする
              </button>
            )}
            {row.writtenEnd && row.endSource !== "written" && (
              <button
                type="button"
                className="underline"
                onClick={() => onEdit(row.key, { end: row.writtenEnd, endSource: "written" })}
              >
                紙の時刻（{t(row.writtenEnd)}）にする
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor={id("name")} className="text-sm font-bold">お名前</label>
          <input
            id={id("name")}
            value={row.name}
            onChange={(e) => onEdit(row.key, { name: e.target.value })}
            className={fieldClass}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={id("menu")} className="text-sm font-bold">メニュー</label>
          <select
            id={id("menu")}
            value={row.mainSlug}
            onChange={(e) =>
              // 自分で選び直したら、読み取りの「確認してください」は消す
              onEdit(row.key, { mainSlug: e.target.value, menuNotice: "", unknownCodes: [] }, { syncEnd: true })
            }
            className={fieldClass}
          >
            <option value="">（選んでください）</option>
            {mains.map((m) => (
              <option key={m.slug} value={m.slug}>
                {label(m)}（{m.durationMin}分）
              </option>
            ))}
          </select>
        </div>

        <details className="sm:col-span-2" open={row.optionSlugs.length > 0}>
          <summary className="cursor-pointer py-1 text-sm font-bold">
            オプション
            {row.optionSlugs.length > 0 &&
              `：${row.optionSlugs.map((s) => menuBySlug.get(s)?.name ?? s).join("・")}`}
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {options.map((o) => {
              const on = row.optionSlugs.includes(o.slug);
              return (
                <button
                  key={o.slug}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onEdit(
                      row.key,
                      {
                        optionSlugs: on ? row.optionSlugs.filter((s) => s !== o.slug) : [...row.optionSlugs, o.slug],
                      },
                      { syncEnd: true },
                    )
                  }
                  className={cn(
                    "min-h-11 rounded-full border px-3 text-sm",
                    on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-800",
                  )}
                >
                  {label(o)}
                </button>
              );
            })}
          </div>
        </details>

        <div className="space-y-1">
          <label htmlFor={id("phone")} className="text-sm font-bold">電話番号（分かれば）</label>
          <input
            id={id("phone")}
            type="tel"
            inputMode="tel"
            value={row.phone}
            onChange={(e) => onEdit(row.key, { phone: e.target.value })}
            className={fieldClass}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={id("notes")} className="text-sm font-bold">メモ</label>
          <input
            id={id("notes")}
            value={row.notes}
            onChange={(e) => onEdit(row.key, { notes: e.target.value })}
            className={fieldClass}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        {row.sourceText ? (
          <p className="min-w-0 whitespace-pre-wrap break-all text-xs text-zinc-500">
            読み取った文字：{row.sourceText}
          </p>
        ) : (
          <span className="text-xs text-zinc-500">手で足した行</span>
        )}
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0 text-red-700"
          onClick={() => onRemove(row.key)}
        >
          <Trash2Icon aria-hidden /> この行を消す
        </Button>
      </div>
    </article>
  );
}
