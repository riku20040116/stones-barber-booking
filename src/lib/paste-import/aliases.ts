/**
 * オーナー様のメニューの「略し方」の対応表。
 *
 * ここに 1 行足すだけで、貼り付けた文字の中のその書き方がメニューとして読まれる。
 *   word: 紙に書かれる書き方（全角・半角、カタカナ・ひらがなの違いは気にしなくてよい）
 *   slug: メニュー（menus テーブルの slug。管理画面のメニュー一覧で確認できる）
 *   sure: true  … これで決まり。判定は「OK」になる
 *         false … たぶん合っているが確認してほしい。判定は「要確認」になる
 *
 * 予約表の記号（C1〜T1・+S など）と、メニューの正式名は自動で読めるので、ここには書かない。
 *
 * ⚠ 下の行は仮のもの。オーナー様の略し方が分かったら書き換える（sure も見直す）。
 */
export type MenuAlias = { word: string; slug: string; sure: boolean };

export const MENU_ALIASES: MenuAlias[] = [
  // 「カット」だけでは大人・学生・子どものどれか分からないので、大人にして確認してもらう
  { word: "カット", slug: "cut-adult", sure: false },
  { word: "顔剃り", slug: "opt-face-shave", sure: false },
  { word: "顔そり", slug: "opt-face-shave", sure: false },
  { word: "シェービング", slug: "opt-face-shave", sure: false },
  { word: "ヘッドスパ", slug: "course-headspa", sure: false },
  // 「フェイススパ」はオプションの正式名なので、ここでコースに割り当ててはいけない
  { word: "キング", slug: "course-king", sure: false },
  { word: "白髪染め", slug: "color-gray-blend", sure: false },
  { word: "縮毛", slug: "straighten-standard", sure: false },
];
