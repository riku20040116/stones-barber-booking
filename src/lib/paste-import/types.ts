/**
 * 手書き予約表の「貼り付け取り込み」で使う型。
 * サーバーと画面の両方で使う（すべてシリアライズできる形）。
 */

/** 読み取りに使うメニュー 1 件 */
export type MenuEntry = {
  slug: string;
  id: string;
  /** 画面に出す正式名 */
  name: string;
  price: number;
  durationMin: number;
  isOption: boolean;
  /** 予約表の記号（C2 / +S など）。無ければ null */
  code: string | null;
};

/** 文字 → メニューの対応 1 件（正式名・記号・略し方） */
export type MenuKey = {
  /** ゆるく比べる文字（小さいカナ・ひらがな/カタカナの違いをなくしたもの） */
  key: string;
  /** きっちり比べる文字（小さいカナの違いは残す）。これが違えば「似ている名前」扱い */
  strict: string;
  slug: string;
  /**
   * true: これで決まり（記号・正式名）。
   * false: たぶん合っているが確かめてほしい（あいまいな略し方）→ 判定は「要確認」
   */
  sure: boolean;
};

/** 予約表の記号の定義（src/lib/sheet/menu-codes.json の形） */
export type CodeDefsInput = {
  main: { code: string; slug: string }[];
  options: { code: string; slug: string; aliases?: string[] }[];
};

/** オーナー様の略し方（aliases.ts の形） */
export type AliasInput = { word: string; slug: string; sure: boolean };

export type Catalog = {
  menus: MenuEntry[];
  /** 記号（C2 など）。+ の付いたオプションも含む */
  codes: MenuKey[];
  /** 正式名・略し方（長い順） */
  words: MenuKey[];
};

/** 読み取ったメニュー 1 件 */
export type MenuHit = {
  slug: string;
  /** code = 記号 / word = 名前・略し方 / fuzzy = 似ている名前 */
  via: "code" | "word" | "fuzzy";
  /** 文字の中で見つかった部分（「カツト」など） */
  matched: string;
  sure: boolean;
};

/** 貼り付けた文字から作った予約の候補（読み取った直後の形） */
export type ParsedRow = {
  key: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM（無ければ ""）
  /** 紙に書いてあった終了時刻（無ければ ""） */
  writtenEnd: string;
  name: string;
  phone: string;
  menus: MenuHit[];
  /** 読めなかった記号（C9 など） */
  unknownCodes: string[];
  notes: string;
  /** もとの文字（この候補を作った行） */
  sourceLines: string[];
};

export type ParseResult = {
  rows: ParsedRow[];
  /** 予約にまとめられなかった行 */
  unreadLines: string[];
  /** 予約ではないと判断して読み飛ばした行（説明の文章・印刷された時刻など） */
  ignoredLines: string[];
};

export type ParseOptions = {
  /** 日付が書かれていない行に使う日付（この予約表の日付） */
  baseDate: string;
  /** 今日（日本時間）。年の補い方に使う */
  today: string;
  catalog: Catalog;
};

// -----------------------------------------------------------------------------
// 確認画面の 1 行（オーナー様が直す対象）
// -----------------------------------------------------------------------------

/** 終了時刻をどこから決めたか */
export type EndSource = "written" | "menu" | "manual";

export type DraftRow = {
  key: string;
  date: string;
  start: string;
  end: string;
  endSource: EndSource;
  /** 紙に書いてあった終了時刻（「紙の時刻に戻す」用） */
  writtenEnd: string;
  name: string;
  phone: string;
  notes: string;
  /** コース（C1〜T1 など）。無ければ "" */
  mainSlug: string;
  optionSlugs: string[];
  /**
   * メニューについての注意（似た名前から選んだ・コースが 2 つ読めた など）。
   * オーナー様がメニューを選び直したら消える。
   */
  menuNotice: string;
  /** 読めなかった記号 */
  unknownCodes: string[];
  sourceText: string;
  checked: boolean;
  /** 前回の判定（チェックの初期値を決め直すかどうかの判断に使う） */
  lastStatus: JudgeStatus | null;
};

// -----------------------------------------------------------------------------
// 判定
// -----------------------------------------------------------------------------

export type JudgeStatus = "ok" | "check" | "error";

export type Judged = {
  status: JudgeStatus;
  /** オーナー様が読んで分かる理由（エラーの理由が先、要確認の理由があと） */
  reasons: string[];
  /** reasons のうち、先頭から何個がエラーの理由か */
  errorCount: number;
};

/** すでに入っている予約（日本時間の文字列にしたもの） */
export type ExistingReservation = {
  id: string;
  code: string;
  date: string;
  start: string;
  end: string;
  name: string;
};

export type DayHours =
  | { isOpen: true; open: string; close: string }
  | { isOpen: false; reason: string };
