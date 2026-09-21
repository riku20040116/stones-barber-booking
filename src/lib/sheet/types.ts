/**
 * 手書き予約表の取り込みで、サーバーと画面の間を行き来するデータの型。
 * すべてシリアライズ可能（Server Action の引数・戻り値にできる）にしている。
 */

export type SheetColumn = "A" | "B" | "C" | "D" | "E" | "F";
export const SHEET_COLUMNS: readonly SheetColumn[] = ["A", "B", "C", "D", "E", "F"];

export type Confidence = "high" | "medium" | "low";

/** 顧客リストの候補 */
export type CustomerCandidate = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** なぜ候補に挙がったか（画面に出す） */
  reason: string;
  score: number;
};

/** この行の予約を誰の予約として登録するか */
export type CustomerChoice =
  | { mode: "existing"; id: string }
  | { mode: "new"; name: string; phone: string }
  | { mode: "unset" };

/** 他の予約との重複 */
export type ConflictInfo = {
  /** system = すでにシステムに入っている予約 / sheet = 今回の取り込み内の別の行 */
  kind: "system" | "sheet";
  reservationId: string | null;
  reservationCode: string | null;
  otherRowKey: string | null;
  name: string;
  date: string;
  start: string;
  end: string;
  source: string | null;
  /** 同じお客様・同じ開始時刻 → 同じ予約を二重に書いた可能性が高い */
  likelySame: boolean;
};

/**
 * 重複の解決方法。
 *  変更対象（target）× 変更内容（action）で表す。
 */
export type Resolution =
  | { target: "sheet"; action: "skip" }
  | { target: "sheet"; action: "move"; date: string; start: string }
  | { target: "system"; action: "cancel"; reservationId: string }
  | { target: "system"; action: "move"; reservationId: string; date: string; start: string };

/** 確認画面の 1 行 = 手書きの予約 1 件 */
export type DraftRow = {
  key: string;
  include: boolean;

  column: SheetColumn;
  date: string; // YYYY-MM-DD（読めなければ ""）
  start: string; // HH:MM
  end: string; // HH:MM

  /** 「開始」欄に書かれていた時刻（照合用） */
  writtenStart: string;
  name: string;
  courseText: string;
  codes: string[];
  unknownCodes: string[];
  memoNo: number | null;
  /** 2ページ目のお客様メモから拾った電話番号 */
  memoPhone: string;

  confidence: Confidence;
  aiRemarks: string;

  customer: CustomerChoice;
  candidates: CustomerCandidate[];

  /** 登録前に確認してほしいこと（赤字で出す） */
  warnings: string[];
  conflicts: ConflictInfo[];
  resolution: Resolution | null;

  /** 合計金額・所要時間（表示用） */
  totalPrice: number;
  menuDuration: number;
};

export type SheetMeta = {
  weekStart: string; // A 列の日付（推定）
  sheetWarnings: string[];
  model: string | null;
};

export type ReadSheetResult =
  | { ok: true; rows: DraftRow[]; meta: SheetMeta }
  | { ok: false; error: string };

export type RecheckResult =
  | { ok: true; rows: DraftRow[] }
  | { ok: false; error: string };

export type CommitRowResult = {
  key: string;
  ok: boolean;
  message: string;
  reservationCode?: string;
};

export type CommitResult =
  | { ok: true; results: CommitRowResult[] }
  /** まだ解決していない重複がある → 画面でポップアップを出す */
  | { ok: false; needsResolution: true; rows: DraftRow[] }
  | { ok: false; needsResolution?: false; error: string };
