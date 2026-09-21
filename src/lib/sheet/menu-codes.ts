/**
 * 手書き予約表のメニュー記号 ⇔ menus.slug の対応。
 * 実体は menu-codes.json（予約表 PDF の生成スクリプトと共有している）。
 */
import codes from "./menu-codes.json";

export type SheetMenuCode = { code: string; slug: string; label: string };

export const MAIN_CODES: readonly SheetMenuCode[] = codes.main;
export const OPTION_CODES: readonly SheetMenuCode[] = codes.options;
export const ALL_CODES: readonly SheetMenuCode[] = [...MAIN_CODES, ...OPTION_CODES];

/** AI に渡す「選んでよい記号」の一覧（構造化出力の enum に使う） */
export const ALL_CODE_STRINGS = ALL_CODES.map((c) => c.code) as [string, ...string[]];

const BY_CODE = new Map(ALL_CODES.map((c) => [c.code, c]));

export function findCode(code: string): SheetMenuCode | undefined {
  return BY_CODE.get(code);
}

/**
 * 手書きのメニュー欄の文字列から記号を拾う。
 * AI が記号を正規化して返してくれるのが基本だが、管理者が画面で書き換えた
 * 文字列もこれで解釈し直す。
 *
 *   "C2+剃"   → ["C2", "+剃"]
 *   "ｃ２＋剃" → ["C2", "+剃"]（全角・小文字も吸収）
 *   "K1 +頭"  → ["K1", "+頭"]
 */
export function parseCourseText(text: string): {
  codes: string[];
  unknown: string[];
} {
  const s = text.normalize("NFKC").toUpperCase().replace(/\s+/g, "");
  const found: string[] = [];
  const unknown: string[] = [];

  const mainRe = /([CSKPT])(\d)/g;
  let m: RegExpExecArray | null;
  while ((m = mainRe.exec(s)) !== null) {
    const code = `${m[1]}${m[2]}`;
    if (BY_CODE.has(code)) found.push(code);
    else unknown.push(code);
  }

  // オプションは「+」の直後の 1 文字（剃・頭・顔 …）
  const optRe = /\+(.)/g;
  while ((m = optRe.exec(s)) !== null) {
    const code = `+${m[1]}`;
    if (BY_CODE.has(code)) found.push(code);
    else unknown.push(code);
  }

  return { codes: [...new Set(found)], unknown };
}

/** 記号の並びを表示用の文字列に戻す（"C2+剃"） */
export function formatCodes(codeList: readonly string[]): string {
  const main = codeList.filter((c) => !c.startsWith("+"));
  const opts = codeList.filter((c) => c.startsWith("+"));
  return [...main, ...opts].join("");
}
