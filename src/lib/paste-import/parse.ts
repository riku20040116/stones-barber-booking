/**
 * 貼り付けた文字から、予約の候補を作る（データベースを使わない純粋な処理だけ）。
 *
 * 読めるもの:
 *   - Google の AI の回答（「火曜日（10月6日）」「北村 様」「コース：C2」「時間：12:15 〜 13:00」）
 *   - Google レンズでコピーした文字（並びが乱れていることがある）
 *   - 手で打った文字（「10:00 山田 C2」）
 *
 * 1 件の予約の情報は複数の行に分かれていてよい。お名前・メニュー・時刻がそろうまでを 1 件とする。
 *   - すでに時刻がある予約に、また時刻が来たら → 次の予約
 *   - すでにお名前がある予約に、またお名前が来たら → 次の予約
 *   - 日付が変わったら → 次の予約
 *
 * 判定（OK・要確認・エラー）はここではしない（judge.ts）。
 * テスト: parse.test.ts（`npm test`）
 */
import type {
  AliasInput,
  Catalog,
  CodeDefsInput,
  MenuEntry,
  MenuHit,
  MenuKey,
  ParsedRow,
  ParseOptions,
  ParseResult,
} from "./types";

// =============================================================================
// 文字のそろえ方
// =============================================================================

/** 全角・半角をそろえ、範囲の記号（〜 ～ ‐ — など）を "~" と "-" にそろえる */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[〜~]/g, "~")
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[ \t]+/g, " ");
}

const SMALL_TO_LARGE: Record<string, string> = {
  ァ: "ア", ィ: "イ", ゥ: "ウ", ェ: "エ", ォ: "オ",
  ッ: "ツ", ャ: "ヤ", ュ: "ユ", ョ: "ヨ", ヮ: "ワ", ヵ: "カ", ヶ: "ケ",
};

function toKatakana(s: string): string {
  return s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** きっちり比べる形（ひらがな→カタカナ、空白・中黒・長音・記号を消す。小さいカナは残す） */
export function strictKey(s: string): string {
  return toKatakana(normalizeText(s).toUpperCase()).replace(
    /[\sー・()（）[\]「」『』【】、。,.:;'"!?/~\-]/g,
    "",
  );
}

/** ゆるく比べる形（さらに小さいカナを大きくする。「カツト」と「カット」が同じになる） */
export function looseKey(s: string): string {
  return strictKey(s).replace(/[ァィゥェォッャュョヮヵヶ]/g, (c) => SMALL_TO_LARGE[c] ?? c);
}

/** お名前どうしを比べる形（様・さん を外して、ゆるく比べる） */
export function nameKey(s: string): string {
  return looseKey(s.replace(/(様|さま|さん|サン|殿)\s*$/u, ""));
}

/** 2 つのお名前が同じ人を指していそうか（紙は姓だけのことが多いので、前方一致も同じとみなす） */
export function sameName(a: string, b: string): boolean {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

// =============================================================================
// メニューの対応表
// =============================================================================

/**
 * データベースのメニュー・予約表の記号・オーナー様の略し方から、読み取り用の表を作る。
 *   - 記号（C2・+S）とメニューの正式名は「これで決まり」
 *   - 同じ書き方が 2 つ以上のメニューに当たる場合は使わない（例「カット・シャンプー」は大人・学生・子ども）
 *   - 略し方は対応表どおり（略し方の表が正式名より優先）
 */
export function buildCatalog(
  menus: MenuEntry[],
  codeDefs: CodeDefsInput,
  aliases: AliasInput[],
): Catalog {
  const active = new Set(menus.map((m) => m.slug));
  const codes: MenuKey[] = [];
  const codeBySlug = new Map<string, string>();

  const addCode = (code: string, slug: string) => {
    const k = code.toUpperCase();
    codes.push({ key: k, strict: k, slug, sure: true });
  };
  for (const c of codeDefs.main) {
    if (!active.has(c.slug)) continue;
    addCode(c.code, c.slug);
    codeBySlug.set(c.slug, c.code);
  }
  for (const o of codeDefs.options) {
    if (!active.has(o.slug)) continue;
    addCode(o.code, o.slug);
    codeBySlug.set(o.slug, o.code);
    for (const a of o.aliases ?? []) addCode(`+${a}`, o.slug);
  }

  // 正式名（かっこ書きを外した形も）
  const derived = new Map<string, { slugs: Set<string>; strict: string }>();
  const addDerived = (word: string, slug: string) => {
    const k = looseKey(word);
    if (k.length < 2) return;
    const cur = derived.get(k) ?? { slugs: new Set<string>(), strict: strictKey(word) };
    cur.slugs.add(slug);
    derived.set(k, cur);
  };
  for (const m of menus) {
    addDerived(m.name, m.slug);
    addDerived(m.name.replace(/[(（][^)）]*[)）]/g, ""), m.slug);
  }
  const words = new Map<string, MenuKey>();
  for (const [k, v] of derived) {
    if (v.slugs.size !== 1) continue; // 2 つ以上に当たる書き方は使わない
    words.set(k, { key: k, strict: v.strict, slug: [...v.slugs][0]!, sure: true });
  }
  for (const a of aliases) {
    if (!active.has(a.slug)) continue;
    const k = looseKey(a.word);
    if (k.length < 2) continue;
    words.set(k, { key: k, strict: strictKey(a.word), slug: a.slug, sure: a.sure });
  }

  return {
    menus: menus.map((m) => ({ ...m, code: codeBySlug.get(m.slug) ?? m.code })),
    codes,
    words: [...words.values()].sort((a, b) => b.key.length - a.key.length),
  };
}

// =============================================================================
// 1 行の中から情報を拾う
// =============================================================================

type TimeTok = { idx: number; len: number; hhmm: string };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 時刻を探す: 10:00 / 10時 / 10時半 / 14時30分 / 1000（数字だけは他に時刻が無いときだけ） */
function findTimes(s: string): TimeTok[] {
  const out: TimeTok[] = [];
  const re = /(\d{1,2}):(\d{2})|(\d{1,2})時(?:(半)|(\d{1,2})分)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const h = Number(m[1] ?? m[3]);
    const min = m[2] != null ? Number(m[2]) : m[4] ? 30 : m[5] != null ? Number(m[5]) : 0;
    if (h > 23 || min > 59) continue;
    out.push({ idx: m.index, len: m[0].length, hhmm: `${pad2(h)}:${pad2(min)}` });
  }
  if (out.length === 0) {
    // 「1000」「930」: 営業時間らしい数字で、5 分単位のものだけ時刻とみなす（料金の 1000 円などを避ける）
    const bare = /(?<![\d:/.,\-])(\d{3,4})(?![\d:/.,]|[円年月日])/g;
    while ((m = bare.exec(s)) !== null) {
      const n = Number(m[1]);
      const h = Math.floor(n / 100);
      const min = n % 100;
      if (h < 7 || h > 21 || min > 59 || min % 5 !== 0) continue;
      out.push({ idx: m.index, len: m[0].length, hhmm: `${pad2(h)}:${pad2(min)}` });
    }
  }
  return out.sort((a, b) => a.idx - b.idx);
}

/** 時刻の並びを「開始〜終了」の組にする（間が ~ - から なら組） */
function pairTimes(s: string, toks: TimeTok[]): { start: TimeTok; end: TimeTok | null }[] {
  const out: { start: TimeTok; end: TimeTok | null }[] = [];
  for (let i = 0; i < toks.length; i++) {
    const a = toks[i]!;
    const b = toks[i + 1];
    if (b) {
      const between = s.slice(a.idx + a.len, b.idx).trim();
      if (/^(~|-|から|to)$/i.test(between)) {
        out.push({ start: a, end: b });
        i++;
        continue;
      }
    }
    out.push({ start: a, end: null });
  }
  return out;
}

const PHONE_RE = /(?<!\d)(0\d{1,4}-\d{1,4}-\d{3,4}|0\d{9,10})(?!\d)/;
const DATE_RE =
  /(?:(\d{4})\s*[年.\-]\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日?|(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})(?![\d:])/;
const WEEKDAY_RE = /\(\s*[月火水木金土日]\s*\)|[月火水木金土日]曜日?/g;
const LABEL_RE =
  /^(?:予約)?(時間|時刻|コース|メニュー|お名前|名前|氏名|電話番号|電話|TEL|メモ|備考)\s*:\s*/i;
const HONORIFIC_RE = /(様|さま|さん|サン|殿|くん|ちゃん)(?=\s|$)/g;
const BULLET_RE = /^\s*(?:[*•・●○◯▪■□▶►>]+|\d{1,2}[.)、](?!\d))\s*/;

/** お名前として扱わない言葉（印刷された見出し・説明の言葉） */
const STOP_WORDS = new Set(
  [
    "予約表", "予約", "予約内容", "名前", "お名前", "コース", "メニュー", "時刻", "時間",
    "開始", "終了", "休", "備考", "メモ", "電話", "電話番号", "月", "日", "年", "STONE'S BARBER",
    "STONES BARBER", "この週の火曜日", "取り込み日", "取り込んだら記入", "火~日", "以上",
    "名", "記入",
    // メニューの一部として書かれやすい言葉（「カット シャンプー 顔剃り」など）
    "シャンプー",
  ].map((w) => looseKey(w)),
);

/** 予約表に印刷されている説明の行（レンズで表ごとコピーしたときに混ざる） */
const PRINTED_RE = /定休|営業\s|営業時間|破線|なぞ|取り込|記入例|所要時間|ページ目|行\s*=\s*15|この週の火曜日/;
const SHOP_NAME_RE = /STONE.?S\s*BARBER/gi;

/**
 * 「予約表（紙）をそのままコピーした文字」かどうかの目印。2 つ以上あれば、そうだとみなす。
 *
 * 予約表は、どの曜日の予約か・何時からの予約かを「枠の位置」で表している。
 * 文字にすると位置が消えるので、文字の中の日付（列の見出し）や時刻（印刷された目盛り）を
 * 予約の日時として使ってはいけない（もっともらしいが間違った日時になる）。
 */
const SHEET_MARKERS = [/この週の火曜日/, /取り込み日/, /破線/, /^時刻$/, /予約表\s*火\s*~\s*日/, /記号・所要時間/];

function isProse(text: string): boolean {
  return /。/.test(text) || /(です|ます|ください|ません)[!！]?$/.test(text);
}

type LineInfo = {
  raw: string;
  date: string | null;
  /** 日付と曜日だけの行（見出し） */
  header: boolean;
  prose: boolean;
  start: string;
  end: string;
  phone: string;
  hits: MenuHit[];
  unknownCodes: string[];
  words: string[];
  notes: string[];
  /**
   * 時刻の書かれ方。
   *   range    … 「12:15〜13:00」のように範囲で書いてある（人が書いた予約の時間）
   *   labelled … 「時間：10:00」のように見出しつき
   *   single   … 時刻がひとつだけ（予約表の印刷された目盛りかもしれない）
   */
  timeKind: "none" | "single" | "range" | "labelled";
  /** 時刻ひとつだけで、ほかに何も無い行（印刷された時刻の目盛りとみなして使わない） */
  bareTime: boolean;
};

function resolveDate(
  y: string | undefined,
  mo: string,
  d: string,
  today: string,
): string | null {
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = y ? Number(y) : Number(today.slice(0, 4));
  const make = (yy: number) => `${yy}-${pad2(month)}-${pad2(day)}`;
  if (!y) {
    // 年が無いときは今年。ただし今年だと 2 か月以上前になる場合は来年
    const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
    const twoMonthsAgo = new Date(Date.UTC(ty, tm - 1 - 2, td));
    const limit = `${twoMonthsAgo.getUTCFullYear()}-${pad2(twoMonthsAgo.getUTCMonth() + 1)}-${pad2(twoMonthsAgo.getUTCDate())}`;
    if (make(year) < limit) year += 1;
  }
  // 実在する日付か（2/30 などを弾く）
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCMonth() !== month - 1) return null;
  return make(year);
}

/** 記号（C2・+S・Cl など）を取り出す */
function extractCodes(
  text: string,
  catalog: Catalog,
): { hits: MenuHit[]; unknown: string[]; rest: string } {
  const codeMap = new Map(catalog.codes.map((c) => [c.key, c]));
  const hits: MenuHit[] = [];
  const unknown: string[] = [];

  const takeOption = (tok: string): string => {
    // "SF" が無ければ "S" を試し、残りの文字は戻す
    const T = tok.toUpperCase();
    const two = codeMap.get(`+${T}`);
    if (two) {
      hits.push({ slug: two.slug, via: "code", matched: `+${T}`, sure: true });
      return "";
    }
    const one = codeMap.get(`+${T[0]}`);
    if (one) {
      hits.push({ slug: one.slug, via: "code", matched: `+${T[0]}`, sure: true });
      return T.slice(1);
    }
    unknown.push(`+${T}`);
    return "";
  };

  // コース記号: C2 / c2 / C 2。直後に続けて書いたオプション（C2S）も拾う
  let rest = text.replace(
    /(^|[^A-Za-z0-9])([CSKPTcskpt])\s?(\d)([A-Z]{1,2})?(?!\d)/g,
    (_all, pre: string, l: string, d: string, glued: string | undefined) => {
      const code = `${l}${d}`.toUpperCase();
      const def = codeMap.get(code);
      if (def) hits.push({ slug: def.slug, via: "code", matched: code, sure: true });
      else unknown.push(code);
      const left = glued ? takeOption(glued) : "";
      return `${pre} ${left}`;
    },
  );

  // 読み違いやすい記号: Cl CI CZ → C1 C2（似ている扱い）
  rest = rest.replace(
    /(^|[^A-Za-z0-9])([CSKPT])([lI|!iLZz])(?![A-Za-z0-9])/g,
    (all, pre: string, l: string, ch: string) => {
      const digit = /[Zz]/.test(ch) ? "2" : "1";
      const def = codeMap.get(`${l}${digit}`);
      if (!def) return all;
      hits.push({ slug: def.slug, via: "fuzzy", matched: `${l}${ch}`, sure: false });
      return `${pre} `;
    },
  );

  // オプション: +S / +FS / +剃
  rest = rest.replace(/\+\s?([A-Za-z]{1,2}|[^\x00-\x7F])/g, (_all, tok: string) => {
    return ` ${takeOption(tok)} `;
  });

  return { hits, unknown, rest };
}

/** 正式名・略し方を取り出す（いちばん長く当たる部分から） */
function extractWords(text: string, catalog: Catalog): { hits: MenuHit[]; rest: string } {
  const byKey = new Map(catalog.words.map((w) => [w.key, w]));
  const hits: MenuHit[] = [];
  const remaining: string[] = [];

  for (const part of text.split(/\s+/).filter(Boolean)) {
    // 言葉ぜんたいが、メニュー名を 1〜2 字書き違えたもの（キングコーズ → キングコース）
    const whole = looseKey(part);
    if (whole.length >= 4 && !byKey.has(whole)) {
      let best: { def: MenuKey; d: number } | null = null;
      for (const def of catalog.words) {
        if (def.key.length < 4) continue;
        const d = levenshtein(whole, def.key);
        if (d <= (def.key.length <= 5 ? 1 : 2) && (!best || d < best.d)) best = { def, d };
      }
      if (best) {
        hits.push({ slug: best.def.slug, via: "fuzzy", matched: part, sure: false });
        continue;
      }
    }
    let word = part;
    for (let guard = 0; guard < 6 && word; guard++) {
      let found: { def: MenuKey; i: number; j: number } | null = null;
      outer: for (let len = word.length; len >= 2; len--) {
        for (let i = 0; i + len <= word.length; i++) {
          const sub = word.slice(i, i + len);
          const def = byKey.get(looseKey(sub));
          if (def) {
            found = { def, i, j: i + len };
            break outer;
          }
        }
      }
      if (!found) break;
      const sub = word.slice(found.i, found.j);
      const fuzzy = strictKey(sub) !== found.def.strict;
      hits.push({
        slug: found.def.slug,
        via: fuzzy ? "fuzzy" : "word",
        matched: sub,
        sure: found.def.sure && !fuzzy,
      });
      word = `${word.slice(0, found.i)}${word.slice(found.j)}`.trim();
    }
    if (word) remaining.push(word);
  }
  return { hits, rest: remaining.join(" ") };
}

/** お名前の候補の言葉に分ける。印刷された見出しの言葉だけだったかも返す */
function cleanWords(text: string): { words: string[]; onlyPrinted: boolean } {
  const all = text
    .replace(SHOP_NAME_RE, " 予約表 ")
    .replace(/火\s*~\s*日/g, " 予約表 ") // 予約表の題「予約表 火〜日」
    .replace(HONORIFIC_RE, " ")
    .replace(/[、。,.:;!?「」『』【】[\]<>"'*#~\-=_|\\/()（）←→]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  const words = all.filter(
    (w) =>
      !STOP_WORDS.has(looseKey(w)) &&
      /\p{L}/u.test(w) && // 文字（かな・漢字・英字）が 1 つも無いもの（「22」「$1」など）は名前にしない
      !/^[A-Za-z]$/.test(w), // 列の記号（A〜F）など 1 文字の英字は名前にしない
  );
  return { words, onlyPrinted: all.length > 0 && words.length === 0 && all.some((w) => STOP_WORDS.has(looseKey(w))) };
}

function parseSegment(segment: string, raw: string, opts: ParseOptions): LineInfo {
  const info: LineInfo = {
    raw,
    date: null,
    header: false,
    prose: false,
    start: "",
    end: "",
    phone: "",
    hits: [],
    unknownCodes: [],
    words: [],
    notes: [],
    timeKind: "none",
    bareTime: false,
  };
  let s = segment.replace(BULLET_RE, "");

  // 見出し語（時間：コース：など）
  let label = "";
  const lm = s.match(LABEL_RE);
  if (lm) {
    label = lm[1]!.toLowerCase();
    s = s.slice(lm[0].length);
  }
  if (label === "メモ" || label === "備考") {
    if (s.trim()) info.notes.push(s.trim());
    return info;
  }

  // 電話番号
  const pm = s.match(PHONE_RE);
  if (pm) {
    info.phone = pm[1]!;
    s = s.replace(pm[0], " ");
  }

  // 日付
  const dm = s.match(DATE_RE);
  if (dm) {
    const date =
      dm[2] != null
        ? resolveDate(dm[1], dm[2], dm[3]!, opts.today)
        : resolveDate(dm[4], dm[5]!, dm[6]!, opts.today);
    if (date) {
      info.date = date;
      s = s.replace(dm[0], " ");
    }
  }
  s = s.replace(WEEKDAY_RE, " ");

  // 時刻（この関数に来る時点で開始時刻は 1 つまで）
  const toks = findTimes(s);
  if (toks.length > 0) {
    const [pair] = pairTimes(s, toks);
    info.start = pair!.start.hhmm;
    if (pair!.end) info.end = pair!.end.hhmm;
    info.timeKind = pair!.end ? "range" : label === "時間" || label === "時刻" ? "labelled" : "single";
    // 取り出した時刻の部分を消す（後ろから）
    for (const t of [...toks].reverse()) s = s.slice(0, t.idx) + " " + s.slice(t.idx + t.len);
    s = s.replace(/(^|\s)(~|-|から)(?=\s|$)/g, " ");
  }

  // かっこ書きはメモへ
  s = s.replace(/[(（]([^)）]{1,30})[)）]/g, (_a, inner: string) => {
    if (inner.trim()) info.notes.push(inner.trim());
    return " ";
  });

  if (label === "お名前" || label === "名前" || label === "氏名") {
    info.words = cleanWords(s).words;
    return info;
  }

  // 文章（AI の前置き・しめくくり）
  if (!info.start && isProse(s)) {
    info.prose = true;
    return info;
  }

  // メニュー
  const codes = extractCodes(s, opts.catalog);
  info.hits.push(...codes.hits);
  info.unknownCodes.push(...codes.unknown);
  const words = extractWords(codes.rest, opts.catalog);
  info.hits.push(...words.hits);

  const cw = cleanWords(words.rest);
  info.words = cw.words;
  // 長すぎる「お名前」は文章とみなす
  if (info.words.join("").length > 16 && !info.start) {
    info.prose = true;
    info.words = [];
  }
  // 「名前 コース」「月 日 (火) 休」のような印刷された見出しだけの行は読み飛ばす
  const nothing =
    !info.date && !info.start && !info.phone && info.hits.length === 0 &&
    info.unknownCodes.length === 0 && info.words.length === 0 && info.notes.length === 0;
  if (nothing && cw.onlyPrinted) info.prose = true;

  const onlyDate =
    info.date && !info.start && !info.phone && info.hits.length === 0 &&
    info.unknownCodes.length === 0 && info.words.length === 0 && info.notes.length === 0;
  info.header = Boolean(onlyDate);
  info.bareTime =
    info.timeKind === "single" && !info.date && !info.phone &&
    info.hits.length === 0 && info.unknownCodes.length === 0 &&
    info.words.length === 0 && info.notes.length === 0;
  return info;
}

/** 1 行を解析する。1 行に予約が 2 つ以上（開始時刻が 2 つ以上）あれば分ける */
function parseLine(rawLine: string, opts: ParseOptions): LineInfo[] {
  const s = normalizeText(rawLine).trim();
  if (PRINTED_RE.test(s)) {
    // 印刷された説明（「営業 火〜金 9:30-19:30」など）。時刻が書いてあっても予約ではない
    return [{ ...parseSegment("", rawLine, opts), prose: true }];
  }
  const toks = findTimes(s);
  const starts = pairTimes(s, toks).map((p) => p.start);
  if (starts.length <= 1) return [parseSegment(s, rawLine, opts)];

  // 「10:00 山田 C2 11:00 佐藤 C1」→ 開始時刻ごとに区切る（最初の時刻より前の文字は 1 件目に含める）
  const out: LineInfo[] = [];
  for (let i = 0; i < starts.length; i++) {
    const from = i === 0 ? 0 : starts[i]!.idx;
    const to = i + 1 < starts.length ? starts[i + 1]!.idx : s.length;
    out.push(parseSegment(s.slice(from, to), rawLine, opts));
  }
  return out;
}

// =============================================================================
// 行をまとめて予約の候補にする
// =============================================================================

type Rec = {
  date: string;
  start: string;
  end: string;
  phone: string;
  hits: MenuHit[];
  unknown: string[];
  names: string[];
  notes: string[];
  lines: string[];
};

/** メニューが 1 つも読めない予約で、お名前の候補が 2 つ以上あるとき、似ている名前を探す */
function fuzzyMenuFromNames(rec: Rec, catalog: Catalog): void {
  if (rec.hits.length > 0 || rec.names.length < 2) return;
  let best: { idx: number; def: MenuKey; d: number } | null = null;
  rec.names.forEach((w, idx) => {
    if (idx === 0) return; // 最初の言葉はお名前として残す
    const k = looseKey(w);
    if (k.length < 3) return;
    for (const def of catalog.words) {
      if (def.key.length < 3) continue;
      const limit = def.key.length <= 5 ? 1 : 2;
      const d = levenshtein(k, def.key);
      if (d <= limit && (!best || d < best.d)) best = { idx, def, d };
    }
  });
  if (!best) return;
  const b = best as { idx: number; def: MenuKey; d: number };
  rec.hits.push({ slug: b.def.slug, via: "fuzzy", matched: rec.names[b.idx]!, sure: false });
  rec.names.splice(b.idx, 1);
}

export function parsePastedText(text: string, opts: ParseOptions): ParseResult {
  const unreadLines: string[] = [];
  const ignoredLines: string[] = [];

  const infos: LineInfo[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    infos.push(...parseLine(raw, opts));
  }

  // 予約表（紙）をそのままコピーした文字か。
  //   - 印刷された言葉（「この週の火曜日」「取り込み日」など）が 2 つ以上ある
  //   - または、時刻だけの行（印刷された時刻の目盛り）が 3 行以上ある
  const normalized = text.split(/\r?\n/).map((l) => normalizeText(l).trim());
  const markerCount = SHEET_MARKERS.filter((re) => normalized.some((l) => re.test(l))).length;
  const sheetMode = markerCount >= 2 || infos.filter((i) => i.bareTime).length >= 3;

  const recs: Rec[] = [];
  let cur: Rec | null = null;
  let curDate = opts.baseDate;
  const flush = () => {
    if (cur) recs.push(cur);
    cur = null;
  };
  const ignore = (info: LineInfo) => {
    if (!ignoredLines.includes(info.raw.trim())) ignoredLines.push(info.raw.trim());
  };

  infos.forEach((info) => {
    // 時刻だけの行は、印刷された時刻の目盛りとみなして使わない（予約の時刻にしない）。
    // 人が書いた時刻は「10:00 山田 C2」のように同じ行にあるか、「12:15〜13:00」「時間：10:00」の形。
    if (info.prose || info.bareTime) {
      ignore(info);
      return;
    }
    if (sheetMode) {
      // 予約表の文字では、日付（列の見出し）と時刻（目盛り）は予約の日時ではない。
      // 範囲で書かれた時間（9:30〜10:15）と見出しつきの時間だけ、人が書いたものとして残す。
      if (info.header) {
        ignore(info);
        return;
      }
      info.date = null;
      if (info.timeKind === "single") {
        info.start = "";
        info.timeKind = "none";
      }
    }
    if (info.date && info.date !== curDate) {
      flush();
      curDate = info.date;
    }
    if (info.header) {
      flush();
      return;
    }
    const hasTime = Boolean(info.start);
    const hasName = info.words.length > 0;
    const hasMenu = info.hits.length > 0 || info.unknownCodes.length > 0;
    if (!hasTime && !hasName && !hasMenu && !info.phone && info.notes.length === 0) {
      unreadLines.push(info.raw.trim());
      return;
    }
    const c = cur as Rec | null;
    if (!c || (hasTime && c.start) || (hasName && c.names.length > 0)) {
      flush();
      cur = {
        date: curDate, start: "", end: "", phone: "", hits: [], unknown: [],
        names: [], notes: [], lines: [],
      };
    }
    const r = cur as unknown as Rec;
    if (hasTime) {
      r.start = info.start;
      r.end = info.end;
    }
    r.names.push(...info.words);
    r.hits.push(...info.hits);
    r.unknown.push(...info.unknownCodes);
    if (info.phone && !r.phone) r.phone = info.phone;
    r.notes.push(...info.notes);
    if (!r.lines.includes(info.raw.trim())) r.lines.push(info.raw.trim());
  });
  flush();

  const rows: ParsedRow[] = [];
  recs.forEach((rec, i) => {
    fuzzyMenuFromNames(rec, opts.catalog);
    // 時刻もメニューも無い（お名前だけ）ものは、予約ではなく「読み取れなかった行」に回す。
    // ただし予約表の文字では時刻は元から無く、コースの記号も読み違えやすいので、
    // 2 文字以上のお名前は候補として残す（時刻とメニューは確認画面で選んでもらう）。
    if (!rec.start && rec.hits.length === 0 && rec.unknown.length === 0) {
      const nameOnlyRow = sheetMode && nameKey(rec.names.join("")).length >= 2;
      if (!nameOnlyRow) {
        unreadLines.push(...rec.lines);
        return;
      }
    }
    // 同じメニューが 2 回読めたら 1 つにする
    const seen = new Set<string>();
    const hits = rec.hits.filter((h) => (seen.has(h.slug) ? false : (seen.add(h.slug), true)));
    rows.push({
      key: `p${i + 1}`,
      date: rec.date,
      start: rec.start,
      writtenEnd: rec.end,
      name: rec.names.join(" "),
      phone: rec.phone,
      menus: hits,
      unknownCodes: [...new Set(rec.unknown)],
      notes: rec.notes.join(" / "),
      sourceLines: rec.lines,
      dateUnsure: sheetMode,
    });
  });

  return { rows, unreadLines, ignoredLines, sheetMode };
}
