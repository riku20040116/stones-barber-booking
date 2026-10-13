/**
 * 確認画面の行を判定する（OK・要確認・エラー）。
 * 画面（直すたびにその場で）とサーバー（登録の直前にもう一度）の両方で同じ処理を使う。
 *
 * | 判定   | こんなとき                                                        | チェック |
 * | OK     | 問題なし                                                          | 最初から ON |
 * | 要確認 | メニューを似ている名前で選んだ／営業時間外／お休みの日            | 最初は OFF（自分で ON にできる） |
 * | エラー | 時刻・お名前・メニューがない／過去／すでにある予約や一覧の中で重なる／同じ予約が登録済み | ON にできない |
 */
import { sameName } from "./parse.ts";
import { toMinutes } from "./draft.ts";
import type { DayHours, DraftRow, ExistingReservation, Judged, JudgeStatus } from "./types";

export type JudgeContext = {
  /** 今の日本時間 */
  nowDate: string;
  nowTime: string;
  /** その日の営業時間（定休日・臨時休業を含む。calendar.ts の effectiveDayCalendar を渡す） */
  dayHours: (date: string) => DayHours;
  /** すでに入っている有効な予約（確定・仮予約） */
  existing: ExistingReservation[];
};

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

function displayTime(t: string): string {
  return t.replace(/^0(\d)/, "$1");
}

function who(name: string): string {
  return name.trim() ? `${name.trim()}様` : "（お名前なし）";
}

export function judgeRows(rows: DraftRow[], ctx: JudgeContext): Judged[] {
  return rows.map((row, idx) => {
    const errors: string[] = [];
    const checks: string[] = [];

    if (!row.date) errors.push("日付がありません");
    if (!row.start) errors.push("時刻がありません");
    if (!row.name.trim()) errors.push("お名前がありません");
    if (!row.mainSlug && row.optionSlugs.length === 0) errors.push("メニューがありません");
    if (row.start && !row.end) errors.push("終わりの時刻が決まりません。メニューを選んでください");
    if (row.start && row.end && toMinutes(row.end) <= toMinutes(row.start)) {
      errors.push("終わりの時刻が、始まりの時刻より前になっています");
    }
    if (
      row.date &&
      row.start &&
      (row.date < ctx.nowDate || (row.date === ctx.nowDate && row.start <= ctx.nowTime))
    ) {
      errors.push("過去の日時です");
    }

    const timeOk =
      Boolean(row.date && row.start && row.end) && toMinutes(row.end) > toMinutes(row.start);

    if (timeOk) {
      // すでに登録されている予約
      for (const ex of ctx.existing) {
        if (ex.date !== row.date) continue;
        if (ex.start === row.start && sameName(row.name, ex.name)) {
          errors.push(
            `同じ予約がすでに登録されています（${who(ex.name)} ${displayTime(ex.start)}〜${displayTime(ex.end)}）`,
          );
          continue;
        }
        if (overlaps(row.start, row.end, ex.start, ex.end)) {
          errors.push(
            `この時間には、すでに${who(ex.name)}の予約があります（${displayTime(ex.start)}〜${displayTime(ex.end)}）`,
          );
        }
      }
      // 一覧の中
      rows.forEach((other, j) => {
        if (j === idx || other.date !== row.date || !other.start || !other.end) return;
        if (toMinutes(other.end) <= toMinutes(other.start)) return;
        if (other.start === row.start && sameName(row.name, other.name)) {
          // 同じ予約が 2 回ある → 後ろの行だけエラーにする（前の行は登録できる）
          if (j < idx) errors.push(`上にある${who(other.name)}の行と同じ予約です。どちらかを消してください`);
          return;
        }
        if (overlaps(row.start, row.end, other.start, other.end)) {
          errors.push(
            `一覧の中の${who(other.name)}（${displayTime(other.start)}〜${displayTime(other.end)}）と時間が重なっています`,
          );
        }
      });
    }

    // ここから要確認
    if (row.dateNotice) checks.push(row.dateNotice);
    if (row.menuNotice) checks.push(row.menuNotice);
    if (row.unknownCodes.length > 0) {
      checks.push(`読めない記号がありました（${row.unknownCodes.join("・")}）`);
    }
    if (row.date) {
      const h = ctx.dayHours(row.date);
      if (!h.isOpen) {
        checks.push(`お休みの日です（${h.reason}）`);
      } else if (row.start && row.end && (row.start < h.open || row.end > h.close)) {
        checks.push(`営業時間（${displayTime(h.open)}〜${displayTime(h.close)}）の外です`);
      }
    }

    const status: JudgeStatus = errors.length > 0 ? "error" : checks.length > 0 ? "check" : "ok";
    return { status, reasons: [...errors, ...checks], errorCount: errors.length };
  });
}

/**
 * 判定に合わせてチェックを付け直す。
 *   - エラー → 外す（付けられない）
 *   - 判定が変わった → OK なら付ける・要確認なら外す
 *   - 判定が同じ → オーナー様が付けた・外したままにする
 */
export function withJudgement(rows: DraftRow[], judged: Judged[]): DraftRow[] {
  return rows.map((r, i) => {
    const status = judged[i]!.status;
    let checked = r.checked;
    if (status === "error") checked = false;
    else if (status !== r.lastStatus) checked = status === "ok";
    return { ...r, checked, lastStatus: status };
  });
}
