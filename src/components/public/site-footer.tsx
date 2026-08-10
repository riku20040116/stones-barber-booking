/**
 * 予約アプリ共通フッター。
 * 紹介サイトへのリンクと、予約・管理者への導線だけを置く。
 */
import Link from "next/link";
import { ExternalLinkIcon, ShieldCheckIcon } from "lucide-react";

import { InstagramIcon } from "@/components/public/instagram-icon";
import { STORE } from "@/lib/constants";
import { formatPhoneForLink } from "@/lib/format";

/** 店舗の紹介サイト（別運用）。予約アプリからはリンクのみ。 */
const SITE_URL = "https://www.stonesbarber.com/";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-zinc-950 text-zinc-200">
      <div className="container mx-auto max-w-5xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <p className="font-heading text-lg font-bold tracking-tight text-white">
              {STORE.name}
            </p>
            <p className="mt-1 text-xs text-zinc-400">{STORE.nameJa}</p>
            <p className="mt-4 text-sm leading-relaxed text-zinc-300">
              {STORE.address.full}
            </p>
            <a
              href={formatPhoneForLink(STORE.phone.tel)}
              className="mt-2 inline-block text-sm text-zinc-300 hover:text-white"
            >
              {STORE.phone.display}
            </a>
            <div className="mt-4 flex flex-col gap-2 text-sm">
              <a
                href={STORE.social.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-zinc-300 hover:text-white"
              >
                <InstagramIcon className="size-4" />
                {STORE.social.instagramHandle}
              </a>
              <a
                href={SITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-zinc-300 hover:text-white"
              >
                <ExternalLinkIcon className="size-4" />
                店舗ホームページ
              </a>
            </div>
          </div>

          <div className="text-sm">
            <p className="font-semibold text-white">ご予約について</p>
            <ul className="mt-3 space-y-1.5">
              <li>
                <Link
                  href="/reservations/new"
                  className="text-zinc-300 transition-colors hover:text-white"
                >
                  Web予約をする
                </Link>
              </li>
              <li>
                <Link
                  href="/reservations/lookup"
                  className="text-zinc-300 transition-colors hover:text-white"
                >
                  予約の確認・キャンセル
                </Link>
              </li>
            </ul>
          </div>

          <div className="text-sm">
            <p className="font-semibold text-white">営業時間</p>
            <dl className="mt-3 space-y-1 text-zinc-300">
              <div>
                <dt className="text-xs text-zinc-500">火〜金</dt>
                <dd className="tabular-nums">
                  {STORE.hours.weekday.open} 〜 {STORE.hours.weekday.close}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">土・日・祝</dt>
                <dd className="tabular-nums">
                  {STORE.hours.weekend.open} 〜 {STORE.hours.weekend.close}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">定休日</dt>
                <dd>
                  {STORE.closures.weekly} ／ {STORE.closures.monthly}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-zinc-800 pt-6 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {STORE.name}. All rights reserved.
          </p>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-2 font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            <ShieldCheckIcon className="size-3.5" />
            管理者画面へ
          </Link>
        </div>
      </div>
    </footer>
  );
}
