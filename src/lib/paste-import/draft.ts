/**
 * 読み取った候補（ParsedRow）を、確認画面で直せる行（DraftRow）にする。
 * 画面とサーバーの両方で使う（純粋な処理だけ）。
 */
import type { Catalog, DraftRow, MenuEntry, ParsedRow } from "./types";

/**
 * 終了時刻の決め方。
 *   "written-first" … 紙に終了時刻が書いてあればそれを使い、無ければメニューの所要時間
 *   "menu"          … いつもメニューの所要時間（紙の終了時刻は使わない）
 *
 * オーナー様の意向が分かるまでは "written-first"（2026-10 決定）。
 * 紙で押さえた時間にネット予約が入り込まないほうが、お店で予約がかち合うより被害が小さいため。
 */
export const END_TIME_POLICY: "written-first" | "menu" = "written-first";

/** 予約表をそのままコピーした文字から作った行に付ける注意（日付を選び直すと消える） */
export const DATE_UNSURE_NOTICE =
  "この文字からは、何曜日の予約か分かりません。日付が合っているか確かめてください";

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function fromMinutes(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

export function menuMinutes(
  mainSlug: string,
  optionSlugs: string[],
  menuBySlug: Map<string, MenuEntry>,
): number {
  return [mainSlug, ...optionSlugs]
    .filter(Boolean)
    .reduce((sum, slug) => sum + (menuBySlug.get(slug)?.durationMin ?? 0), 0);
}

function endFromMenu(row: Pick<DraftRow, "start" | "mainSlug" | "optionSlugs">, bySlug: Map<string, MenuEntry>): string {
  const dur = menuMinutes(row.mainSlug, row.optionSlugs, bySlug);
  return row.start && dur > 0 ? fromMinutes(toMinutes(row.start) + dur) : "";
}

export function toDraftRows(parsed: ParsedRow[], catalog: Catalog): DraftRow[] {
  const bySlug = new Map(catalog.menus.map((m) => [m.slug, m]));
  const label = (slug: string) => {
    const m = bySlug.get(slug);
    return m ? (m.code ? `${m.code.replace(/^\+/, "")} ${m.name}` : m.name) : slug;
  };

  return parsed.map((p) => {
    const mains = p.menus.filter((h) => !bySlug.get(h.slug)?.isOption);
    const options = p.menus.filter((h) => bySlug.get(h.slug)?.isOption);
    const notices: string[] = [];
    if (mains.length > 1) {
      notices.push(
        `コースが ${mains.length} つ読み取れました（${mains.map((h) => label(h.slug)).join("・")}）。正しいものを選んでください`,
      );
    }
    for (const h of p.menus) {
      if (!h.sure) {
        notices.push(`「${h.matched}」を「${label(h.slug)}」として読みました。合っているか確認してください`);
      }
    }

    const base = {
      start: p.start,
      mainSlug: mains[0]?.slug ?? "",
      optionSlugs: options.map((h) => h.slug),
    };
    const useWritten = END_TIME_POLICY === "written-first" && Boolean(p.writtenEnd);

    return {
      key: p.key,
      date: p.date,
      start: p.start,
      end: useWritten ? p.writtenEnd : endFromMenu(base, bySlug),
      endSource: useWritten ? "written" : "menu",
      writtenEnd: p.writtenEnd,
      name: p.name,
      phone: p.phone,
      notes: p.notes,
      mainSlug: base.mainSlug,
      optionSlugs: base.optionSlugs,
      menuNotice: notices.join(" / "),
      dateNotice: p.dateUnsure ? DATE_UNSURE_NOTICE : "",
      unknownCodes: p.unknownCodes,
      sourceText: p.sourceLines.join("\n"),
      checked: false,
      lastStatus: null,
    } satisfies DraftRow;
  });
}

/** 開始時刻やメニューを直したあと、終了時刻を合わせ直す（メニューから決めている行だけ） */
export function syncEnd(row: DraftRow, menus: MenuEntry[]): DraftRow {
  if (row.endSource !== "menu") return row;
  const bySlug = new Map(menus.map((m) => [m.slug, m]));
  return { ...row, end: endFromMenu(row, bySlug) };
}

/** 「行を足す」で増やす空の行 */
export function blankRow(date: string, seq: number): DraftRow {
  return {
    key: `n${seq}`,
    date,
    start: "",
    end: "",
    endSource: "menu",
    writtenEnd: "",
    name: "",
    phone: "",
    notes: "",
    mainSlug: "",
    optionSlugs: [],
    menuNotice: "",
    dateNotice: "",
    unknownCodes: [],
    sourceText: "",
    checked: false,
    lastStatus: null,
  };
}
