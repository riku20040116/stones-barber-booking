/**
 * 表示用フォーマッタ。
 * 通貨・日付・時刻は Asia/Tokyo / ja-JP で統一する。
 */
export function formatYen(value: number): string {
  return `${value.toLocaleString("ja-JP")}円`;
}

export function formatPhoneForLink(phone: string): string {
  return `tel:+81${phone.replace(/^0/, "")}`;
}
