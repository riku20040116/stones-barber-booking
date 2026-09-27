"""STONE'S BARBER 手書き予約表（写真で取り込む前提）を A4 の PDF で作る。

構成（A4 縦・3 ページ）:
  1 ページ目  予約表 1/2  火・水・木（A・B・C 列）
  2 ページ目  予約表 2/2  金・土・日（D・E・F 列）
  3 ページ目  メニュー早見表（料金・所要時間）・書き方・記入例・お客様メモ

A4 1 枚に 6 日分を入れると 15 分の行が 3.9mm しか取れず書き込めないため、
1 枚 3 日分にしている（行 約 5.9mm ＝ ノートの B 罫くらい、名前欄 約 23mm）。
月曜は定休なので、曜日は火〜日をあらかじめ印刷してある。

書き方:
  - 時刻の区切りの横線はすべて破線。予約が入ったら上下の破線をなぞって四角にする。
    四角の上辺 = 開始、下辺 = 終了。
  - 四角の最初の行に「開始」「名前」「コース」を書く。欄は固定。
  - 取り消すときは、開始・名前・コースを書いた枠の上から ✖ をかぶせる（無効になる）。
  - 写真を撮って取り込んだら「取り込み日」を書く（二重の取り込みを防ぐ）。

AI（写真からの読み取り）に向けた工夫:
  - 日付の列の中の横線は 1 本残らず破線。なぞった線だけが実線になる。
  - 四隅に黒い基準マーク（左上だけ白い切り欠き）→ 傾き補正と向きの判定。
  - 列記号 A〜F と曜日を印刷、時刻は左右の両端に印刷。
  - メニュー記号は src/lib/sheet/menu-codes.json（取り込み側と共有）。
  - 料金・所要時間は Supabase から読む（.env.local）。読めなければ空欄で印刷する。

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
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent

pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
pdfmetrics.registerFont(UnicodeCIDFont("HeiseiMin-W3"))
JP = "HeiseiKakuGo-W5"
JP_MIN = "HeiseiMin-W3"

PAGE_W, PAGE_H = A4  # 縦: 210 x 297 mm

# --- 版面 -------------------------------------------------------------------
MX = 12 * mm              # 左右の余白（四隅の基準マークと重ならないように）
MY_TOP = 9 * mm
MY_BOTTOM = 9 * mm
FIDUCIAL = 6 * mm
FID_OFFSET = 3.5 * mm

HEAD_H = 20 * mm          # 見出し（タイトル・週・取り込み日・注意書き）
DAY_HEAD_H = 11 * mm      # 列の見出し（日付・曜日・休 ＋ 開始/名前/コース）
FOOT_H = 5 * mm
TIME_W = 11 * mm

# 1 日分の中の固定欄（幅の比率）
SUB_COLS = [("開始", 0.25), ("名前", 0.42), ("コース", 0.33)]

# 予約表のページ: (ページ表記, 列記号, 曜日)
SHEET_PAGES = [
    ("1/2", ["A", "B", "C"], ["火", "水", "木"]),
    ("2/2", ["D", "E", "F"], ["金", "土", "日"]),
]
TOTAL_PAGES = len(SHEET_PAGES) + 1

# --- 時間軸（システムの 15 分枠と同じ）---------------------------------------
START_MIN = 9 * 60
END_MIN = 19 * 60 + 30
STEP = 15
ROWS = (END_MIN - START_MIN) // STEP  # 42 行

# --- 色 ---------------------------------------------------------------------
DASH_COLOR = Color(0.55, 0.55, 0.58)
SUB_LINE = Color(0.80, 0.80, 0.82)
FRAME = black
HEAD_FILL = Color(0.93, 0.93, 0.94)
HOUR_BAND = Color(0.965, 0.965, 0.975)
WEEKEND_FILL = Color(0.90, 0.90, 0.92)
GRAY_TEXT = Color(0.40, 0.40, 0.43)
LIGHT_TEXT = Color(0.60, 0.60, 0.63)

DASH = (1.4, 1.4)


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


def load_menu_info() -> dict[str, dict]:
    """slug -> {"price": "4,800" / "7,500〜", "minutes": 50}。取れなければ空。"""
    env = {**load_env(), **os.environ}
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        return {}
    req = urllib.request.Request(
        f"{url}/rest/v1/menus?select=slug,price,price_label,duration_min&is_active=eq.true",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            rows = json.loads(res.read().decode("utf-8"))
    except Exception as e:  # noqa: BLE001 - 取れなくても用紙は作る
        print(f"  (料金・所要時間を取得できませんでした: {e}。空欄で作成します)")
        return {}
    out = {}
    for r in rows:
        label = (r.get("price_label") or f"{r['price']:,}").replace("円", "")
        out[r["slug"]] = {"price": label, "minutes": r.get("duration_min")}
    return out


def hhmm(total_min: int) -> str:
    return f"{total_min // 60}:{total_min % 60:02d}"


# =============================================================================
# 共通パーツ
# =============================================================================
def draw_fiducials(c: canvas.Canvas) -> None:
    """四隅の基準マーク。左上だけ白い切り欠きを入れて上下の向きを判別できるようにする。"""
    s = FIDUCIAL
    m = FID_OFFSET
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


def draw_cross(c: canvas.Canvas, x: float, y: float, size: float, width: float = 1.3) -> None:
    """✖ を線で描く（✖ の文字は PDF の日本語フォントに無く、文字だと消えてしまうため）。
    (x, y) は左下。"""
    c.setStrokeColor(black)
    c.setLineWidth(width)
    c.line(x, y, x + size, y + size)
    c.line(x, y + size, x + size, y)


def text_with_cross(c: canvas.Canvas, x: float, y: float, parts: list[str],
                    font: str = JP, size: float = 7.6) -> None:
    """文字列の間に ✖ を挟んで描く。parts の要素のあいだに 1 つずつ ✖ が入る。"""
    c.setFont(font, size)
    cross = size * 0.30 * mm
    for i, part in enumerate(parts):
        c.drawString(x, y, part)
        x += pdfmetrics.stringWidth(part, font, size)
        if i < len(parts) - 1:
            draw_cross(c, x + 0.6 * mm, y - 0.1 * mm, cross, width=1.1)
            x += cross + 1.4 * mm


def dashed_hline(c: canvas.Canvas, x1: float, x2: float, y: float) -> None:
    c.setDash(*DASH)
    c.setStrokeColor(DASH_COLOR)
    c.setLineWidth(0.45)
    c.line(x1, y, x2, y)
    c.setDash()


def boxes(c: canvas.Canvas, x: float, y: float, fields: list[tuple[str, float]],
          h: float = 5.2 * mm, gap: float = 1.0 * mm, font: float = 7.5) -> float:
    """[   ]年 [  ]月 [  ]日 のような記入枠を並べる。右端の x を返す。"""
    c.setStrokeColor(black)
    c.setLineWidth(0.7)
    for label, w in fields:
        c.rect(x, y, w, h, stroke=1, fill=0)
        c.setFont(JP, font)
        c.setFillColor(black)
        c.drawString(x + w + 0.6 * mm, y + 1.5 * mm, label)
        x += w + pdfmetrics.stringWidth(label, JP, font) + gap + 1.2 * mm
    return x


def footer(c: canvas.Canvas, page_no: int, note: str) -> None:
    c.setFont(JP, 6.3)
    c.setFillColor(GRAY_TEXT)
    c.drawString(MX, MY_BOTTOM - 1 * mm, note)
    c.drawRightString(PAGE_W - MX, MY_BOTTOM - 1 * mm, f"{page_no} / {TOTAL_PAGES}")
    c.setFillColor(black)


# =============================================================================
# 予約表（1・2 ページ目）
# =============================================================================
def draw_sheet_header(c: canvas.Canvas, page_label: str, days: list[str]) -> None:
    top = PAGE_H - MY_TOP
    left = MX
    right = PAGE_W - MX

    # 1 行目: タイトル ／ この週の火曜日
    y1 = top - 5.5 * mm
    c.setFillColor(black)
    c.setFont(JP, 15)
    c.drawString(left, y1, f"予約表 {page_label}")
    tw = pdfmetrics.stringWidth(f"予約表 {page_label}", JP, 15)
    c.setFont(JP, 10)
    c.drawString(left + tw + 3 * mm, y1, "・".join(days))
    c.setFont(JP, 6.5)
    c.setFillColor(GRAY_TEXT)
    c.drawString(left + tw + 3 * mm + pdfmetrics.stringWidth("・".join(days), JP, 10) + 3 * mm, y1, "STONE'S BARBER")
    c.setFillColor(black)

    bx = right - 82 * mm
    c.setFont(JP, 8)
    c.drawString(bx, y1, "この週の火曜日")
    boxes(c, bx + 22 * mm, y1 - 1.6 * mm, [("年", 13 * mm), ("月", 8 * mm), ("日", 8 * mm)])

    # 2 行目: 取り込み日
    y2 = top - 12 * mm
    c.setFont(JP, 8)
    c.drawString(bx, y2, "取り込み日")
    ex = boxes(c, bx + 22 * mm, y2 - 1.6 * mm, [("月", 8 * mm), ("日", 8 * mm)])
    c.setFont(JP, 6.2)
    c.setFillColor(GRAY_TEXT)
    c.drawString(ex + 0.5 * mm, y2, "← 取り込んだら記入")
    c.setFillColor(black)

    # 左側: 書き方の要点（右側の記入欄と重ならない幅で 3 行に分ける）
    c.setFont(JP, 7)
    c.drawString(left, top - 11 * mm, "予約が入ったら上下の破線をなぞって四角で囲み、")
    c.drawString(left, top - 14.5 * mm, "最初の行に 開始・名前・コース を書く")
    text_with_cross(c, left, top - 18 * mm,
                    ["取り消すときは 開始・名前・コース の上から ",
                     " をかぶせる（無効）　記号・所要時間は 3 ページ目"], size=7)


def draw_sheet_grid(c: canvas.Canvas, columns: list[str], days: list[str]) -> None:
    grid_top = PAGE_H - MY_TOP - HEAD_H
    grid_bottom = MY_BOTTOM + FOOT_H
    body_top = grid_top - DAY_HEAD_H
    row_h = (body_top - grid_bottom) / ROWS

    left = MX
    right = PAGE_W - MX
    n = len(columns)
    day_w = (right - left - TIME_W * 2) / n

    def col_x(i: int) -> float:
        return left + TIME_W + i * day_w

    # 1 時間おきの薄い帯（線ではないので、なぞった線と紛れない）
    c.setFillColor(HOUR_BAND)
    for r in range(ROWS):
        t = START_MIN + r * STEP
        if (t // 60) % 2 == 1:
            y = body_top - (r + 1) * row_h
            c.rect(left, y, right - left, row_h, stroke=0, fill=1)

    # 見出しの背景（土日は少し濃く）
    c.setFillColor(HEAD_FILL)
    c.rect(left, body_top, right - left, DAY_HEAD_H, stroke=0, fill=1)
    for i, d in enumerate(days):
        if d in ("土", "日"):
            c.setFillColor(WEEKEND_FILL)
            c.rect(col_x(i), body_top + 4.8 * mm, day_w, DAY_HEAD_H - 4.8 * mm, stroke=0, fill=1)
    c.setFillColor(black)

    c.setFont(JP, 7)
    for x in (left, right - TIME_W):
        c.drawCentredString(x + TIME_W / 2, body_top + DAY_HEAD_H / 2 - 1 * mm, "時刻")

    for i, (col, dow) in enumerate(zip(columns, days)):
        x = col_x(i)
        y1 = body_top + DAY_HEAD_H - 5.6 * mm
        # 列記号
        c.setFont(JP, 8)
        c.setFillColor(GRAY_TEXT)
        c.drawString(x + 1 * mm, y1 + 1.2 * mm, col)
        c.setFillColor(black)
        # [  ]月 [  ]日
        bx = x + 4.8 * mm
        c.setStrokeColor(GRAY_TEXT)
        c.setLineWidth(0.6)
        c.setFont(JP, 6.8)
        for label in ("月", "日"):
            c.rect(bx, y1, 7 * mm, 4.6 * mm, stroke=1, fill=0)
            c.drawString(bx + 7.5 * mm, y1 + 1.2 * mm, label)
            bx += 7 * mm + 4.4 * mm
        # 曜日（印刷済み）
        c.setFont(JP, 11)
        c.drawString(bx + 0.8 * mm, y1 + 0.9 * mm, f"（{dow}）")
        # 休
        cb = x + day_w - 6.6 * mm
        c.setFont(JP, 6.8)
        c.rect(cb, y1 + 0.8 * mm, 3.1 * mm, 3.1 * mm, stroke=1, fill=0)
        c.drawString(cb + 3.6 * mm, y1 + 1.2 * mm, "休")

        # 開始・名前・コース
        sx = x
        c.setFont(JP, 7)
        c.setFillColor(GRAY_TEXT)
        for name, ratio in SUB_COLS:
            w = day_w * ratio
            c.drawCentredString(sx + w / 2, body_top + 1.3 * mm, name)
            sx += w
        c.setFillColor(black)

    # 横線: 日付の列の中はすべて破線（毎正時も破線）
    for r in range(ROWS + 1):
        y = body_top - r * row_h
        dashed_hline(c, col_x(0), col_x(n), y)
        t = START_MIN + r * STEP
        c.setStrokeColor(DASH_COLOR)
        c.setLineWidth(0.8 if t % 60 == 0 else 0.3)
        c.line(left, y, left + TIME_W, y)
        c.line(right - TIME_W, y, right, y)

    # 時刻ラベル
    for r in range(ROWS):
        t = START_MIN + r * STEP
        y_mid = body_top - r * row_h - row_h / 2
        if t % 60 == 0:
            c.setFont(JP, 8.5)
            c.setFillColor(black)
        elif t % 30 == 0:
            c.setFont(JP, 7)
            c.setFillColor(GRAY_TEXT)
        else:
            c.setFont(JP, 5.8)
            c.setFillColor(LIGHT_TEXT)
        c.drawCentredString(left + TIME_W / 2, y_mid - 1 * mm, hhmm(t))
        c.drawCentredString(right - TIME_W / 2, y_mid - 1 * mm, hhmm(t))
    c.setFillColor(black)

    # 縦線（開始・名前・コースの区切りは細い実線。縦線はなぞる対象ではない）
    c.setStrokeColor(SUB_LINE)
    c.setLineWidth(0.35)
    for i in range(n):
        sx = col_x(i)
        for _, ratio in SUB_COLS[:-1]:
            sx += day_w * ratio
            c.line(sx, grid_bottom, sx, body_top + 4.8 * mm)
    c.setStrokeColor(FRAME)
    c.setLineWidth(1.0)
    for i in range(n + 1):
        c.line(col_x(i), grid_bottom, col_x(i), grid_top)
    c.setLineWidth(1.2)
    c.rect(left, grid_bottom, right - left, grid_top - grid_bottom, stroke=1, fill=0)
    c.setLineWidth(0.9)
    c.line(left, body_top, right, body_top)
    c.setStrokeColor(SUB_LINE)
    c.setLineWidth(0.4)
    c.line(col_x(0), body_top + 4.8 * mm, col_x(n), body_top + 4.8 * mm)


def draw_sheet_page(c: canvas.Canvas, page_no: int, page_label: str,
                    columns: list[str], days: list[str]) -> None:
    draw_fiducials(c)
    draw_sheet_header(c, page_label, days)
    draw_sheet_grid(c, columns, days)
    footer(
        c,
        page_no,
        "1 行 = 15 分　横線はすべて破線（なぞった線だけが実線）　"
        "営業 火〜金 9:30-19:30 ／ 土日祝 9:00-19:00　定休 月曜・第3火曜",
    )


# =============================================================================
# 3 ページ目: 早見表・書き方・記入例・お客様メモ
# =============================================================================
def draw_quick_reference(c: canvas.Canvas, codes: dict, info: dict, top: float) -> float:
    left = MX
    right = PAGE_W - MX
    col_w = (right - left) / 3
    row_h = 4.5 * mm

    main = {m["code"]: m for m in codes["main"]}
    groups = [
        ("カット・コース", [main[k] for k in ("C1", "C2", "C3", "C4", "C5", "S1", "S2", "S3")]),
        ("カラー・パーマ・縮毛矯正",
         [main[k] for k in ("K1", "K2", "K3", "K4", "P1", "P2", "P3", "P4", "P5", "T1")]),
        ("オプション（コースの後ろに +記号）", codes["options"]),
    ]

    c.setFont(JP, 10)
    c.drawString(left, top, "■ メニュー早見表")
    c.setFont(JP, 6.3)
    c.setFillColor(GRAY_TEXT)
    c.drawRightString(right, top, "料金（円） / 所要時間の目安。初めてのお客様は ＋15分")
    c.setFillColor(black)

    y0 = top - 3 * mm
    max_rows = max(len(items) for _, items in groups)
    for gi, (title, items) in enumerate(groups):
        x = left + gi * col_w
        # 見出し
        c.setFillColor(HEAD_FILL)
        c.rect(x + 0.5 * mm, y0 - 4.6 * mm, col_w - 1 * mm, 4.6 * mm, stroke=0, fill=1)
        c.setFillColor(black)
        c.setFont(JP, 6.8)
        c.drawString(x + 1.5 * mm, y0 - 3.3 * mm, title)
        for r, item in enumerate(items):
            y = y0 - 4.6 * mm - (r + 1) * row_h + 1.4 * mm
            meta = info.get(item["slug"], {})
            c.setFont(JP, 8)
            c.drawString(x + 1.5 * mm, y, item["code"])
            c.setFont(JP, 6.6)
            c.drawString(x + 10 * mm, y, item["label"])
            c.setFillColor(GRAY_TEXT)
            if meta.get("price"):
                c.drawRightString(x + col_w - 10.5 * mm, y, meta["price"])
            if meta.get("minutes"):
                c.drawRightString(x + col_w - 1.5 * mm, y, f"{meta['minutes']}分")
            c.setFillColor(black)
            # 行の区切り
            c.setStrokeColor(SUB_LINE)
            c.setLineWidth(0.3)
            c.line(x + 0.5 * mm, y - 1.4 * mm, x + col_w - 0.5 * mm, y - 1.4 * mm)
    return y0 - 4.6 * mm - max_rows * row_h


def example_minutes(write: str, codes: dict, info: dict) -> str:
    """"C2+S" → "35＋15＝50分"（取れなければ空）"""
    by_code = {m["code"]: m for m in codes["main"]}
    by_code.update({o["code"]: o for o in codes["options"]})
    parts = write.split("+")
    keys = [parts[0]] + ["+" + p for p in parts[1:]]
    mins = []
    for k in keys:
        m = by_code.get(k)
        v = info.get(m["slug"], {}).get("minutes") if m else None
        if v is None:
            return ""
        mins.append(v)
    if len(mins) == 1:
        return f"{mins[0]}分"
    return "＋".join(str(v) for v in mins) + f"＝{sum(mins)}分"


def draw_rules(c: canvas.Canvas, codes: dict, info: dict, top: float) -> float:
    left = MX
    c.setFont(JP, 10)
    c.drawString(left, top, "■ 書き方")
    y = top - 5 * mm
    lh = 4.2 * mm

    def line(text: str, indent: float = 3 * mm, color=black, size: float = 7.6) -> None:
        nonlocal y
        c.setFont(JP, size)
        c.setFillColor(color)
        c.drawString(left + indent, y, text)
        c.setFillColor(black)
        y -= lh

    line("1. 日付欄に「月」「日」を書きます（曜日は印刷済み）。お休みの日は「休」に印を入れます。")
    line("2. 予約が入ったら、その時間帯の上と下の破線をなぞって四角で囲みます（1 行 = 15 分）。")
    line("   四角の上の線が開始、下の線が終了。長さは早見表の所要時間に合わせます。", color=GRAY_TEXT)
    line("3. 四角の最初の行に「開始」「名前」「コース」を書きます。名前は姓だけで構いません。")
    line("4. コースは記号で書きます。コース記号を先に書き、オプションを付けるときだけ「+記号」を続けます。")

    rule = codes.get("rule", {})
    for ex in rule.get("examples", []):
        c.setFont(JP, 8.5)
        c.drawString(left + 9 * mm, y, ex["write"])
        c.setFont(JP, 7.4)
        c.setFillColor(GRAY_TEXT)
        mins = example_minutes(ex["write"], codes, info)
        text = f"… {ex['means']}" + (f"（{mins}）" if mins else "")
        c.drawString(left + 27 * mm, y, text)
        c.setFillColor(black)
        y -= lh

    text_with_cross(c, left + 3 * mm, y, [
        "5. 予約を取り消すときは、開始・名前・コースを書いた枠の上から大きく ",
        " をかぶせます（記入例の 11:45）。",
    ], size=7.6)
    y -= lh
    text_with_cross(c, left + 3 * mm, y, [
        "   ", " をかぶせた予約は無効（キャンセル）になり、取り込んでも登録されません。塗りつぶさないでください。",
    ], size=7.6)
    y -= lh
    line("6. 新規のお客様は名前の横に ① ② … を付け、下の「お客様メモ」に電話番号を書きます。")
    line("7. 1 週間分の予約表（1・2 ページ目）を、四隅の黒い四角が写るように真上から写真に撮り、")
    line("   管理画面「手書き予約の取り込み」で登録します。登録したら「取り込み日」を書きます。", color=GRAY_TEXT)
    return y


def draw_example(c: canvas.Canvas, top: float) -> float:
    """記入例のミニチュア。本物の表と同じ描き方で、なぞった四角を太線で示す。"""
    left = MX
    c.setFont(JP, 10)
    c.drawString(left, top, "■ 記入例")

    x0 = left + 3 * mm
    rows = [(10 * 60) + 15 * i for i in range(10)]  # 10:00〜12:15
    rh = 5.9 * mm
    tw = 11 * mm
    widths = [13.7 * mm, 23 * mm, 18 * mm]
    total_w = tw + sum(widths)
    y_top = top - 3 * mm

    c.setFillColor(HEAD_FILL)
    c.rect(x0, y_top - 4.8 * mm, total_w, 4.8 * mm, stroke=0, fill=1)
    c.setFillColor(GRAY_TEXT)
    c.setFont(JP, 6.8)
    c.drawCentredString(x0 + tw / 2, y_top - 3.4 * mm, "時刻")
    sx = x0 + tw
    for (name, _), w in zip(SUB_COLS, widths):
        c.drawCentredString(sx + w / 2, y_top - 3.4 * mm, name)
        sx += w
    c.setFillColor(black)

    body_top = y_top - 4.8 * mm
    for i in range(len(rows) + 1):
        dashed_hline(c, x0 + tw, x0 + total_w, body_top - i * rh)
    for i, t in enumerate(rows):
        c.setFont(JP, 7.5 if t % 60 == 0 else 5.8)
        c.setFillColor(black if t % 60 == 0 else GRAY_TEXT)
        c.drawCentredString(x0 + tw / 2, body_top - i * rh - rh / 2 - 1 * mm, hhmm(t))
    c.setFillColor(black)

    c.setStrokeColor(SUB_LINE)
    c.setLineWidth(0.35)
    sx = x0 + tw
    for w in widths[:-1]:
        sx += w
        c.line(sx, body_top - len(rows) * rh, sx, body_top)
    c.setStrokeColor(FRAME)
    c.setLineWidth(1.0)
    c.rect(x0, body_top - len(rows) * rh, total_w, len(rows) * rh + 4.8 * mm, stroke=1, fill=0)
    c.line(x0 + tw, body_top - len(rows) * rh, x0 + tw, y_top)

    def box(i_from: int, i_to: int) -> None:
        c.setStrokeColor(black)
        c.setLineWidth(1.6)
        c.line(x0 + tw, body_top - i_from * rh, x0 + total_w, body_top - i_from * rh)
        c.line(x0 + tw, body_top - (i_to + 1) * rh, x0 + total_w, body_top - (i_to + 1) * rh)

    def write(i: int, start: str, name: str, course: str) -> None:
        y = body_top - i * rh - rh / 2 - 1.3 * mm
        c.setFont(JP_MIN, 9.5)
        sx = x0 + tw
        for text, w in zip((start, name, course), widths):
            c.drawCentredString(sx + w / 2, y, text)
            sx += w

    box(0, 2)
    write(0, "10:00", "田中", "C2")
    box(3, 6)
    write(3, "10:45", "佐藤①", "C1+M")
    # 取り消した予約: 開始・名前・コースの上から ✖ をかぶせる
    box(7, 8)
    write(7, "11:45", "鈴木", "C5")
    c.setStrokeColor(black)
    c.setLineWidth(1.8)
    c.line(x0 + tw + 4 * mm, body_top - 7 * rh - 1.2 * mm,
           x0 + total_w - 4 * mm, body_top - 9 * rh + 1.2 * mm)
    c.line(x0 + tw + 4 * mm, body_top - 9 * rh + 1.2 * mm,
           x0 + total_w - 4 * mm, body_top - 7 * rh - 1.2 * mm)

    notes_x = x0 + total_w + 5 * mm
    c.setFont(JP, 7.2)
    c.setFillColor(GRAY_TEXT)
    notes = [
        (1.5, "← 10:00 と 10:45 の破線をなぞって四角に"),
        (2.2, "　 最初の行に 開始・名前・コース（C2 = 35分）"),
        (4.5, "← 続く予約は前の四角の下の線をそのまま使う"),
        (5.2, "　 C1+M = カット顔剃り＋眉毛剃。① は新規のお客様"),
        (9.6, "← なぞっていない所（12:15〜）は空き"),
    ]
    for k, text in notes:
        c.drawString(notes_x, body_top - k * rh, text)
    c.setFillColor(black)
    c.setFillColor(GRAY_TEXT)
    text_with_cross(c, notes_x, body_top - 7.9 * rh,
                    ["← 開始・名前・コースの上から ", " ＝ 取り消し（無効）"], size=7.2)
    c.setFillColor(black)
    return body_top - len(rows) * rh


def draw_memo(c: canvas.Canvas, top: float) -> None:
    left = MX
    right = PAGE_W - MX
    c.setFont(JP, 10)
    c.drawString(left, top, "■ お客様メモ（新規のお客様・電話番号が分かっている方）")

    cols = [("No.", 10 * mm), ("お名前", 40 * mm), ("お電話番号", 42 * mm),
            ("コース", 28 * mm), ("備考", 0)]
    table_w = right - left
    fixed = sum(w for _, w in cols if w)
    cols[-1] = (cols[-1][0], table_w - fixed)

    rh = 7.4 * mm
    ty = top - 3 * mm
    rows = max(6, int((ty - (MY_BOTTOM + FOOT_H + 2 * mm)) / rh) - 1)

    c.setFillColor(HEAD_FILL)
    c.rect(left, ty - rh, table_w, rh, stroke=0, fill=1)
    c.setFillColor(black)
    x = left
    c.setFont(JP, 7.8)
    for name, w in cols:
        c.drawString(x + 1.8 * mm, ty - rh + 2.6 * mm, name)
        x += w
    for r in range(rows + 1):
        c.setStrokeColor(SUB_LINE)
        c.setLineWidth(0.4)
        c.line(left, ty - rh - r * rh, right, ty - rh - r * rh)
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
    c.setFont(JP, 8)
    c.setFillColor(GRAY_TEXT)
    for r in range(rows):
        mark = circled[r] if r < len(circled) else str(r + 1)
        c.drawCentredString(left + 5 * mm, ty - rh - (r + 1) * rh + 2.5 * mm, mark)
    c.setFillColor(black)


def draw_reference_page(c: canvas.Canvas, page_no: int, codes: dict, info: dict) -> None:
    draw_fiducials(c)
    top = PAGE_H - MY_TOP
    c.setFont(JP, 14)
    c.drawString(MX, top - 5 * mm, "メニュー早見表・書き方・お客様メモ")
    c.setFont(JP, 6.5)
    c.setFillColor(GRAY_TEXT)
    c.drawRightString(PAGE_W - MX, top - 5 * mm, "STONE'S BARBER 予約表 3 ページ目")
    c.setFillColor(black)

    y = draw_quick_reference(c, codes, info, top - 13 * mm)
    y = draw_rules(c, codes, info, y - 7 * mm)
    y = draw_example(c, y - 3 * mm)
    draw_memo(c, y - 8 * mm)
    footer(c, page_no, "お客様メモの電話番号は、取り込みの確認画面で入力・確認します")


# =============================================================================
def build(path: str) -> None:
    codes = load_codes()
    info = load_menu_info()
    print(f"  メニュー記号 {len(codes['main'])} + オプション {len(codes['options'])}"
          f" ／ 料金・所要時間 {'あり' if info else 'なし'}")

    Path(path).parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle("STONE'S BARBER 予約表（手書き用・A4）")
    c.setAuthor("STONE'S BARBER")

    for i, (label, columns, days) in enumerate(SHEET_PAGES, start=1):
        draw_sheet_page(c, i, label, columns, days)
        c.showPage()

    draw_reference_page(c, TOTAL_PAGES, codes, info)
    c.showPage()
    c.save()


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "public" / "booking-sheet.pdf")
    build(out)
    print("書き出しました:", out)
    print(f"  A4 縦 / {TOTAL_PAGES} ページ（火水木・金土日・早見表） / {ROWS} 行（15分刻み）")
