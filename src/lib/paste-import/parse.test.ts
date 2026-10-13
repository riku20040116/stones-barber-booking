/**
 * 貼り付けた文字の読み取りのテスト。`npm test` で動く。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePastedText, normalizeText, sameName } from "./parse.ts";
import { TEST_CATALOG } from "./test-fixtures.ts";
import type { ParseResult, ParsedRow } from "./types";

const TODAY = "2026-10-12";

function parse(text: string, baseDate = TODAY): ParseResult {
  return parsePastedText(text, { baseDate, today: TODAY, catalog: TEST_CATALOG });
}

/** 比べやすい形にする */
function brief(r: ParsedRow) {
  return {
    date: r.date,
    start: r.start,
    end: r.writtenEnd,
    name: r.name,
    menus: r.menus.map((h) => h.slug),
  };
}

// -----------------------------------------------------------------------------
// Google の AI の回答（2026-10 に実際の予約表の写真から作られた文字そのまま）
// -----------------------------------------------------------------------------

const AI_ANSWER = `画像に写っている予約表（STONE'S BARBER）の予約内容は以下の通りです。
火曜日（10月6日）
* 北村 様
   * コース：C2
   * 時間：12:15 〜 13:00
水曜日（10月7日）
* ユミダ 様
   * コース：C2
   * 時間：11:15 〜 12:00
* 中村 様
   * コース：C2
   * 時間：15:45 〜 16:30
金曜日（10月9日）
* タカハシ 様
   * コース：C4
   * 時間：14:00 〜 14:45
土曜日（10月10日）
* 田中 様
   * コース：C1
   * 時間：12:15 〜 13:15
日曜日（10月11日）
* 遠藤 様
   * コース：C4
   * 時間：15:45 〜 16:45
他の曜日（月曜日など）の確認や、特定の時間帯の空き状況の確認などが必要でしたらお知らせください。`;

test("Google の AI の回答から 6 件読める", () => {
  const res = parse(AI_ANSWER);
  assert.deepEqual(res.rows.map(brief), [
    { date: "2026-10-06", start: "12:15", end: "13:00", name: "北村", menus: ["cut-adult"] },
    { date: "2026-10-07", start: "11:15", end: "12:00", name: "ユミダ", menus: ["cut-adult"] },
    { date: "2026-10-07", start: "15:45", end: "16:30", name: "中村", menus: ["cut-adult"] },
    { date: "2026-10-09", start: "14:00", end: "14:45", name: "タカハシ", menus: ["cut-junior-high"] },
    { date: "2026-10-10", start: "12:15", end: "13:15", name: "田中", menus: ["cut-adult-shave"] },
    { date: "2026-10-11", start: "15:45", end: "16:45", name: "遠藤", menus: ["cut-junior-high"] },
  ]);
  // AI の回答は「予約表そのままの文字」ではない（日付と時刻を文字から読んでよい）
  assert.equal(res.sheetMode, false);
  // 前置きとしめくくりの文章は読み飛ばす
  assert.equal(res.ignoredLines.length, 2);
  assert.deepEqual(res.unreadLines, []);
  // 元の文字が残っている（確認画面で小さく見せる）
  assert.ok(res.rows[0]!.sourceLines.some((l) => l.includes("北村")));
  assert.ok(res.rows[0]!.menus.every((h) => h.sure));
});

// -----------------------------------------------------------------------------
// Google レンズで予約表をそのままコピーした文字
//   紙では「何曜日か」「何時からか」を枠の位置で表しているので、文字には残らない。
//   文字の中の日付（列の見出し）と時刻（印刷された目盛り）を、予約の日時にしてはいけない。
// -----------------------------------------------------------------------------

/** 2026-10-13 にオーナー様の Pixel でコピーした文字そのまま（レンズが「翻訳」になっていて C2→チェコ共和国 などに化けている） */
const LENS_TRANSLATED = `P

予約表 火~日 STONE'S BARBER

この週の火曜日

10月20日

取り込み日

予約が入ったら、上下の破線をなぞって四角で囲み、四角の中に名前・コースを書く / 取り消しは名前・コースの上から×をかぶせる(無効)

・記入

10月25日（日） - 休憩時間

9:00

9:30

(火)

10月2日(水)

時刻

名

9:30

10月22日(木)

10月3日(金) 休

10:00

ヒグマ

チェコ共和国

C2

10:00

11:00

ゴトウ

円周率

$1.30

12:00

12:38

12:00

12:20

13:00

サカグチ

22

13:00

13:30

14:00

ンゲモト

14:30

15:00

15:00

ワタナベ

15.

18:00

タナベ

02

18-20

17:00

17:00

ト 52

18:00

19:30

シベタ

C2

19:00`;

test("レンズの文字（実物）: 印刷された時刻・列の日付を、予約の日時にしない", () => {
  const res = parse(LENS_TRANSLATED, "2026-10-21");
  assert.equal(res.sheetMode, true);
  assert.ok(res.rows.length > 0);
  for (const r of res.rows) {
    assert.equal(r.start, "", `「${r.name}」に時刻が付いている`);
    assert.equal(r.date, "2026-10-21", `「${r.name}」の日付が文字から決まっている`);
    assert.equal(r.dateUnsure, true);
  }
  // お名前は候補として残る（時刻とメニューは確認画面で選ぶ）
  const names = res.rows.map((r) => r.name);
  for (const n of ["ヒグマ", "ゴトウ", "サカグチ", "ワタナベ", "タナベ", "シベタ"]) {
    assert.ok(names.includes(n), `${n} が候補に無い: ${names.join(",")}`);
  }
});

test("レンズの文字（翻訳なしの想定）: お名前とコースの組になる", () => {
  const res = parse(
    [
      "予約表 火~日 STONE'S BARBER", "この週の火曜日 2026 年 10 月 20 日", "取り込み日 月 日",
      "時刻", "A 10 月 20 日 (火) 休", "B 10 月 21 日 (水) 休", "名前 コース",
      "9:00", "9:30", "ヒグマ C2", "10:00", "トヨカワ", "C2", "11:00", "ゴトウ P1", "12:00",
      "サカグチ", "C2", "13:00", "14:00", "シゲモト C1", "19:00",
      "1 行 = 15 分 横線はすべて破線 営業 火〜金 9:30-19:30 / 土日祝 9:00-19:00",
    ].join("\n"),
    "2026-10-21",
  );
  assert.equal(res.sheetMode, true);
  assert.deepEqual(
    res.rows.map((r) => [r.date, r.start, r.name, r.menus[0]?.slug]),
    [
      ["2026-10-21", "", "ヒグマ", "cut-adult"],
      ["2026-10-21", "", "トヨカワ", "cut-adult"],
      ["2026-10-21", "", "ゴトウ", "perm-standard"],
      ["2026-10-21", "", "サカグチ", "cut-adult"],
      ["2026-10-21", "", "シゲモト", "cut-adult-shave"],
    ],
  );
});

// -----------------------------------------------------------------------------
// 手で打った文字
// -----------------------------------------------------------------------------

test("いろいろな時刻の書き方", () => {
  const res = parse(
    ["10:00 山田 C2", "10時半 佐藤様 C1", "14時30分 鈴木さん C3", "1600 田中 C4", "9時 高橋 C5"].join("\n"),
    "2026-10-15",
  );
  assert.deepEqual(
    res.rows.map((r) => [r.date, r.start, r.name]),
    [
      ["2026-10-15", "10:00", "山田"],
      ["2026-10-15", "10:30", "佐藤"],
      ["2026-10-15", "14:30", "鈴木"],
      ["2026-10-15", "16:00", "田中"],
      ["2026-10-15", "09:00", "高橋"],
    ],
  );
  assert.deepEqual(
    res.rows.map((r) => r.menus[0]?.slug),
    ["cut-adult", "cut-adult-shave", "cut-high-school", "cut-junior-high", "cut-child"],
  );
});

test("全角の文字も読める", () => {
  const res = parse("１０：００　山田　Ｃ２　０９０－１２３４－５６７８", "2026-10-15");
  assert.deepEqual(brief(res.rows[0]!), {
    date: "2026-10-15", start: "10:00", end: "", name: "山田", menus: ["cut-adult"],
  });
  assert.equal(res.rows[0]!.phone, "090-1234-5678");
});

test("時間の範囲の書き方（〜 - から）", () => {
  const res = parse(
    ["10:00〜10:45 山田 C2", "11:00 - 11:45 佐藤 C2", "13時から14時 鈴木 C2", "15:00～15:30 田中 C2"].join("\n"),
    "2026-10-15",
  );
  assert.deepEqual(
    res.rows.map((r) => [r.start, r.writtenEnd]),
    [["10:00", "10:45"], ["11:00", "11:45"], ["13:00", "14:00"], ["15:00", "15:30"]],
  );
});

test("料金の 1000 円や年の 2025 年は時刻にしない", () => {
  const res = parse("山田 C2 1000円\n2025年メモ", "2026-10-15");
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0]!.start, "");
});

test("電話番号（ハイフンあり・なし）", () => {
  const res = parse(["10:00 山田 C2 090-1234-5678", "11:00 佐藤 C1 09012345678"].join("\n"), "2026-10-15");
  assert.deepEqual(res.rows.map((r) => r.phone), ["090-1234-5678", "09012345678"]);
  assert.deepEqual(res.rows.map((r) => r.name), ["山田", "佐藤"]);
});

test("様・さん・さま を外す", () => {
  const res = parse(["10:00 山田様 C2", "11:00 佐藤 さん C2", "12:00 鈴木さま C2"].join("\n"), "2026-10-15");
  assert.deepEqual(res.rows.map((r) => r.name), ["山田", "佐藤", "鈴木"]);
});

// -----------------------------------------------------------------------------
// 日付
// -----------------------------------------------------------------------------

test("日付の行があれば、そこから下はその日付", () => {
  const res = parse(
    ["10:00 前田 C2", "10/15", "10:00 山田 C2", "11:00 佐藤 C1", "10月16日(金)", "9:30 鈴木 C3"].join("\n"),
    "2026-10-14",
  );
  assert.deepEqual(
    res.rows.map((r) => [r.date, r.name]),
    [
      ["2026-10-14", "前田"],
      ["2026-10-15", "山田"],
      ["2026-10-15", "佐藤"],
      ["2026-10-16", "鈴木"],
    ],
  );
});

test("同じ行に日付があってもよい", () => {
  const res = parse("10/20 10:00 山田 C2\n10月21日 11:00 佐藤 C2");
  assert.deepEqual(res.rows.map((r) => r.date), ["2026-10-20", "2026-10-21"]);
});

test("年が無いときは今年。2 か月以上前になるなら来年", () => {
  // 今日は 2026-10-12
  const res = parse(["1/5 10:00 山田 C2", "8/20 10:00 佐藤 C2", "8/1 10:00 鈴木 C2", "2027年3月3日 10:00 田中 C2"].join("\n"));
  assert.deepEqual(res.rows.map((r) => r.date), ["2027-01-05", "2026-08-20", "2027-08-01", "2027-03-03"]);
});

test("ありえない日付は日付にしない", () => {
  const res = parse("2/30 10:00 山田 C2", "2026-10-15");
  assert.equal(res.rows[0]!.date, "2026-10-15");
});

// -----------------------------------------------------------------------------
// メニュー
// -----------------------------------------------------------------------------

test("記号とオプション（C2+S・C2S・K1+H+E・+剃）", () => {
  const res = parse(
    ["10:00 山田 C2+S", "11:00 佐藤 C2S", "12:00 鈴木 K1+H+E", "13:00 田中 C2+SF", "14:00 高橋 C2+剃"].join("\n"),
    "2026-10-15",
  );
  assert.deepEqual(res.rows.map((r) => r.menus.map((h) => h.slug)), [
    ["cut-adult", "opt-face-shave"],
    ["cut-adult", "opt-face-shave"],
    ["color-standard", "opt-scalp-spa", "opt-ear-wash"],
    ["cut-adult", "opt-skin-fade"],
    ["cut-adult", "opt-face-shave"],
  ]);
  assert.deepEqual(res.rows.map((r) => r.name), ["山田", "佐藤", "鈴木", "田中", "高橋"]);
});

test("メニューの正式名でも読める", () => {
  const res = parse("10:00 山田 縮毛矯正\n12:00 佐藤 キングコース", "2026-10-15");
  assert.deepEqual(res.rows.map((r) => r.menus.map((h) => [h.slug, h.sure])), [
    [["straighten-standard", true]],
    [["course-king", true]],
  ]);
  assert.deepEqual(res.rows.map((r) => r.name), ["山田", "佐藤"]);
});

test("似ている書き方（カツト→カット、Cl→C1）は「確認してほしい」印つき", () => {
  const res = parse("10:00 山田 カツト\n11:00 佐藤 Cl", "2026-10-15");
  assert.deepEqual(res.rows.map((r) => r.menus.map((h) => [h.slug, h.via, h.sure])), [
    [["cut-adult", "fuzzy", false]],
    [["cut-adult-shave", "fuzzy", false]],
  ]);
  assert.deepEqual(res.rows.map((r) => r.name), ["山田", "佐藤"]);
});

test("略し方の表の言葉は「確認してほしい」印つき", () => {
  const res = parse("10:00 山田 カット", "2026-10-15");
  assert.deepEqual(res.rows[0]!.menus.map((h) => [h.slug, h.via, h.sure]), [["cut-adult", "word", false]]);
});

test("少し違う名前（キングコーズ）も近いメニューを候補にする", () => {
  const res = parse("10:00 山田 キングコーズ", "2026-10-15");
  assert.deepEqual(res.rows[0]!.menus.map((h) => [h.slug, h.sure]), [["course-king", false]]);
  assert.equal(res.rows[0]!.name, "山田");
});

test("読めない記号（C9）は記録しておく", () => {
  const res = parse("10:00 山田 C9", "2026-10-15");
  assert.equal(res.rows.length, 1);
  assert.deepEqual(res.rows[0]!.menus, []);
  assert.deepEqual(res.rows[0]!.unknownCodes, ["C9"]);
  assert.equal(res.rows[0]!.name, "山田");
});

// -----------------------------------------------------------------------------
// 行のまとめ方（レンズの文字は 1 件が何行にも分かれる）
// -----------------------------------------------------------------------------

test("名前が先・時刻があとの並び", () => {
  const res = parse(["北村", "C2", "12:15~13:00", "ヨシダ", "C2", "11:15~12:00"].join("\n"), "2026-10-15");
  assert.deepEqual(res.rows.map(brief), [
    { date: "2026-10-15", start: "12:15", end: "13:00", name: "北村", menus: ["cut-adult"] },
    { date: "2026-10-15", start: "11:15", end: "12:00", name: "ヨシダ", menus: ["cut-adult"] },
  ]);
});

test("時刻が先・名前があとの並び", () => {
  const res = parse(["12:15~13:00", "北村 C2", "15:45~16:30", "中村 C2"].join("\n"), "2026-10-15");
  assert.deepEqual(res.rows.map((r) => [r.start, r.name]), [["12:15", "北村"], ["15:45", "中村"]]);
});

test("ラベルつきの行（お名前：・メモ：・電話：）", () => {
  const res = parse(
    ["時間：10:00〜10:45", "お名前：山田 太郎 様", "メニュー：C2", "電話：090-1111-2222", "メモ：初めての方"].join("\n"),
    "2026-10-15",
  );
  assert.equal(res.rows.length, 1);
  const r = res.rows[0]!;
  assert.equal(r.name, "山田 太郎");
  assert.equal(r.phone, "090-1111-2222");
  assert.equal(r.notes, "初めての方");
  assert.deepEqual(r.menus.map((h) => h.slug), ["cut-adult"]);
});

test("1 行に 2 件あっても分ける", () => {
  const res = parse("10:00 山田 C2 11:00 佐藤 C1", "2026-10-15");
  assert.deepEqual(res.rows.map((r) => [r.start, r.name, r.menus[0]?.slug]), [
    ["10:00", "山田", "cut-adult"],
    ["11:00", "佐藤", "cut-adult-shave"],
  ]);
});

test("時刻だけの行は、印刷された目盛りとみなして予約の時刻にしない", () => {
  const res = parse(["10:00", "山田 C2"].join("\n"), "2026-10-15");
  assert.deepEqual(res.rows.map((r) => [r.start, r.name]), [["", "山田"]]);
  assert.deepEqual(res.ignoredLines, ["10:00"]);
  assert.equal(res.sheetMode, false);
});

test("見出しつきの時刻・範囲の時刻は、人が書いたものとして使う", () => {
  const res = parse(["時間：10:00", "山田 C2", "11:00〜11:45", "佐藤 C2"].join("\n"), "2026-10-15");
  assert.deepEqual(res.rows.map((r) => [r.start, r.name]), [["10:00", "山田"], ["11:00", "佐藤"]]);
});

test("時刻だけの行が 3 行以上あれば予約表の文字とみなし、同じ行の時刻も使わない", () => {
  const res = parse(["9:00", "9:15", "9:30", "9:45", "10:00 山田 C2"].join("\n"), "2026-10-15");
  assert.equal(res.sheetMode, true);
  assert.deepEqual(res.rows.map((r) => [r.start, r.name, r.dateUnsure]), [["", "山田", true]]);
  assert.equal(res.ignoredLines.length, 4);
});

test("予約表に印刷された説明の行は予約にしない", () => {
  const res = parse(
    [
      "予約表 火〜日 STONE'S BARBER この週の火曜日 年 月 日 取り込み日 月 日 ← 取り込んだら記入",
      "月 日 (火) 休",
      "名前 コース",
      "A",
      "12:15~13:00",
      "北村 C2",
      "1 行 = 15 分 横線はすべて破線(なぞった線だけが実線) 営業 火〜金 9:30-19:30 / 土日祝 9:00-19:00 定休 月曜・第3火曜",
    ].join("\n"),
    "2026-10-15",
  );
  assert.deepEqual(res.rows.map((r) => [r.start, r.name]), [["12:15", "北村"]]);
});

test("読めない行は「読み取れなかった行」に回す", () => {
  const res = parse(["###", "10:00 山田 C2", "佐藤"].join("\n"), "2026-10-15");
  assert.equal(res.rows.length, 1);
  assert.deepEqual(res.unreadLines, ["###", "佐藤"]);
});

test("時刻が無くてもメニューがあれば候補にする（確認画面で時刻を入れる）", () => {
  const res = parse("山田 C2", "2026-10-15");
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0]!.start, "");
});

test("空の文字", () => {
  const res = parse("  \n\n ");
  assert.deepEqual(res, { rows: [], unreadLines: [], ignoredLines: [], sheetMode: false });
});

// -----------------------------------------------------------------------------
// 小さな部品
// -----------------------------------------------------------------------------

test("normalizeText", () => {
  assert.equal(normalizeText("１０：００〜１１：００"), "10:00~11:00");
});

test("sameName（様・カタカナの小さい字・姓だけ）", () => {
  assert.ok(sameName("山田様", "山田"));
  assert.ok(sameName("山田", "山田 太郎"));
  assert.ok(sameName("ヨッシー", "ヨツシー"));
  assert.ok(!sameName("山田", "佐藤"));
  assert.ok(!sameName("", "佐藤"));
});
