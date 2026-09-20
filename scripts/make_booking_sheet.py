"""STONE'S BARBER 手書き予約表（AI 読み取り向け）を PDF で作る。

元の市販の予約表（8:00-20:30 / 30分刻み / 6日分）を、
この予約システムに合わせて作り直したもの。

AI（画像から文字を読む）に向けた工夫:
  - 四隅に黒い基準マーク（フィデューシャル）。写真の傾き補正と切り出しに使う。
  - 列は A〜F の記号つき。行は 15 分刻みで、時刻を左右両端に印字。
  - 1 時間ごとに太い罫線と太字の時刻 → 行の数え間違いを防ぐ。
  - 15 分の罫線は薄いグレー。黒のペン書きが浮いて見える。
  - メニューは記号（C2 など）で書けるよう凡例を同じ紙に印刷。
    漢字の手書きより記号のほうが桁違いに正しく読める。
  - 日付は「月・日・曜」をマス目に分けて書かせる。
  - 2 ページ目は新規のお客様の連絡先メモ。

使い方:
    python scripts/make_booking_sheet.py [出力先.pdf]
"""
from __future__ import annotations

import sys

from reportlab.lib.colors import Color, black, white
from reportlab.lib.pagesizes import A3
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
pdfmetrics.registerFont(UnicodeCIDFont("HeiseiMin-W3"))
JP = "HeiseiKakuGo-W5"
JP_MIN = "HeiseiMin-W3"

PAGE_W, PAGE_H = A3  # 縦: 297 x 420 mm

# --- 版面 -------------------------------------------------------------------
MARGIN = 10 * mm
FIDUCIAL = 7 * mm          # 四隅マークの一辺
HEADER_H = 67 * mm         # タイトル＋凡例
FOOTER_H = 7 * mm

TIME_COL_W = 16 * mm       # 左右の時刻列
DAY_COLS = 6
COL_LABELS = ["A", "B", "C", "D", "E", "F"]

# --- 時間軸 -----------------------------------------------------------------
# 1 行 = 30 分。行の真ん中に点線を入れて 15 分の位置も書けるようにしている。
#   ・30 分行だと 1 行 15mm 取れるので手書きが崩れにくく、AI も読みやすい
#   ・行数が 21 本なので、写真から行を数え間違える事故が起きにくい
#   ・システム側の枠は 15 分刻みなので、9:45 開始などは点線の下半分に書く
START_MIN = 9 * 60         # 09:00（土日祝の開店）
END_MIN = 19 * 60 + 30     # 19:30（平日の閉店）
STEP = 30
SUB_STEP = 15
ROWS = (END_MIN - START_MIN) // STEP      # 21 行

# --- 色 ---------------------------------------------------------------------
GRID_LIGHT = Color(0.72, 0.72, 0.74)      # 15分の細罫
GRID_HOUR = Color(0.10, 0.10, 0.12)       # 1時間ごとの太罫
GRID_FRAME = black
HEAD_FILL = Color(0.93, 0.93, 0.94)
NOON_FILL = Color(0.965, 0.965, 0.975)    # 昼帯のうっすら網掛け

# --- メニュー記号 -----------------------------------------------------------
# 料金は 2026-09 改定後。システムの menus テーブルと対応させている。
MENU_CODES: list[tuple[str, str, str]] = [
    ("C1", "カット・シャンプー・顔剃り", "4,800"),
    ("C2", "カット・シャンプー", "3,800"),
    ("C3", "カット（高校生）", "3,300"),
    ("C4", "カット（中学生）", "3,000"),
    ("C5", "カット（小学生以下）", "2,700"),
    ("S1", "ヘッドスパコース", "5,800"),
    ("S2", "フェイススパコース", "5,800"),
    ("S3", "キングコース", "6,800"),
    ("K1", "カラー", "7,500〜"),
    ("K2", "ブリーチ", "9,000〜"),
    ("K3", "メッシュ", "9,500〜"),
    ("K4", "白髪ぼかし", "6,000"),
    ("P1", "パーマ", "9,000〜"),
    ("P2", "スパイラル", "9,300〜"),
    ("P3", "ツイストスパイラル", "9,500〜"),
    ("P4", "濡れパン", "9,000〜"),
    ("P5", "ツイスト", "11,700〜"),
    ("T1", "縮毛矯正", "9,500〜"),
]

OPTION_CODES: list[tuple[str, str]] = [
    ("+剃", "お顔剃り 1,000"),
    ("+頭", "頭皮スパ 700"),
    ("+顔", "フェイススパ 600"),
    ("+パ", "フェイスパック 300"),
    ("+角", "角質落とし 200"),
    ("+耳", "耳洗い 400"),
    ("+鼻", "鼻脱毛 400"),
    ("+眉", "眉毛剃 300"),
    ("+線", "デザインライン 200〜"),
    ("+フ", "スキンフェード 500"),
]


def hhmm(total_min: int) -> str:
    return f"{total_min // 60}:{total_min % 60:02d}"


def draw_fiducials(c: canvas.Canvas) -> None:
    """四隅の基準マーク。写真の傾き補正・切り出しの目印になる。

    左上だけ内側に小さな白抜きを入れて向きが分かるようにしている
    （4 つとも同じ形だと上下逆でも成立してしまうため）。
    """
    s = FIDUCIAL
    m = 6 * mm
    corners = [
        (m, PAGE_H - m - s),          # 左上
        (PAGE_W - m - s, PAGE_H - m - s),
        (m, m),
        (PAGE_W - m - s, m),
    ]
    c.setFillColor(black)
    for x, y in corners:
        c.rect(x, y, s, s, stroke=0, fill=1)
    # 左上だけ白い切り欠き
    x, y = corners[0]
    c.setFillColor(white)
    c.rect(x + s * 0.55, y + s * 0.55, s * 0.3, s * 0.3, stroke=0, fill=1)
    c.setFillColor(black)


def draw_header(c: canvas.Canvas) -> None:
    top = PAGE_H - MARGIN
    left = MARGIN

    c.setFillColor(black)
    c.setFont(JP, 20)
    c.drawString(left + 2 * mm, top - 8 * mm, "予約表")

    c.setFont(JP, 8.5)
    c.drawString(left + 32 * mm, top - 8 * mm, "STONE'S BARBER")

    # 週の記入欄
    c.setFont(JP, 9)
    c.drawString(left + 2 * mm, top - 15.5 * mm, "この用紙の週：")
    bx = left + 26 * mm
    by = top - 18 * mm
    for label, w in (("年", 14 * mm), ("月", 10 * mm), ("日", 10 * mm)):
        c.setStrokeColor(black)
        c.setLineWidth(0.8)
        c.rect(bx, by, w, 6.5 * mm, stroke=1, fill=0)
        c.setFont(JP, 8)
        c.drawString(bx + w + 1 * mm, by + 1.8 * mm, label)
        bx += w + 5 * mm
    c.setFont(JP, 7.5)
    c.setFillColor(Color(0.35, 0.35, 0.38))
    c.drawString(bx + 2 * mm, by + 1.8 * mm, "週の最初の日（A列の日付）を書いてください")
    c.setFillColor(black)

    # --- 凡例（メニュー記号）------------------------------------------------
    lx = left + 2 * mm
    ly = top - 24 * mm
    c.setFont(JP, 8.5)
    c.drawString(lx, ly, "■ メニューは記号で書いてください")
    c.setFont(JP, 7)
    c.setFillColor(Color(0.35, 0.35, 0.38))
    c.drawString(lx + 52 * mm, ly, "例）  田中 C2+剃    ／    佐藤 K1")
    c.setFillColor(black)

    # 3 列 × 6 行でメニュー記号を並べる
    usable = (PAGE_W - 2 * MARGIN) - 4 * mm
    col_w = usable / 3
    row_h = 4.4 * mm
    per_col = 6
    for i, (code, name, price) in enumerate(MENU_CODES):
        col = i // per_col
        row = i % per_col
        x = lx + col * col_w
        y = ly - 4.8 * mm - row * row_h
        c.setFont(JP, 7.5)
        c.drawString(x, y, code)
        c.setFont(JP, 7)
        c.drawString(x + 7 * mm, y, name)
        c.setFillColor(Color(0.4, 0.4, 0.43))
        c.drawRightString(x + col_w - 8 * mm, y, price)
        c.setFillColor(black)

    # オプション（幅に収まるよう折り返す）
    oy = ly - 4.8 * mm - per_col * row_h - 3.5 * mm
    c.setFont(JP, 7.5)
    c.drawString(lx, oy, "オプション")
    c.setFont(JP, 7)
    ox = lx + 18 * mm
    limit = PAGE_W - MARGIN - 4 * mm
    for code, name in OPTION_CODES:
        text = f"{code} {name}"
        w = pdfmetrics.stringWidth(text, JP, 7)
        if ox + w > limit:
            oy -= 4.2 * mm
            ox = lx + 18 * mm
        c.drawString(ox, oy, text)
        ox += w + 5 * mm

    # ヘッダーと表の区切り
    c.setStrokeColor(Color(0.6, 0.6, 0.63))
    c.setLineWidth(0.6)
    y_sep = PAGE_H - MARGIN - HEADER_H + 2 * mm
    c.line(MARGIN, y_sep, PAGE_W - MARGIN, y_sep)


def draw_grid(c: canvas.Canvas) -> None:
    grid_top = PAGE_H - MARGIN - HEADER_H
    grid_bottom = MARGIN + FOOTER_H
    head_h = 13 * mm
    body_top = grid_top - head_h
    body_h = body_top - grid_bottom
    row_h = body_h / ROWS

    left = MARGIN
    right = PAGE_W - MARGIN
    day_w = (right - left - TIME_COL_W * 2) / DAY_COLS

    def col_x(i: int) -> float:
        return left + TIME_COL_W + i * day_w

    # --- 昼帯の網掛け（11:00-15:00）---------------------------------------
    c.setFillColor(NOON_FILL)
    for r in range(ROWS):
        t = START_MIN + r * STEP
        if 11 * 60 <= t < 15 * 60:
            y = body_top - (r + 1) * row_h
            c.rect(col_x(0), y, day_w * DAY_COLS, row_h, stroke=0, fill=1)
    c.setFillColor(black)

    # --- 見出し行 -----------------------------------------------------------
    c.setFillColor(HEAD_FILL)
    c.rect(left, body_top, right - left, head_h, stroke=0, fill=1)
    c.setFillColor(black)

    c.setFont(JP, 7.5)
    for x in (left, right - TIME_COL_W):
        c.drawCentredString(x + TIME_COL_W / 2, body_top + head_h - 5 * mm, "時刻")

    for i in range(DAY_COLS):
        x = col_x(i)
        cx = x + day_w / 2
        # 列記号
        c.setFont(JP, 8)
        c.setFillColor(Color(0.35, 0.35, 0.38))
        c.drawString(x + 1.5 * mm, body_top + head_h - 4.2 * mm, COL_LABELS[i])
        c.setFillColor(black)
        # 日付記入欄  月 [  ] 日 [  ] （ ）
        c.setFont(JP, 7.5)
        by = body_top + head_h - 8.6 * mm
        bw = 8.5 * mm
        bh = 5.6 * mm
        x1 = cx - 17 * mm
        c.setStrokeColor(Color(0.45, 0.45, 0.48))
        c.setLineWidth(0.6)
        c.rect(x1, by, bw, bh, stroke=1, fill=0)
        c.drawString(x1 + bw + 0.8 * mm, by + 1.6 * mm, "月")
        x2 = x1 + bw + 4.6 * mm
        c.rect(x2, by, bw, bh, stroke=1, fill=0)
        c.drawString(x2 + bw + 0.8 * mm, by + 1.6 * mm, "日")
        x3 = x2 + bw + 4.6 * mm
        c.rect(x3, by, 7 * mm, bh, stroke=1, fill=0)
        # 定休チェック
        c.setFont(JP, 6.5)
        cbx = cx + 12.5 * mm
        c.rect(cbx, by + 0.6 * mm, 3.2 * mm, 3.2 * mm, stroke=1, fill=0)
        c.drawString(cbx + 4 * mm, by + 1.3 * mm, "休")

    # --- 行 -----------------------------------------------------------------
    # 30 分ごとの実線（毎正時は太く）
    for r in range(ROWS + 1):
        y = body_top - r * row_h
        t = START_MIN + r * STEP
        is_hour = (t % 60) == 0
        c.setStrokeColor(GRID_HOUR if is_hour else GRID_LIGHT)
        c.setLineWidth(1.0 if is_hour else 0.45)
        c.line(left, y, right, y)

    # 15 分の位置に点線（日付列の中だけ。時刻列には引かない）
    c.setDash(1.2, 2.2)
    c.setStrokeColor(Color(0.82, 0.82, 0.84))
    c.setLineWidth(0.3)
    for r in range(ROWS):
        y = body_top - r * row_h - row_h / 2
        c.line(col_x(0), y, col_x(DAY_COLS), y)
    c.setDash()

    # 時刻ラベル（左右両端）
    for r in range(ROWS):
        t = START_MIN + r * STEP
        y_top = body_top - r * row_h
        is_hour = (t % 60) == 0
        # 30 分の主ラベル
        c.setFillColor(black if is_hour else Color(0.3, 0.3, 0.33))
        c.setFont(JP, 9.5 if is_hour else 8)
        ty = y_top - row_h / 4 - 1.4 * mm
        c.drawCentredString(left + TIME_COL_W / 2, ty, hhmm(t))
        c.drawCentredString(right - TIME_COL_W / 2, ty, hhmm(t))
        # 15 分の副ラベル（点線の高さに小さく）
        c.setFillColor(Color(0.58, 0.58, 0.62))
        c.setFont(JP, 6.2)
        sy = y_top - row_h * 3 / 4 - 1.1 * mm
        c.drawCentredString(left + TIME_COL_W / 2, sy, hhmm(t + SUB_STEP))
        c.drawCentredString(right - TIME_COL_W / 2, sy, hhmm(t + SUB_STEP))
    c.setFillColor(black)

    # --- 縦罫 ---------------------------------------------------------------
    for i in range(DAY_COLS + 1):
        x = col_x(i)
        c.setStrokeColor(GRID_HOUR)
        c.setLineWidth(0.8)
        c.line(x, grid_bottom, x, grid_top)
    for x in (left, right):
        c.setStrokeColor(GRID_FRAME)
        c.setLineWidth(1.2)
        c.line(x, grid_bottom, x, grid_top)

    # 外枠と見出しの下線
    c.setStrokeColor(GRID_FRAME)
    c.setLineWidth(1.2)
    c.rect(left, grid_bottom, right - left, grid_top - grid_bottom, stroke=1, fill=0)
    c.setLineWidth(1.0)
    c.line(left, body_top, right, body_top)

    # --- 営業時間の注記 -----------------------------------------------------
    c.setFont(JP, 6.8)
    c.setFillColor(Color(0.4, 0.4, 0.43))
    c.drawString(
        left + 1 * mm,
        grid_bottom - 4.6 * mm,
        "営業時間  火〜金 9:30-19:30 ／ 土日祝 9:00-19:00　"
        "定休日 毎週月曜・第3火曜　"
        "点線は15分の位置（例 9:15 開始は点線の下半分に書く）　"
        "薄い網掛けは昼休みを取る時間帯（11:00-15:00）",
    )
    c.drawRightString(right, grid_bottom - 4.6 * mm, "1 / 2")
    c.setFillColor(black)


def draw_contacts_page(c: canvas.Canvas) -> None:
    """2 ページ目: 書き方の説明と、新規のお客様の連絡先メモ。"""
    draw_fiducials(c)
    top = PAGE_H - MARGIN
    left = MARGIN
    right = PAGE_W - MARGIN

    c.setFillColor(black)
    c.setFont(JP, 16)
    c.drawString(left + 2 * mm, top - 7 * mm, "書き方とお客様メモ")

    # --- 書き方 -------------------------------------------------------------
    y = top - 18 * mm
    c.setFont(JP, 10)
    c.drawString(left + 2 * mm, y, "■ 書き方")
    lines = [
        "1. 上の日付欄に「月」「日」「曜」を書きます。お休みの日は「休」の四角に印を入れてください。",
        "2. 予約が入ったら、その時刻の行に「お名前　メニュー記号」を書きます。",
        "3. 1 行は 30 分です。行の真ん中の点線より下に書くと「15 分・45 分開始」の意味になります。",
        "4. 施術が次の行にまたがる場合は、終わる時刻まで縦線を引いてください。",
        "5. 名前は姓だけで構いません。読みやすい大きさで、枠からはみ出さないように書いてください。",
        "6. 変更や取り消しは、二重線で消して横に書き直してください（塗りつぶさないでください）。",
        "7. 新規のお客様は、下の「お客様メモ」に番号・お名前・お電話番号を書いてください。",
        "   予約表のマスには「田中 C2 ①」のように番号を添えると結びつけられます。",
    ]
    c.setFont(JP, 8.5)
    for i, s in enumerate(lines):
        c.drawString(left + 6 * mm, y - 6 * mm - i * 5.2 * mm, s)

    # --- 記入例（本物の表と同じ形で見せる）----------------------------------
    ey = y - 6 * mm - len(lines) * 5.2 * mm - 8 * mm
    c.setFont(JP, 10)
    c.drawString(left + 2 * mm, ey, "■ 記入例")

    ex = left + 6 * mm
    tw, cw = 16 * mm, 52 * mm     # 時刻列 / 記入列
    rh_ex = 11 * mm
    samples = [
        ("10:00", "田中 C2", None, "10:00〜10:45（カット・シャンプー）"),
        ("10:30", "｜", None, "　次の行にまたがるので縦線を引く"),
        ("11:00", None, "佐藤 K1+剃 ①", "点線の下 = 11:15 開始。新規なので ① を添える"),
    ]
    top_ex = ey - 5 * mm
    for i, (t, upper, lower, memo) in enumerate(samples):
        yy = top_ex - (i + 1) * rh_ex
        c.setStrokeColor(GRID_HOUR)
        c.setLineWidth(0.7)
        c.rect(ex, yy, tw, rh_ex, stroke=1, fill=0)
        c.rect(ex + tw, yy, cw, rh_ex, stroke=1, fill=0)
        # 15 分の点線
        c.setDash(1.2, 2.2)
        c.setStrokeColor(Color(0.78, 0.78, 0.8))
        c.setLineWidth(0.3)
        c.line(ex + tw, yy + rh_ex / 2, ex + tw + cw, yy + rh_ex / 2)
        c.setDash()
        # 時刻
        c.setFillColor(black)
        c.setFont(JP, 8.5)
        c.drawCentredString(ex + tw / 2, yy + rh_ex * 0.62, t)
        c.setFillColor(Color(0.58, 0.58, 0.62))
        c.setFont(JP, 6.2)
        mm_ = int(t[:2]) * 60 + int(t[3:]) + 15
        c.drawCentredString(ex + tw / 2, yy + rh_ex * 0.17, hhmm(mm_))
        # 手書きに見立てた記入
        c.setFillColor(black)
        c.setFont(JP_MIN, 10)
        if upper:
            c.drawString(ex + tw + 3 * mm, yy + rh_ex * 0.62, upper)
        if lower:
            c.drawString(ex + tw + 3 * mm, yy + rh_ex * 0.16, lower)
        # 説明
        c.setFont(JP, 7.5)
        c.setFillColor(Color(0.4, 0.4, 0.43))
        c.drawString(ex + tw + cw + 5 * mm, yy + rh_ex / 2 - 1 * mm, memo)
        c.setFillColor(black)

    # --- お客様メモ ---------------------------------------------------------
    my = top_ex - len(samples) * rh_ex - 12 * mm
    c.setFont(JP, 10)
    c.drawString(left + 2 * mm, my, "■ お客様メモ（新規のお客様・お電話でのご予約）")

    cols = [("No.", 12 * mm), ("お名前", 52 * mm), ("お電話番号", 52 * mm),
            ("メニュー", 40 * mm), ("備考", 0)]
    table_w = right - left
    fixed = sum(w for _, w in cols if w)
    cols[-1] = (cols[-1][0], table_w - fixed)

    # 残りの高さいっぱいに行を作る
    ty = my - 6 * mm
    avail = ty - (MARGIN + 10 * mm)
    rh = 9 * mm
    rows = max(10, int(avail / rh) - 1)
    # 見出し
    c.setFillColor(HEAD_FILL)
    c.rect(left, ty - rh, table_w, rh, stroke=0, fill=1)
    c.setFillColor(black)
    x = left
    c.setFont(JP, 8.5)
    for name, w in cols:
        c.drawString(x + 2 * mm, ty - rh + 3 * mm, name)
        x += w
    # 罫線
    for r in range(rows + 1):
        yy = ty - rh - r * rh
        c.setStrokeColor(GRID_LIGHT)
        c.setLineWidth(0.35)
        c.line(left, yy, right, yy)
    x = left
    for _, w in cols:
        c.setStrokeColor(GRID_HOUR)
        c.setLineWidth(0.6)
        c.line(x, ty - rh - rows * rh, x, ty)
        x += w
    c.setStrokeColor(GRID_FRAME)
    c.setLineWidth(1.0)
    c.rect(left, ty - rh - rows * rh, table_w, rh + rows * rh, stroke=1, fill=0)
    c.line(left, ty - rh, right, ty - rh)
    # 番号
    c.setFont(JP, 8)
    c.setFillColor(Color(0.4, 0.4, 0.43))
    circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"
    for r in range(rows):
        yy = ty - rh - (r + 1) * rh
        mark = circled[r] if r < len(circled) else str(r + 1)
        c.drawCentredString(left + 6 * mm, yy + 3 * mm, mark)
    c.setFillColor(black)

    c.setFont(JP, 6.8)
    c.setFillColor(Color(0.4, 0.4, 0.43))
    c.drawRightString(right, MARGIN + 2 * mm, "2 / 2")
    c.setFillColor(black)


def build(path: str) -> None:
    c = canvas.Canvas(path, pagesize=A3)
    c.setTitle("STONE'S BARBER 予約表（手書き用）")
    c.setAuthor("STONE'S BARBER")

    draw_fiducials(c)
    draw_header(c)
    draw_grid(c)
    c.showPage()

    draw_contacts_page(c)
    c.showPage()

    c.save()


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "予約表_手書き用.pdf"
    build(out)
    print("書き出しました:", out)
    print(f"  A3 縦 / 2 ページ / 行数 {ROWS}（{hhmm(START_MIN)}〜{hhmm(END_MIN)} 15分刻み）")
