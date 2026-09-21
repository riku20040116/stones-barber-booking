"""STONE'S BARBER 手書き予約表（写真で取り込む前提）を PDF で作る。

書き方（用紙の 2 ページ目にも印刷している）:
  1. 時刻の区切りの横線は、すべて破線で印刷してある。
  2. 予約が入ったら、その時間帯の「上の破線」と「下の破線」をペンでなぞって実線にし、
     四角で囲む。四角の上辺 = 開始、下辺 = 終了。
  3. 四角の最初の行に「開始」「名前」「コース」を書く。欄は固定。

AI（写真からの読み取り）に向けた工夫:
  - 横線は 1 本残らず破線。なぞった線だけが実線になるので、予約の範囲を取り違えない。
    （毎正時の線まで破線にしているのはこのため。実線を 1 本でも印刷すると、
     なぞった線と区別がつかなくなる）
  - 1 日の中を「開始・名前・コース」の 3 欄に固定。どこに何が書いてあるかが決まる。
  - 四隅に黒い基準マーク（左上だけ白い切り欠き）→ 写真の傾き補正と向きの判定。
  - 列は A〜F、時刻は左右の両端に印刷。毎正時は太字＋1 時間ごとの薄い帯。
  - メニューは記号（C2 など）で書けるよう凡例を同じ紙に印刷。
    記号の一覧は src/lib/sheet/menu-codes.json（取り込み側と共有）。
  - 料金は Supabase から読む（.env.local）。読めなければ料金なしで印刷する。

使い方:
    python scripts/make_booking_sheet.py [出力先.pdf]
    （既定は public/booking-sheet.pdf。管理画面からダウンロードできる）
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

from reportlab.lib.colors import Color, black, white
from reportlab.lib.pagesizes import A3
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent

pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
pdfmetrics.registerFont(UnicodeCIDFont("HeiseiMin-W3"))
JP = "HeiseiKakuGo-W5"
JP_MIN = "HeiseiMin-W3"

PAGE_W, PAGE_H = A3  # 縦: 297 x 420 mm

# --- 版面 -------------------------------------------------------------------
MARGIN = 10 * mm
FIDUCIAL = 7 * mm
HEADER_H = 61 * mm
DAY_HEAD_H = 17 * mm       # 日付欄＋「開始・名前・コース」の見出し
FOOTER_H = 7 * mm
TIME_COL_W = 13 * mm

DAY_COLS = 6
COL_LABELS = ["A", "B", "C", "D", "E", "F"]
# 1 日分の中の固定欄（幅の比率）
SUB_COLS = [("開始", 0.27), ("名前", 0.43), ("コース", 0.30)]

# --- 時間軸（システムの 15 分枠と同じ）---------------------------------------
START_MIN = 9 * 60
END_MIN = 19 * 60 + 30
STEP = 15
ROWS = (END_MIN - START_MIN) // STEP  # 42 行

# --- 色 ---------------------------------------------------------------------
DASH_COLOR = Color(0.55, 0.55, 0.58)      # 破線（なぞる線）
SUB_LINE = Color(0.80, 0.80, 0.82)        # 開始・名前・コースの区切り（縦）
FRAME = black
HEAD_FILL = Color(0.93, 0.93, 0.94)
HOUR_BAND = Color(0.965, 0.965, 0.975)    # 1 時間おきの薄い帯
GRAY_TEXT = Color(0.40, 0.40, 0.43)
LIGHT_TEXT = Color(0.60, 0.60, 0.63)

DASH = (1.6, 1.6)  # 破線のパターン（pt）


# =============================================================================
# データ
# =============================================================================
def load_codes() -> dict:
    with open(ROOT / "src" / "lib" / "sheet" / "menu-codes.json", encoding="utf-8") as f:
        return json.load(f)


def load_env() -> dict:
    env = {}
    p = ROOT / ".env.local"
    if not p.exists():
        return env
    for line in p.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def load_prices() -> dict[str, str]:
    """slug -> 表示用の料金（"4,800" / "7,500〜"）。取れなければ空。"""
    env = {**load_env(), **os.environ}
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        return {}
    req = urllib.request.Request(
        f"{url}/rest/v1/menus?select=slug,price,price_label&is_active=eq.true",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            rows = json.loads(res.read().decode("utf-8"))
    except Exception as e:  # noqa: BLE001 - 料金が取れなくても用紙は作る
        print(f"  (料金を取得できませんでした: {e}。料金なしで作成します)")
        return {}
    out = {}
    for r in rows:
        label = r.get("price_label") or f"{r['price']:,}"
        out[r["slug"]] = label.replace("円", "")
    return out


def hhmm(total_min: int) -> str:
    return f"{total_min // 60}:{total_min % 60:02d}"


# =============================================================================
# 共通パーツ
# =============================================================================
def draw_fiducials(c: canvas.Canvas) -> None:
    """四隅の基準マーク。左上だけ白い切り欠きを入れて上下の向きを判別できるようにする。"""
    s = FIDUCIAL
    m = 5 * mm
    corners = [
        (m, PAGE_H - m - s),
        (PAGE_W - m - s, PAGE_H - m - s),
        (m, m),
        (PAGE_W - m - s, m),
    ]
    c.setFillColor(black)
    for x, y in corners:
        c.rect(x, y, s, s, stroke=0, fill=1)
    x, y = corners[0]
    c.setFillColor(white)
    c.rect(x + s * 0.55, y + s * 0.55, s * 0.3, s * 0.3, stroke=0, fill=1)
    c.setFillColor(black)


def dashed_hline(c: canvas.Canvas, x1: float, x2: float, y: float) -> None:
    c.setDash(*DASH)
    c.setStrokeColor(DASH_COLOR)
    c.setLineWidth(0.5)
    c.line(x1, y, x2, y)
    c.setDash()


# =============================================================================
# 1 ページ目
# =============================================================================
def draw_header(c: canvas.Canvas, codes: dict, prices: dict[str, str]) -> None:
    top = PAGE_H - MARGIN
    left = MARGIN + 6 * mm  # 基準マークを避ける
    right = PAGE_W - MARGIN

    c.setFillColor(black)
    c.setFont(JP, 19)
    c.drawString(left, top - 7 * mm, "予約表")
    c.setFont(JP, 8.5)
    c.drawString(left + 26 * mm, top - 7 * mm, "STONE'S BARBER")

    # 週の記入欄
    c.setFont(JP, 9)
    x = left + 62 * mm
    y = top - 9 * mm
    c.drawString(x, y + 1.7 * mm, "この用紙の週：")
    bx = x + 24 * mm
    for label, w in (("年", 14 * mm), ("月", 9 * mm), ("日", 9 * mm)):
        c.setStrokeColor(black)
        c.setLineWidth(0.8)
        c.rect(bx, y, w, 6.5 * mm, stroke=1, fill=0)
        c.setFont(JP, 8)
        c.drawString(bx + w + 1 * mm, y + 1.8 * mm, label)
        bx += w + 5 * mm
    c.setFont(JP, 7)
    c.setFillColor(GRAY_TEXT)
    c.drawString(bx + 1 * mm, y + 1.8 * mm, "← A 列の日付")
    c.setFillColor(black)

    # 書き方の要点（1 行）
    hy = top - 16 * mm
    c.setFont(JP, 8.5)
    c.drawString(
        left,
        hy,
        "■ 予約が入ったら、その時間の 上と下の破線をなぞって四角で囲み、最初の行に「開始・名前・コース」を書く",
    )
    c.setFont(JP, 7)
    c.setFillColor(GRAY_TEXT)
    c.drawString(left + 4 * mm, hy - 4 * mm, "詳しい書き方と記入例は 2 ページ目。新規のお客様は名前の横に ① ② … を付け、2 ページ目に電話番号を書く")
    c.setFillColor(black)

    # 凡例（4 列）
    ly = top - 26 * mm
    c.setFont(JP, 8.5)
    c.drawString(left, ly, "■ メニュー記号")
    items = codes["main"]
    per_col = 5
    col_w = (right - left) / 4
    row_h = 4.2 * mm
    for i, item in enumerate(items):
        col, row = divmod(i, per_col)
        x = left + col * col_w
        y = ly - 4.6 * mm - row * row_h
        c.setFont(JP, 8)
        c.drawString(x, y, item["code"])
        c.setFont(JP, 7)
        c.drawString(x + 7 * mm, y, item["label"])
        price = prices.get(item["slug"])
        if price:
            c.setFillColor(GRAY_TEXT)
            c.drawRightString(x + col_w - 6 * mm, y, price)
            c.setFillColor(black)

    # オプション（入りきらなければ次の行へ）
    oy = ly - 4.6 * mm - per_col * row_h - 1.2 * mm
    c.setFont(JP, 8)
    c.drawString(left, oy, "オプション")
    ox = left + 16 * mm
    c.setFont(JP, 7)
    for item in codes["options"]:
        text = f"{item['code']} {item['label']}"
        price = prices.get(item["slug"])
        if price:
            text += f" {price}"
        w = pdfmetrics.stringWidth(text, JP, 7)
        if ox + w > right:
            oy -= 4 * mm
            ox = left + 16 * mm
        c.drawString(ox, oy, text)
        ox += w + 3.8 * mm


def draw_grid(c: canvas.Canvas) -> None:
    grid_top = PAGE_H - MARGIN - HEADER_H
    grid_bottom = MARGIN + FOOTER_H
    body_top = grid_top - DAY_HEAD_H
    row_h = (body_top - grid_bottom) / ROWS

    left = MARGIN
    right = PAGE_W - MARGIN
    day_w = (right - left - TIME_COL_W * 2) / DAY_COLS

    def col_x(i: int) -> float:
        return left + TIME_COL_W + i * day_w

    # --- 1 時間おきの薄い帯（線ではないので、なぞった線と紛れない）-----------
    c.setFillColor(HOUR_BAND)
    for r in range(ROWS):
        t = START_MIN + r * STEP
        if (t // 60) % 2 == 1:
            y = body_top - (r + 1) * row_h
            c.rect(left, y, right - left, row_h, stroke=0, fill=1)
    c.setFillColor(black)

    # --- 見出し -------------------------------------------------------------
    c.setFillColor(HEAD_FILL)
    c.rect(left, body_top, right - left, DAY_HEAD_H, stroke=0, fill=1)
    c.setFillColor(black)

    c.setFont(JP, 7.5)
    for x in (left, right - TIME_COL_W):
        c.drawCentredString(x + TIME_COL_W / 2, body_top + DAY_HEAD_H / 2 - 1.2 * mm, "時刻")

    for i in range(DAY_COLS):
        x = col_x(i)
        # 1 段目: 列記号・日付・休
        y1 = body_top + DAY_HEAD_H - 7.4 * mm
        c.setFont(JP, 9)
        c.drawString(x + 1.2 * mm, y1 + 1.6 * mm, COL_LABELS[i])
        # [  ]月 [  ]日 [ ]曜  …  □休
        bw, bh = 6.4 * mm, 5.4 * mm
        bx = x + 4.6 * mm
        c.setStrokeColor(GRAY_TEXT)
        c.setLineWidth(0.6)
        c.setFont(JP, 6.8)
        for label, w in (("月", bw), ("日", bw), ("曜", 4.8 * mm)):
            c.rect(bx, y1, w, bh, stroke=1, fill=0)
            c.drawString(bx + w + 0.5 * mm, y1 + 1.5 * mm, label)
            bx += w + 3.3 * mm
        cb = x + day_w - 6.6 * mm
        c.rect(cb, y1 + 0.9 * mm, 3.2 * mm, 3.2 * mm, stroke=1, fill=0)
        c.drawString(cb + 3.7 * mm, y1 + 1.5 * mm, "休")

        # 2 段目: 開始・名前・コース
        y2 = body_top + 1.6 * mm
        sx = x
        c.setFont(JP, 7.5)
        c.setFillColor(GRAY_TEXT)
        for name, ratio in SUB_COLS:
            w = day_w * ratio
            c.drawCentredString(sx + w / 2, y2, name)
            sx += w
        c.setFillColor(black)

    # --- 横線: すべて破線（毎正時も破線）----------------------------------
    for r in range(ROWS + 1):
        y = body_top - r * row_h
        dashed_hline(c, col_x(0), col_x(DAY_COLS), y)
        # 時刻列の中だけは、毎正時に短い実線の目盛り（日付の列の外なので紛れない）
        t = START_MIN + r * STEP
        c.setStrokeColor(DASH_COLOR)
        c.setLineWidth(0.8 if t % 60 == 0 else 0.3)
        c.line(left, y, left + TIME_COL_W, y)
        c.line(right - TIME_COL_W, y, right, y)

    # --- 時刻ラベル ---------------------------------------------------------
    for r in range(ROWS):
        t = START_MIN + r * STEP
        y_mid = body_top - r * row_h - row_h / 2
        if t % 60 == 0:
            c.setFont(JP, 9.5)
            c.setFillColor(black)
        elif t % 30 == 0:
            c.setFont(JP, 7.8)
            c.setFillColor(GRAY_TEXT)
        else:
            c.setFont(JP, 6.3)
            c.setFillColor(LIGHT_TEXT)
        c.drawCentredString(left + TIME_COL_W / 2, y_mid - 1.2 * mm, hhmm(t))
        c.drawCentredString(right - TIME_COL_W / 2, y_mid - 1.2 * mm, hhmm(t))
    c.setFillColor(black)

    # --- 縦線 ---------------------------------------------------------------
    # 開始・名前・コースの区切り（細い実線。縦線はなぞる対象ではない）
    c.setStrokeColor(SUB_LINE)
    c.setLineWidth(0.35)
    for i in range(DAY_COLS):
        sx = col_x(i)
        for _, ratio in SUB_COLS[:-1]:
            sx += day_w * ratio
            c.line(sx, grid_bottom, sx, body_top + 5.2 * mm)
    # 1 日ごとの区切り
    c.setStrokeColor(FRAME)
    c.setLineWidth(1.0)
    for i in range(DAY_COLS + 1):
        c.line(col_x(i), grid_bottom, col_x(i), grid_top)
    # 外枠・見出しの下
    c.setLineWidth(1.3)
    c.rect(left, grid_bottom, right - left, grid_top - grid_bottom, stroke=1, fill=0)
    c.setLineWidth(1.0)
    c.line(left, body_top, right, body_top)
    # 見出しの 1 段目と 2 段目の区切り（日付の列の中）
    c.setStrokeColor(SUB_LINE)
    c.setLineWidth(0.4)
    c.line(col_x(0), body_top + 5.2 * mm, col_x(DAY_COLS), body_top + 5.2 * mm)

    # --- 下の注記 -----------------------------------------------------------
    c.setFont(JP, 6.8)
    c.setFillColor(GRAY_TEXT)
    c.drawString(
        left + 6 * mm,
        grid_bottom - 4.6 * mm,
        "営業時間 火〜金 9:30-19:30 ／ 土日祝 9:00-19:00　定休日 毎週月曜・第3火曜　"
        "1 行 = 15 分　横線はすべて破線（なぞった線だけが実線になります）",
    )
    c.drawRightString(right - 6 * mm, grid_bottom - 4.6 * mm, "1 / 2")
    c.setFillColor(black)


# =============================================================================
# 2 ページ目
# =============================================================================
def draw_example(c: canvas.Canvas, x0: float, y_top: float) -> float:
    """記入例のミニチュア。本物の表と同じ描き方で、なぞった四角を太線で示す。"""
    rows = [(10 * 60) + 15 * i for i in range(8)]  # 10:00〜11:45
    rh = 8 * mm
    tw = 14 * mm
    widths = [16 * mm, 26 * mm, 20 * mm]
    total_w = tw + sum(widths)

    # 見出し
    c.setFillColor(HEAD_FILL)
    c.rect(x0, y_top - 6 * mm, total_w, 6 * mm, stroke=0, fill=1)
    c.setFillColor(GRAY_TEXT)
    c.setFont(JP, 7.5)
    c.drawCentredString(x0 + tw / 2, y_top - 4.2 * mm, "時刻")
    sx = x0 + tw
    for (name, _), w in zip(SUB_COLS, widths):
        c.drawCentredString(sx + w / 2, y_top - 4.2 * mm, name)
        sx += w
    c.setFillColor(black)

    body_top = y_top - 6 * mm
    for i in range(len(rows) + 1):
        y = body_top - i * rh
        dashed_hline(c, x0 + tw, x0 + total_w, y)
    for i, t in enumerate(rows):
        c.setFont(JP, 8 if t % 60 == 0 else 6.5)
        c.setFillColor(black if t % 60 == 0 else GRAY_TEXT)
        c.drawCentredString(x0 + tw / 2, body_top - i * rh - rh / 2 - 1.2 * mm, hhmm(t))
    c.setFillColor(black)

    # 縦線
    c.setStrokeColor(SUB_LINE)
    c.setLineWidth(0.35)
    sx = x0 + tw
    for w in widths[:-1]:
        sx += w
        c.line(sx, body_top - len(rows) * rh, sx, body_top)
    c.setStrokeColor(FRAME)
    c.setLineWidth(1.0)
    c.rect(x0, body_top - len(rows) * rh, total_w, len(rows) * rh + 6 * mm, stroke=1, fill=0)
    c.line(x0 + tw, body_top - len(rows) * rh, x0 + tw, y_top)

    def box(i_from: int, i_to: int) -> None:
        """i_from 行目の上 〜 i_to 行目の下 をなぞった四角（ペンの太線）"""
        c.setStrokeColor(black)
        c.setLineWidth(1.8)
        y1 = body_top - i_from * rh
        y2 = body_top - (i_to + 1) * rh
        c.line(x0 + tw, y1, x0 + total_w, y1)
        c.line(x0 + tw, y2, x0 + total_w, y2)

    def write(i: int, start: str, name: str, course: str) -> None:
        y = body_top - i * rh - rh / 2 - 1.4 * mm
        c.setFont(JP_MIN, 10)
        sx = x0 + tw
        for text, w in zip((start, name, course), widths):
            c.drawCentredString(sx + w / 2, y, text)
            sx += w

    # 10:00〜10:45 田中 C2（35 分）
    box(0, 2)
    write(0, "10:00", "田中", "C2")
    # 10:45〜11:45 佐藤① C1+眉（55 分）。前の予約と線を共有する
    box(3, 6)
    write(3, "10:45", "佐藤①", "C1+眉")

    # 説明
    c.setFont(JP, 7.8)
    c.setFillColor(GRAY_TEXT)
    ex = x0 + total_w + 5 * mm
    notes = [
        (body_top - 1.5 * rh, "← 10:00 の上と 10:45 の上の破線をなぞって四角にする"),
        (body_top - 2.2 * rh, "　 最初の行に 開始・名前・コース を書く"),
        (body_top - 4.5 * rh, "← 続けて入る予約は、前の四角の下の線をそのまま使う"),
        (body_top - 5.2 * rh, "　 ① は新規のお客様。下のお客様メモの ① に電話番号を書く"),
        (body_top - 7.6 * rh, "← なぞっていない所（11:45〜）は空き"),
    ]
    for y, text in notes:
        c.drawString(ex, y, text)
    c.setFillColor(black)

    return body_top - len(rows) * rh


def draw_page2(c: canvas.Canvas) -> None:
    draw_fiducials(c)
    top = PAGE_H - MARGIN
    left = MARGIN
    right = PAGE_W - MARGIN

    c.setFont(JP, 16)
    c.drawString(left + 6 * mm, top - 7 * mm, "書き方とお客様メモ")

    y = top - 17 * mm
    c.setFont(JP, 10)
    c.drawString(left + 6 * mm, y, "■ 書き方")
    lines = [
        "1. 上の日付欄に「月」「日」「曜」を書きます。お休みの日は「休」の四角に印を入れてください。",
        "2. 予約が入ったら、その時間帯の上と下の破線をペンでなぞって、四角で囲みます。",
        "   四角の上の線が開始、下の線が終了の時刻です（1 行 = 15 分）。",
        "3. 四角の中の最初の行に、「開始」「名前」「コース」を書きます。欄からはみ出さないように。",
        "4. 名前は姓だけで構いません。メニューは 1 ページ目の記号で書きます（例 C2+剃）。",
        "5. 取り消しは、四角の中に大きく × を書いてください。塗りつぶさないでください。",
        "6. 新規のお客様は名前の横に ① ② … を付け、下の「お客様メモ」に電話番号を書きます。",
        "7. 1 週間分書けたら、1 ページ目（と、書いた場合はこのページ）を真上から写真に撮り、",
        "   管理画面の「手書き予約の取り込み」から登録します。四隅の黒い四角が写るように撮ってください。",
    ]
    c.setFont(JP, 8.5)
    for i, s in enumerate(lines):
        c.drawString(left + 10 * mm, y - 6 * mm - i * 5 * mm, s)

    ey = y - 6 * mm - len(lines) * 5 * mm - 7 * mm
    c.setFont(JP, 10)
    c.drawString(left + 6 * mm, ey, "■ 記入例")
    bottom = draw_example(c, left + 10 * mm, ey - 4 * mm)

    # お客様メモ
    my = bottom - 11 * mm
    c.setFont(JP, 10)
    c.drawString(left + 6 * mm, my, "■ お客様メモ（新規のお客様・電話番号が分かっている方）")

    cols = [("No.", 12 * mm), ("お名前", 52 * mm), ("お電話番号", 52 * mm),
            ("メニュー", 40 * mm), ("備考", 0)]
    table_w = right - left
    fixed = sum(w for _, w in cols if w)
    cols[-1] = (cols[-1][0], table_w - fixed)

    rh = 9 * mm
    ty = my - 5 * mm
    rows = max(8, int((ty - (MARGIN + 12 * mm)) / rh) - 1)

    c.setFillColor(HEAD_FILL)
    c.rect(left, ty - rh, table_w, rh, stroke=0, fill=1)
    c.setFillColor(black)
    x = left
    c.setFont(JP, 8.5)
    for name, w in cols:
        c.drawString(x + 2 * mm, ty - rh + 3 * mm, name)
        x += w
    for r in range(rows + 1):
        yy = ty - rh - r * rh
        c.setStrokeColor(SUB_LINE)
        c.setLineWidth(0.4)
        c.line(left, yy, right, yy)
    x = left
    c.setStrokeColor(GRAY_TEXT)
    c.setLineWidth(0.6)
    for _, w in cols:
        c.line(x, ty - rh - rows * rh, x, ty)
        x += w
    c.setStrokeColor(FRAME)
    c.setLineWidth(1.0)
    c.rect(left, ty - rh - rows * rh, table_w, rh + rows * rh, stroke=1, fill=0)
    c.line(left, ty - rh, right, ty - rh)

    circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"
    c.setFont(JP, 8.5)
    c.setFillColor(GRAY_TEXT)
    for r in range(rows):
        yy = ty - rh - (r + 1) * rh
        mark = circled[r] if r < len(circled) else str(r + 1)
        c.drawCentredString(left + 6 * mm, yy + 3 * mm, mark)
    c.setFillColor(black)

    c.setFont(JP, 6.8)
    c.setFillColor(GRAY_TEXT)
    c.drawRightString(right - 6 * mm, MARGIN + 1 * mm, "2 / 2")
    c.setFillColor(black)


# =============================================================================
def build(path: str) -> None:
    codes = load_codes()
    prices = load_prices()
    print(f"  メニュー記号 {len(codes['main'])} + オプション {len(codes['options'])}"
          f" ／ 料金 {'あり' if prices else 'なし'}")

    Path(path).parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(path, pagesize=A3)
    c.setTitle("STONE'S BARBER 予約表（手書き用）")
    c.setAuthor("STONE'S BARBER")

    draw_fiducials(c)
    draw_header(c, codes, prices)
    draw_grid(c)
    c.showPage()

    draw_page2(c)
    c.showPage()
    c.save()


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "public" / "booking-sheet.pdf")
    build(out)
    print("書き出しました:", out)
    print(f"  A3 縦 / 2 ページ / {ROWS} 行（{hhmm(START_MIN)}〜{hhmm(END_MIN)} 15分刻み・横線はすべて破線）")
