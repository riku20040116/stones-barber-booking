/**
 * Next.js middleware.
 *  1) Web予約アプリの入口を守る Basic 認証ゲート（SITE_PASSWORD が設定されている時のみ有効）
 *  2) Supabase auth クッキーのリフレッシュ
 *
 * 入口は2段構えになっている:
 *   - お客様（Web予約画面）  … Basic 認証（SITE_USERNAME / SITE_PASSWORD）
 *   - 店舗スタッフ（管理画面）… /admin の Supabase ログイン（メール + パスワード）
 * 管理画面は自前のログインを持っているので Basic 認証を通さない。
 * 二重にパスワードを入れさせないためで、認証強度が落ちるわけではない。
 */
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Basic 認証を必ず素通りさせるパス
const BASIC_AUTH_BYPASS_PREFIXES = [
  "/admin", // 管理画面は Supabase ログインで守られている
  "/api/stripe/webhook", // Stripe が外部から叩く
  "/api/cron/", // Vercel Cron が外部から叩く
];

export async function middleware(request: NextRequest) {
  // === 1) Web予約画面の Basic 認証ゲート ========================================
  const sitePassword = process.env.SITE_PASSWORD;
  const isBypassed = BASIC_AUTH_BYPASS_PREFIXES.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );
  if (sitePassword && !isBypassed) {
    const expectedUser = process.env.SITE_USERNAME ?? "STONES";
    const expectedPass = sitePassword;
    const authHeader = request.headers.get("authorization");
    let authed = false;
    if (authHeader?.startsWith("Basic ")) {
      try {
        const decoded = atob(authHeader.slice(6));
        const idx = decoded.indexOf(":");
        if (idx > 0) {
          const user = decoded.slice(0, idx);
          const pass = decoded.slice(idx + 1);
          if (user === expectedUser && pass === expectedPass) {
            authed = true;
          }
        }
      } catch {
        // ignore decode errors
      }
    }
    if (!authed) {
      return new NextResponse(
        "ID とパスワードを入力してください。\n（店舗スタッフの方は /admin から管理者ログインできます）",
        {
          status: 401,
          headers: {
            // HTTP ヘッダは ByteString（Latin-1）しか入らないので realm は ASCII のみ。
            // 日本語を入れると Response 生成時に TypeError になる。
            "WWW-Authenticate":
              'Basic realm="STONES BARBER Booking", charset="UTF-8"',
            "Content-Type": "text/plain; charset=utf-8",
          },
        },
      );
    }
  }

  // === 2) Supabase auth セッションのリフレッシュ =================================
  const response = NextResponse.next({
    request,
  });

  // Supabase 環境変数が未設定 / プレースホルダ / 不正な URL の場合はスキップ（dev 初期段階）
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !isValidHttpUrl(url)) {
    return response;
  }

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // セッション再評価（必要なら refresh）
  await supabase.auth.getUser();

  return response;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export const config = {
  matcher: [
    /*
     * Match everything except:
     * - _next (build assets)
     * - api (handled per-route)
     * - static files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
