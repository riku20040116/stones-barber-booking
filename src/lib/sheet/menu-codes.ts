/**
 * 手書き予約表のメニュー記号 ⇔ menus.slug の対応。
 * 実体は menu-codes.json（予約表 PDF の生成スクリプトと共有している）。
 *
 * 記載ルール:
 *   コース記号をまず書き、オプションを付ける場合だけ「+記号」を続ける。
 *     C2      … カット・シャンプー のみ
 *     C2+S    … カット・シャンプー ＋ お顔剃り
 *     K1+H+E  … カラー ＋ 頭皮スパ ＋ 耳洗い
 */
import codes from "./menu-codes.json";

export type SheetMenuCode = {
  code: string;
  slug: string;
  label: string;
  /** 昔の用紙で使っていた記号（古い用紙を撮影しても読めるように） */
  aliases?: string[];
};

export const MAIN_CODES: readonly SheetMenuCode[] = codes.main;
export const OPTION_CODES: readonly SheetMenuCode[] = codes.options;
export const ALL_CODES: readonly SheetMenuCode[] = [...MAIN_CODES, ...OPTION_CODES];

/** 用紙にも AI への説明にも使う記載ルール */
export const CODE_RULE = codes.rule;

/** AI に渡す「使ってよい記号」の一覧 */
export const ALL_CODE_STRINGS = ALL_CODES.map((c) => c.code) as [string, ...string[]];

const BY_CODE = new Map(ALL_CODES.map((c) => [c.code, c]));

/** オプションの「+ を除いた表記」→ 定義。別名（旧記号）も同じものを指す。 */
const OPTION_BY_TOKEN = new Map<string, SheetMenuCode>();
for (const o of OPTION_CODES) {
  OPTION_BY_TOKEN.set(o.code.replace(/^\+/, "").toUpperCase(), o);
  for (const a of o.aliases ?? []) OPTION_BY_TOKEN.set(a.toUpperCase(), o);
}
const MAX_OPTION_LEN = Math.max(...[...OPTION_BY_TOKEN.keys()].map((k) => k.length));

export function findCode(code: string): SheetMenuCode | undefined {
  return BY_CODE.get(code);
}

/** "s" "＋S" "剃" のような表記を正式な記号（"+S"）に直す。未知なら null。 */
export function normalizeCode(raw: string): string | null {
  const s = raw.normalize("NFKC").trim().toUpperCase();
  if (!s) return null;
  if (BY_CODE.has(s)) return s;
  const bare = s.replace(/^\+/, "");
  const opt = OPTION_BY_TOKEN.get(bare);
  return opt ? opt.code : null;
}

/** 連続した文字列をオプション記号に切り分ける（長い記号を優先して当てる） */
function tokenizeOptions(segment: string): { codes: string[]; unknown: string[] } {
  const found: string[] = [];
  const unknown: string[] = [];
  let buffer = "";
  let i = 0;

  const flush = () => {
    if (buffer) unknown.push(buffer);
    buffer = "";
  };

  while (i < segment.length) {
    let hit: SheetMenuCode | undefined;
    let len = 0;
    // "SF"（スキンフェード）と "S"（お顔剃り）のように前方が重なるので長いほうから試す
    for (let n = Math.min(MAX_OPTION_LEN, segment.length - i); n >= 1; n--) {
      const t = segment.slice(i, i + n);
      const m = OPTION_BY_TOKEN.get(t);
      if (m) {
        hit = m;
        len = n;
        break;
      }
    }
    if (hit) {
      flush();
      found.push(hit.code);
      i += len;
    } else {
      buffer += segment[i];
      i += 1;
    }
  }
  flush();
  return { codes: found, unknown };
}

/** 先頭の区切りからコース記号（C2 など）を拾う */
function tokenizeMain(segment: string): { codes: string[]; unknown: string[] } {
  const found: string[] = [];
  const unknown: string[] = [];
  const re = /([CSKPT])(\d)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const leftovers: string[] = [];

  while ((m = re.exec(segment)) !== null) {
    if (m.index > last) leftovers.push(segment.slice(last, m.index));
    const code = `${m[1]}${m[2]}`;
    if (BY_CODE.has(code)) found.push(code);
    else unknown.push(code);
    last = m.index + m[0].length;
  }
  if (last < segment.length) leftovers.push(segment.slice(last));

  // コース記号の残りかすは、オプションを「+」なしで書いた可能性がある（C2S など）
  for (const rest of leftovers) {
    if (!rest) continue;
    const opt = tokenizeOptions(rest);
    found.push(...opt.codes);
    unknown.push(...opt.unknown);
  }
  return { codes: found, unknown };
}

/**
 * 手書きのコース欄の文字列から記号を拾う。
 * AI が記号に直して返すのが基本だが、管理者が画面で書き換えた文字列もこれで解釈する。
 *
 *   "C2"      → ["C2"]
 *   "C2+S"    → ["C2", "+S"]
 *   "K1+H+E"  → ["K1", "+H", "+E"]
 *   "ｃ２＋ｓ" → ["C2", "+S"]（全角・小文字も吸収）
 *   "C2+剃"   → ["C2", "+S"]（旧記号も受け付ける）
 */
export function parseCourseText(text: string): {
  codes: string[];
  unknown: string[];
  /** 「+」で区切られずに続けて書かれていて、切り分け方が一通りに決まらない部分 */
  ambiguous: string[];
} {
  const s = text
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[・、,／/＆&]/g, "+")
    .replace(/\s+/g, "");

  const segments = s.split("+");
  const found: string[] = [];
  const unknown: string[] = [];
  const ambiguous: string[] = [];

  segments.forEach((seg, idx) => {
    if (!seg) return;
    const r = idx === 0 ? tokenizeMain(seg) : tokenizeOptions(seg);
    // "SFS" は「SF と S」とも「S と FS」とも読めてしまう。
    // 長いほうを優先して読むが、人が確認できるよう印を付けておく。
    if (idx > 0 && r.codes.length > 1) ambiguous.push(seg);
    found.push(...r.codes);
    unknown.push(...r.unknown);
  });

  return {
    codes: [...new Set(found)],
    unknown: [...new Set(unknown)],
    ambiguous,
  };
}

/** 記号の並びを表示用の文字列に戻す（"C2+S"） */
export function formatCodes(codeList: readonly string[]): string {
  const main = codeList.filter((c) => !c.startsWith("+"));
  const opts = codeList.filter((c) => c.startsWith("+"));
  return [...main, ...opts].join("");
}
