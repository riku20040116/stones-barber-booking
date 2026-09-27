/**
 * 手書き予約表の写真を AI で読み取る（どの AI を使うかの振り分け）。
 *
 * 使う AI（上から順に、設定されているものを使う）:
 *   1. Claude（有料）  ANTHROPIC_API_KEY
 *   2. Gemini（無料枠） GEMINI_API_KEY
 * SHEET_READER=claude / gemini で強制できる。
 *
 * 読み取り結果はそのまま登録せず、必ず管理画面で人が確認してから登録する。
 */
import "server-only";

import { extractWithClaude } from "./providers/claude";
import { extractWithGemini } from "./providers/gemini";
import {
  SheetExtractionSchema,
  type ExtractResult,
  type SheetImage,
} from "./schema";

export type { ExtractResult, SheetImage } from "./schema";

export type SheetReader = {
  provider: "mock" | "claude" | "gemini" | null;
  /** 画面に出す名前 */
  label: string;
  /** 無料枠（送った内容が AI 提供元の製品改善に使われる） */
  free: boolean;
  /**
   * 3 ページ目（お客様メモ・電話番号）を送ってよいか。
   * 無料枠は規約で個人情報の送信が禁止されているので送らない。
   */
  sendsMemo: boolean;
};

/**
 * どの AI で読み取るか。
 *
 * モックの条件は必ず `process.env.NODE_ENV !== "production"` をその場に書くこと。
 * 本番ビルドでは NODE_ENV が文字列に置き換わって分岐ごと消えるので、
 * ファイル読み込み（fs）が本番の関数に含まれない。関数に切り出すと消えずに残り、
 * Next のファイル追跡がプロジェクト全体を本番の関数に詰め込んでしまう。
 */
export function getSheetReader(): SheetReader {
  if (process.env.NODE_ENV !== "production" && process.env.SHEET_EXTRACT_MOCK_FILE) {
    return { provider: "mock", label: "テスト用データ", free: true, sendsMemo: true };
  }
  const forced = process.env.SHEET_READER;
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);

  if ((forced === "claude" || !forced) && hasClaude) {
    return { provider: "claude", label: "Claude（有料）", free: false, sendsMemo: true };
  }
  if ((forced === "gemini" || !forced) && hasGemini) {
    return { provider: "gemini", label: "Gemini（無料枠）", free: true, sendsMemo: false };
  }
  return { provider: null, label: "未設定", free: false, sendsMemo: false };
}

export function isSheetReaderConfigured(): boolean {
  return getSheetReader().provider !== null;
}

export async function extractSheet(
  images: SheetImage[],
): Promise<ExtractResult & { droppedMemo?: boolean }> {
  const reader = getSheetReader();

  if (process.env.NODE_ENV !== "production" && process.env.SHEET_EXTRACT_MOCK_FILE) {
    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(process.env.SHEET_EXTRACT_MOCK_FILE, "utf8"));
    const parsed = SheetExtractionSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `モックの形式が不正です: ${parsed.error.message}` };
    return { ok: true, extraction: parsed.data, model: "mock" };
  }

  if (reader.provider === null) {
    return {
      ok: false,
      error:
        "写真の読み取り機能が設定されていません（GEMINI_API_KEY または ANTHROPIC_API_KEY が未設定です）。開発者にご連絡ください。",
    };
  }

  // 無料枠には個人情報（お客様メモの電話番号）を送らない
  const toSend = reader.sendsMemo ? images : images.filter((i) => i.kind !== "memo");
  const droppedMemo = toSend.length < images.length;
  if (toSend.length === 0) {
    return {
      ok: false,
      error:
        "予約表 1/2・2/2 の写真を選んでください（無料版では、お客様メモのページは読み取りに送りません）。",
    };
  }

  const res =
    reader.provider === "claude" ? await extractWithClaude(toSend) : await extractWithGemini(toSend);
  return { ...res, droppedMemo };
}
