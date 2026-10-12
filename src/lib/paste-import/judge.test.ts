/**
 * 確認画面の行の作り方（draft.ts）と判定（judge.ts）のテスト。`npm test` で動く。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePastedText } from "./parse.ts";
import { blankRow, syncEnd, toDraftRows } from "./draft.ts";
import { judgeRows, withJudgement, type JudgeContext } from "./judge.ts";
import { TEST_CATALOG, TEST_MENUS } from "./test-fixtures.ts";
import type { DayHours, DraftRow, ExistingReservation } from "./types";

const TODAY = "2026-10-12";

function drafts(text: string, baseDate = "2026-10-15"): DraftRow[] {
  const parsed = parsePastedText(text, { baseDate, today: TODAY, catalog: TEST_CATALOG });
  return toDraftRows(parsed.rows, TEST_CATALOG);
}

/** 月曜休み、平日 9:30〜19:30、土日 9:00〜19:00（第 3 火曜などはテストでは省く） */
function dayHours(date: string): DayHours {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (dow === 1) return { isOpen: false, reason: "定休日" };
  if (dow === 0 || dow === 6) return { isOpen: true, open: "09:00", close: "19:00" };
  return { isOpen: true, open: "09:30", close: "19:30" };
}

function ctx(existing: ExistingReservation[] = []): JudgeContext {
  return { nowDate: TODAY, nowTime: "12:00", dayHours, existing };
}

const ex = (date: string, start: string, end: string, name: string): ExistingReservation => ({
  id: `id-${name}`, code: "R-TEST", date, start, end, name,
});

// -----------------------------------------------------------------------------
// 行の作り方
// -----------------------------------------------------------------------------

test("終了時刻: 紙に書いてあればそれ、無ければメニューの所要時間", () => {
  const rows = drafts("10:00〜10:45 山田 C2\n11:00 佐藤 C2+S");
  assert.deepEqual(rows.map((r) => [r.start, r.end, r.endSource]), [
    ["10:00", "10:45", "written"],
    ["11:00", "11:50", "menu"], // 35 分 + 15 分
  ]);
  assert.deepEqual(rows[1]!.optionSlugs, ["opt-face-shave"]);
  assert.equal(rows[1]!.mainSlug, "cut-adult");
});

test("メニューを直すと終了時刻も直る（メニューから決めた行だけ）", () => {
  const [written, menu] = drafts("10:00〜10:45 山田 C2\n11:00 佐藤 C2");
  assert.equal(syncEnd({ ...written!, mainSlug: "course-king" }, TEST_MENUS).end, "10:45");
  assert.equal(syncEnd({ ...menu!, mainSlug: "course-king" }, TEST_MENUS).end, "12:50");
  assert.equal(syncEnd({ ...menu!, start: "13:00" }, TEST_MENUS).end, "13:35");
});

test("コースが 2 つ・似ている名前のときは知らせる文を付ける", () => {
  const [two, fuzzy] = drafts("10:00 山田 C2 C3\n11:00 佐藤 カツト");
  assert.match(two!.menuNotice, /コースが 2 つ/);
  assert.match(fuzzy!.menuNotice, /「カツト」を「C2 カット・シャンプー（大人）」として読みました/);
});

// -----------------------------------------------------------------------------
// 判定
// -----------------------------------------------------------------------------

function judgeText(text: string, existing: ExistingReservation[] = [], baseDate?: string) {
  const rows = drafts(text, baseDate);
  return judgeRows(rows, ctx(existing));
}

test("問題なし → OK", () => {
  const [j] = judgeText("10:00 山田 C2");
  assert.deepEqual(j, { status: "ok", reasons: [], errorCount: 0 });
});

test("時刻・お名前・メニューが無い → エラー", () => {
  const rows = [blankRow("2026-10-15", 1)];
  const [j] = judgeRows(rows, ctx());
  assert.equal(j!.status, "error");
  assert.deepEqual(j!.reasons, ["時刻がありません", "お名前がありません", "メニューがありません"]);
});

test("過去の日時 → エラー", () => {
  // 今が 2026-10-13（火）12:00 のとき
  const rows = drafts("10/10 10:00 山田 C2\n10/13 11:00 佐藤 C2\n10/13 13:00 鈴木 C2");
  const [past, earlierToday, laterToday] = judgeRows(rows, {
    ...ctx(),
    nowDate: "2026-10-13",
    nowTime: "12:00",
  });
  assert.equal(past!.status, "error");
  assert.ok(past!.reasons.includes("過去の日時です"));
  assert.equal(earlierToday!.status, "error");
  assert.equal(laterToday!.status, "ok");
});

test("すでにある予約と重なる → エラー（相手のお名前を出す）", () => {
  const [j] = judgeText("10:00 佐藤 C2", [ex("2026-10-15", "10:15", "11:00", "山田")]);
  assert.equal(j!.status, "error");
  assert.deepEqual(j!.reasons, ["この時間には、すでに山田様の予約があります（10:15〜11:00）"]);
});

test("ちょうど終わる時刻から始まるのは重ならない", () => {
  const [j] = judgeText("10:00 佐藤 C2", [ex("2026-10-15", "09:30", "10:00", "山田")]);
  assert.equal(j!.status, "ok");
});

test("同じ予約がすでに登録済み（同じ日・同じ開始・同じお名前）→ エラー", () => {
  const [j] = judgeText("10:00 山田様 C2", [ex("2026-10-15", "10:00", "10:35", "山田 太郎")]);
  assert.equal(j!.status, "error");
  assert.deepEqual(j!.reasons, ["同じ予約がすでに登録されています（山田 太郎様 10:00〜10:35）"]);
});

test("同じ文字を 2 回貼り付けても、2 回目は全部エラー", () => {
  const first = drafts("10:00 山田 C2\n11:00 佐藤 C1");
  const existing = first.map((r) => ex(r.date, r.start, r.end, r.name));
  const judged = judgeText("10:00 山田 C2\n11:00 佐藤 C1", existing);
  assert.deepEqual(judged.map((j) => j.status), ["error", "error"]);
});

test("一覧の中で重なる → 両方エラー", () => {
  const judged = judgeText("10:00 山田 C2\n10:15 佐藤 C2");
  assert.deepEqual(judged.map((j) => j.status), ["error", "error"]);
  assert.equal(judged[0]!.reasons[0], "一覧の中の佐藤様（10:15〜10:50）と時間が重なっています");
});

test("一覧の中に同じ予約が 2 つ → 後ろの行だけエラー", () => {
  const judged = judgeText("10:00 山田 C2\n10:00 山田様 C2");
  assert.deepEqual(judged.map((j) => j.status), ["ok", "error"]);
  assert.deepEqual(judged[1]!.reasons, ["上にある山田様の行と同じ予約です。どちらかを消してください"]);
});

test("定休日 → 要確認", () => {
  const [j] = judgeText("10/19 10:00 山田 C2"); // 2026-10-19 は月曜
  assert.equal(j!.status, "check");
  assert.deepEqual(j!.reasons, ["お休みの日です（定休日）"]);
});

test("営業時間の外 → 要確認", () => {
  const judged = judgeText("9:00 山田 C2\n19:00 佐藤 C2"); // 2026-10-15 は木曜（9:30〜19:30）
  assert.deepEqual(judged.map((j) => j.status), ["check", "check"]);
  assert.deepEqual(judged[0]!.reasons, ["営業時間（9:30〜19:30）の外です"]);
});

test("似ている名前でメニューを選んだ → 要確認", () => {
  const [j] = judgeText("10:00 山田 カツト");
  assert.equal(j!.status, "check");
});

test("読めない記号 → 要確認（メニューが無ければエラー）", () => {
  const [onlyUnknown, withMenu] = judgeText("10:00 山田 C9\n11:00 佐藤 C2 C9");
  assert.equal(onlyUnknown!.status, "error");
  assert.ok(onlyUnknown!.reasons.includes("読めない記号がありました（C9）"));
  assert.equal(withMenu!.status, "check");
});

test("終了時刻が開始より前 → エラー", () => {
  const [row] = drafts("10:00 山田 C2");
  const [j] = judgeRows([{ ...row!, end: "09:45", endSource: "manual" }], ctx());
  assert.equal(j!.status, "error");
  assert.ok(j!.reasons.includes("終わりの時刻が、始まりの時刻より前になっています"));
});

// -----------------------------------------------------------------------------
// チェックの付け方
// -----------------------------------------------------------------------------

test("最初は OK だけチェックが付く", () => {
  const rows = drafts("10:00 山田 C2\n11:00 佐藤 カツト\n12:00 鈴木");
  const out = withJudgement(rows, judgeRows(rows, ctx()));
  assert.deepEqual(out.map((r) => [r.lastStatus, r.checked]), [
    ["ok", true],
    ["check", false],
    ["error", false],
  ]);
});

test("判定が同じなら、オーナー様が付けた・外したチェックはそのまま", () => {
  const rows = drafts("10:00 山田 C2\n11:00 佐藤 カツト");
  let cur = withJudgement(rows, judgeRows(rows, ctx()));
  cur = cur.map((r) => ({ ...r, checked: !r.checked })); // OK を外し、要確認に付ける
  cur = withJudgement(cur, judgeRows(cur, ctx()));
  assert.deepEqual(cur.map((r) => r.checked), [false, true]);
});

test("エラーになったらチェックは外れ、直って OK になったら付く", () => {
  const rows = drafts("10:00 山田 C2");
  let cur = withJudgement(rows, judgeRows(rows, ctx()));
  cur = cur.map((r) => ({ ...r, name: "" }));
  cur = withJudgement(cur, judgeRows(cur, ctx()));
  assert.deepEqual([cur[0]!.lastStatus, cur[0]!.checked], ["error", false]);
  cur = cur.map((r) => ({ ...r, name: "山田" }));
  cur = withJudgement(cur, judgeRows(cur, ctx()));
  assert.deepEqual([cur[0]!.lastStatus, cur[0]!.checked], ["ok", true]);
});
