"use client";
/**
 * 予約ウィザード（クライアントコンポーネント）。
 * ステップ:
 *   0: メニュー選択
 *   1: 日時選択（月別カレンダー + 週次表）
 *   2: お客様情報入力
 *   3: 確認
 *   4: 完了
 *
 * UI 方針:
 *  - 上部にスティッキーな「進捗 + ナビゲーションボタン」バーを置く。
 *    どのステップにいても画面右上にネクスト/サブミットが見える。
 *  - 直下に「選択中サマリ」を常時表示。今選んでいるメニュー / 日時 / 顧客情報が一目で分かる。
 *  - メニューはオプション以外、1 予約あたり 1 項目（自動排他）。
 *  - 日時選択は 15 分刻みの表 + 当月・翌月の月別カレンダーで構成。
 */
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CalendarPlusIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { type HolidayOverride } from "@/lib/calendar";
import { MonthlyCalendar } from "@/components/public/monthly-calendar";
import {
  formatDateJst,
  formatHumanJst,
  getDowJst,
  jstWallToUtc,
} from "@/lib/timezone";
import {
  MENU_CATEGORY_META,
  MENU_CATEGORY_ORDER,
  formatDurationMin,
  formatMenuPrice,
  groupMenusByCategory,
  type MenuCategoryDb,
} from "@/lib/reservation/menu-format";
import type { DayAvailability, MenuRow } from "@/lib/reservation/queries";
import { customerInfoSchema } from "@/lib/reservation/schema";

import {
  getAvailableSlotsRange,
  getUnavailableDates,
  submitReservation,
} from "./actions";

// =============================================================================
// 型・定数
// =============================================================================
const WEEK_DAYS = 7;
const MAX_FUTURE_DAYS = 60;

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

type Slot = { startIso: string; endIso: string; label: string };

type CustomerForm = {
  name: string;
  email: string;
  phone: string;
  notes: string;
};

type CustomerErrors = Partial<Record<keyof CustomerForm, string>>;

type PaymentMethod = "in_store" | "stripe";

type StepDef = {
  id: "menu" | "slot" | "customer" | "confirm";
  label: string;
  nextLabel: string;
};

const STEPS: readonly StepDef[] = [
  { id: "menu", label: "メニュー", nextLabel: "次へ：日時を選ぶ" },
  { id: "slot", label: "日時", nextLabel: "次へ：お客様情報を入力" },
  { id: "customer", label: "お客様情報", nextLabel: "次へ：内容を確認" },
  { id: "confirm", label: "確認", nextLabel: "この内容で予約を確定する" },
] as const;

// =============================================================================
// ルート
// =============================================================================
export function ReservationWizard({
  menus,
  overrides,
}: {
  menus: MenuRow[];
  overrides: HolidayOverride[];
}) {
  const [step, setStep] = React.useState(0);

  // ステップが変わったら最上部にスクロール（モバイル特有の "次へを押したのに画面上部に
  // 戻らずスクロール途中" 問題を回避）。
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [step]);

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  // 初回来店フラグ: 初めての方は最初に +15 分のカウンセリング時間を加算する。
  // 初めて Web 予約に来た人を保護するためデフォルト ON。再来店者は明示的に OFF。
  const [isFirstTime, setIsFirstTime] = React.useState(true);
  const [slot, setSlot] = React.useState<Slot | null>(null);
  const [customer, setCustomer] = React.useState<CustomerForm>({
    name: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [customerErrors, setCustomerErrors] = React.useState<CustomerErrors>(
    {},
  );
  const [paymentMethod, setPaymentMethod] =
    React.useState<PaymentMethod>("in_store");
  const [pending, startTransition] = React.useTransition();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submittedCode, setSubmittedCode] = React.useState<string | null>(null);

  // 完了画面へ遷移したら最上部へ
  React.useEffect(() => {
    if (submittedCode && typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [submittedCode]);

  const grouped = React.useMemo(() => groupMenusByCategory(menus), [menus]);
  const menuById = React.useMemo(() => {
    const m = new Map<string, MenuRow>();
    menus.forEach((x) => m.set(x.id, x));
    return m;
  }, [menus]);

  const selectedMenus = selectedIds
    .map((id) => menuById.get(id))
    .filter((m): m is MenuRow => Boolean(m));

  const FIRST_TIME_PADDING_MIN = 15;
  const baseDuration = selectedMenus.reduce(
    (sum, m) => sum + m.duration_min,
    0,
  );
  const firstTimePadding = isFirstTime ? FIRST_TIME_PADDING_MIN : 0;
  const totalDuration = baseDuration + firstTimePadding;
  const totalPrice = selectedMenus.reduce((sum, m) => sum + m.price, 0);

  /**
   * メニュー選択トグル。
   *  - is_option=true なら従来通り複数選択 OK（add / remove）
   *  - is_option=false（カット・コース・カラー・パーマ・縮毛矯正）は **1 項目のみ**。
   *    既に別の非オプション項目が選ばれていれば自動で外して入れ替える。
   */
  function toggleMenu(id: string) {
    const target = menuById.get(id);
    if (!target) return;
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (target.is_option) {
        return [...prev, id];
      }
      // 非オプションは排他
      return [
        ...prev.filter((otherId) => menuById.get(otherId)?.is_option),
        id,
      ];
    });
    setSlot(null); // メニュー変更で枠は破棄
  }

  function toggleFirstTime(value: boolean) {
    setIsFirstTime(value);
    setSlot(null); // 所要時間が変わるので既存スロット選択は無効化
  }

  function canGoNext(): boolean {
    if (step === 0) return selectedIds.length > 0 && totalDuration > 0;
    if (step === 1) return !!slot;
    if (step === 2) return true; // 検証は onClick で
    return false;
  }

  function tryGoNext() {
    if (step === 2) {
      const result = customerInfoSchema.safeParse({
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        notes: customer.notes || null,
      });
      if (!result.success) {
        const next: CustomerErrors = {};
        for (const issue of result.error.issues) {
          const path = issue.path[0] as keyof CustomerForm | undefined;
          if (path && !next[path]) next[path] = issue.message;
        }
        setCustomerErrors(next);
        return;
      }
      setCustomerErrors({});
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function submit() {
    if (!slot) {
      setSubmitError("時間枠が選択されていません。");
      return;
    }
    setSubmitError(null);
    startTransition(async () => {
      const res = await submitReservation({
        menuIds: selectedMenus.map((m) => m.id),
        startAtIso: slot.startIso,
        endAtIso: slot.endIso,
        customer: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          notes: customer.notes || null,
        },
        paymentMethod,
      });
      if (res.ok) {
        toast.success(`予約を受け付けました。予約番号: ${res.code}`);
        if (res.checkoutUrl) {
          window.location.href = res.checkoutUrl;
          return;
        }
        setSubmittedCode(res.code);
      } else {
        setSubmitError(res.error);
        toast.error(res.error);
      }
    });
  }

  // 完了画面
  if (submittedCode) {
    return (
      <DoneView
        code={submittedCode}
        email={customer.email}
        slot={slot}
        menus={selectedMenus}
        totalPrice={totalPrice}
      />
    );
  }

  const isSubmitStep = step === STEPS.length - 1;
  const nextLabel = STEPS[step]!.nextLabel;
  const nextDisabled = isSubmitStep
    ? pending || !slot
    : !canGoNext() || pending;

  return (
    <div className="space-y-6">
      {/* ===== Sticky Top Bar (進捗 + ナビ + 選択中サマリ) ===== */}
      <div className="sticky top-16 z-30 -mx-4 border-b border-border bg-background/95 backdrop-blur">
        {/* 進捗とボタン: モバイルは縦並び・ボタン横一杯、PC は横並びで右寄せ */}
        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
          <Stepper current={step} />
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {step > 0 && (
              <Button
                variant="outline"
                size="lg"
                onClick={goBack}
                disabled={pending}
                className="h-11 shrink-0"
              >
                <ChevronLeftIcon className="size-4" />
                戻る
              </Button>
            )}
            <Button
              size="lg"
              onClick={isSubmitStep ? submit : tryGoNext}
              disabled={nextDisabled}
              className="h-11 flex-1 text-base font-bold shadow-sm sm:flex-initial sm:px-6"
            >
              {pending ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  送信中...
                </>
              ) : (
                <>
                  {nextLabel}
                  {!isSubmitStep && <ChevronRightIcon className="size-5" />}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* 選択中サマリ（top bar の中に入れて一緒にスティッキー化） */}
        <div className="border-t border-border/60 px-4 py-2">
          <PersistentSummary
            selectedMenus={selectedMenus}
            totalDuration={totalDuration}
            totalPrice={totalPrice}
            slot={slot}
            customer={customer}
            showCustomer={step >= 2}
            isFirstTime={isFirstTime}
            firstTimePadding={firstTimePadding}
          />
        </div>
      </div>

      {/* ===== 各ステップのコンテンツ ===== */}
      {step === 0 && (
        <MenuStep
          grouped={grouped}
          selectedIds={selectedIds}
          onToggle={toggleMenu}
          isFirstTime={isFirstTime}
          onFirstTimeChange={toggleFirstTime}
          selectedMenus={selectedMenus}
          totalDuration={totalDuration}
          totalPrice={totalPrice}
          firstTimePadding={firstTimePadding}
          onNext={tryGoNext}
        />
      )}
      {step === 1 && (
        <SlotStep
          totalDuration={totalDuration}
          slot={slot}
          setSlot={setSlot}
          overrides={overrides}
        />
      )}
      {step === 2 && (
        <CustomerStep
          customer={customer}
          setCustomer={setCustomer}
          errors={customerErrors}
          clearError={(key) =>
            setCustomerErrors((e) => ({ ...e, [key]: undefined }))
          }
        />
      )}
      {step === 3 && (
        <ConfirmStep
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          submitError={submitError}
        />
      )}

      {/* ===== 各ページ下部の遷移ボタン（上部スティッキーと同じ操作） ===== */}
      <StepNav
        step={step}
        nextLabel={nextLabel}
        isSubmitStep={isSubmitStep}
        nextDisabled={nextDisabled}
        pending={pending}
        onBack={goBack}
        onNext={isSubmitStep ? submit : tryGoNext}
      />
    </div>
  );
}

/**
 * 各ステップ最下部に置く遷移ボタン。
 * 上部スティッキーバーと同じ操作を、スクロールし切った位置でも押せるようにする。
 */
function StepNav({
  step,
  nextLabel,
  isSubmitStep,
  nextDisabled,
  pending,
  onBack,
  onNext,
}: {
  step: number;
  nextLabel: string;
  isSubmitStep: boolean;
  nextDisabled: boolean;
  pending: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="border-t border-border pt-5">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        {step > 0 ? (
          <Button
            variant="outline"
            size="lg"
            onClick={onBack}
            disabled={pending}
            className="h-12 w-full sm:w-auto"
          >
            <ChevronLeftIcon className="size-4" />
            前に戻る
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}
        <Button
          size="lg"
          onClick={onNext}
          disabled={nextDisabled}
          className="h-12 w-full text-base font-bold shadow-sm sm:w-auto sm:px-8"
        >
          {pending ? (
            <>
              <Loader2Icon className="size-4 animate-spin" />
              送信中...
            </>
          ) : (
            <>
              {nextLabel}
              {!isSubmitStep && <ChevronRightIcon className="size-5" />}
            </>
          )}
        </Button>
      </div>
      {nextDisabled && !pending && (
        <p className="mt-2 text-center text-xs text-muted-foreground sm:text-right">
          {step === 0
            ? "メニューを選択すると次へ進めます"
            : step === 1
              ? "空いている時間（○）を選択すると次へ進めます"
              : ""}
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Stepper
// =============================================================================
function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-xs">
      {STEPS.map((s, idx) => {
        const isActive = idx === current;
        const isDone = idx < current;
        return (
          <li
            key={s.id}
            className="flex items-center gap-1.5"
            aria-current={isActive ? "step" : undefined}
          >
            <span
              className={
                "inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                (isActive
                  ? "bg-primary text-primary-foreground"
                  : isDone
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground")
              }
            >
              {isDone ? <CheckIcon className="size-3" /> : idx + 1}
            </span>
            <span
              className={
                "hidden sm:inline " +
                (isActive
                  ? "font-medium text-foreground"
                  : "text-muted-foreground")
              }
            >
              {s.label}
            </span>
            {idx < STEPS.length - 1 && (
              <span aria-hidden className="text-muted-foreground/40">
                ›
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// =============================================================================
// 選択中サマリ（常時表示）
// =============================================================================
function PersistentSummary({
  selectedMenus,
  totalDuration,
  totalPrice,
  slot,
  customer,
  showCustomer,
  isFirstTime,
  firstTimePadding,
}: {
  selectedMenus: MenuRow[];
  totalDuration: number;
  totalPrice: number;
  slot: Slot | null;
  customer: CustomerForm;
  showCustomer: boolean;
  isFirstTime: boolean;
  firstTimePadding: number;
}) {
  if (selectedMenus.length === 0 && !slot) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          ▶ ご希望のメニューを選んで「日時選択へ」へお進みください。
        </p>
        {isFirstTime && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            初回 +{firstTimePadding}分
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          選択中
        </span>
        {isFirstTime && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            初回 +{firstTimePadding}分
          </span>
        )}
      </div>
      <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[5em_1fr]">
        {selectedMenus.length > 0 && (
          <>
            <dt className="text-sm text-muted-foreground sm:text-right">
              メニュー
            </dt>
            <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-base font-bold leading-tight">
                {selectedMenus.map((m) => m.name).join(" + ")}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                ({formatDurationMin(totalDuration)} /{" "}
                {totalPrice.toLocaleString("ja-JP")}円〜)
              </span>
            </dd>
          </>
        )}
        {slot && (
          <>
            <dt className="text-sm text-muted-foreground sm:text-right">
              日時
            </dt>
            <dd className="text-base font-bold leading-tight">
              {formatHumanJst(new Date(slot.startIso))}
            </dd>
          </>
        )}
        {showCustomer && customer.name && (
          <>
            <dt className="text-sm text-muted-foreground sm:text-right">
              お客様
            </dt>
            <dd className="text-base font-bold leading-tight">
              {customer.name} 様
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

// =============================================================================
// Step 0: メニュー選択
// =============================================================================
function MenuStep({
  grouped,
  selectedIds,
  onToggle,
  isFirstTime,
  onFirstTimeChange,
  selectedMenus,
  totalDuration,
  totalPrice,
  firstTimePadding,
  onNext,
}: {
  grouped: Record<MenuCategoryDb, MenuRow[]>;
  selectedIds: string[];
  onToggle: (id: string) => void;
  isFirstTime: boolean;
  onFirstTimeChange: (value: boolean) => void;
  selectedMenus: MenuRow[];
  totalDuration: number;
  totalPrice: number;
  firstTimePadding: number;
  onNext: () => void;
}) {
  const [tab, setTab] = React.useState<MenuCategoryDb>("cut");
  // 主メニュー選択直後に出す「次どうする？」ポップアップ
  const [optionPromptOpen, setOptionPromptOpen] = React.useState(false);
  // 非オプションのメニューを 1 つ選んでいるか（カット/コース等）
  const hasMainMenu = selectedMenus.some((m) => !m.is_option);
  const hasOption = selectedMenus.some((m) => m.is_option);

  /**
   * メニューカードのクリック。
   * 主メニュー（カット/コース等）を新たに選んだ場合は、
   * そのままオプションタブへ移動し、次の操作を促すポップアップを出す。
   */
  function handleMenuClick(menu: MenuRow) {
    const wasSelected = selectedIds.includes(menu.id);
    onToggle(menu.id);
    if (!menu.is_option && !wasSelected) {
      setTab("option");
      setOptionPromptOpen(true);
    }
  }

  /** 「オプションなし」: 選択済みオプションを解除して日時選択へ進む */
  function chooseNoOption() {
    selectedMenus.filter((m) => m.is_option).forEach((m) => onToggle(m.id));
    setOptionPromptOpen(false);
    if (hasMainMenu) {
      onNext();
    } else {
      // 主メニュー未選択なら、まずそちらを選んでもらう
      setTab("cut");
    }
  }

  return (
    <div className="space-y-4">
      {/* 初回来店トグル */}
      <Card size="sm" className="border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
        <CardContent className="py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-amber-800 dark:text-amber-200">
            ご来店について
          </p>
          <fieldset className="grid gap-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background p-2.5 hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                name="first_time"
                checked={isFirstTime}
                onChange={() => onFirstTimeChange(true)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium">
                  初めてのご来店です
                </span>
                <span className="block text-xs text-muted-foreground">
                  カウンセリングのため、施術時間に <strong>+15分</strong> をお取りします。
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background p-2.5 hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                name="first_time"
                checked={!isFirstTime}
                onChange={() => onFirstTimeChange(false)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium">
                  2 回目以降のご来店です
                </span>
                <span className="block text-xs text-muted-foreground">
                  通常の施術時間でご予約いただきます。
                </span>
              </span>
            </label>
          </fieldset>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as MenuCategoryDb)}>
        {/*
          メニューカテゴリのタブはスクロールしても常に見えるように sticky 化。
          上の sticky top bar の真下に張り付く（top-[8.5rem] ≒ ヘッダー64px + バー≈72px）。
          TabsList 自体に sticky を当てると base-ui の Tabs レイアウトを壊さないので
          こちらの方式を採用。
        */}
        <TabsList className="sticky top-[14rem] z-20 flex w-full flex-wrap !rounded-none border-b border-border bg-background/95 backdrop-blur sm:top-[10rem]">
          {MENU_CATEGORY_ORDER.map((cat) => (
            <TabsTrigger key={cat} value={cat}>
              {MENU_CATEGORY_META[cat].label}
            </TabsTrigger>
          ))}
        </TabsList>

        {MENU_CATEGORY_ORDER.map((cat) => (
          <TabsContent key={cat} value={cat} className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              {MENU_CATEGORY_META[cat].description}
              {cat !== "option" && (
                <>
                  {" "}
                  / 1 つのみご選択いただけます。
                </>
              )}
            </p>
            <div className="grid gap-3">
              {/* オプションタブの先頭: 「オプションなし」でそのまま日時選択へ */}
              {cat === "option" && (
                <Card
                  size="sm"
                  data-checked={!hasOption || undefined}
                  className="cursor-pointer border-dashed transition-colors hover:bg-muted/50 data-[checked=true]:border-solid data-[checked=true]:ring-2 data-[checked=true]:ring-primary"
                  onClick={chooseNoOption}
                >
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">
                        {!hasOption && (
                          <CheckIcon
                            aria-hidden
                            className="mr-1 inline size-4 text-primary"
                          />
                        )}
                        オプションなし
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        追加メニューは不要。このまま日時選択へ進みます。
                      </p>
                    </div>
                    <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              )}
              {grouped[cat].length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  このカテゴリのメニューはありません。
                </p>
              ) : (
                grouped[cat].map((menu) => {
                  const checked = selectedIds.includes(menu.id);
                  return (
                    <Card
                      key={menu.id}
                      size="sm"
                      data-checked={checked || undefined}
                      className="cursor-pointer overflow-hidden transition-colors hover:bg-muted/50 data-[checked=true]:ring-2 data-[checked=true]:ring-primary"
                      onClick={() => handleMenuClick(menu)}
                    >
                      <CardContent className="flex gap-3 py-3">
                        {menu.image_url && (
                          <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted sm:size-20">
                            <Image
                              src={menu.image_url}
                              alt={menu.name}
                              fill
                              sizes="80px"
                              className="object-cover"
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h3 className="font-medium">
                              {checked && (
                                <CheckIcon
                                  aria-hidden
                                  className="mr-1 inline size-4 text-primary"
                                />
                              )}
                              {menu.name}
                            </h3>
                            <span className="text-sm tabular-nums">
                              {formatMenuPrice(menu)}
                            </span>
                          </div>
                          {menu.description && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {menu.description}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline">
                              {formatDurationMin(menu.duration_min)}
                            </Badge>
                            {menu.note && <span>{menu.note}</span>}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* 選択中メニューの大きな表示 + 次へ誘導 */}
      {selectedMenus.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="space-y-4 py-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                選択中のメニュー
              </p>
              <ul className="mt-2 space-y-1.5">
                {selectedMenus.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="text-lg font-bold leading-tight">
                      {m.name}
                      {m.is_option && (
                        <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">
                          （オプション）
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-base font-semibold tabular-nums">
                      {formatMenuPrice(m)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-primary/20 pt-3 text-sm">
                <span className="text-muted-foreground">合計</span>
                <span className="text-lg font-bold tabular-nums">
                  {totalPrice.toLocaleString("ja-JP")}円〜
                </span>
                <span className="text-muted-foreground">
                  所要 {formatDurationMin(totalDuration)}
                  {isFirstTime && firstTimePadding > 0 && (
                    <span className="text-amber-700 dark:text-amber-300">
                      （初回 +{firstTimePadding}分込み）
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* オプションを選んでいない → そのまま日時選択へ誘導 */}
            {hasMainMenu && !hasOption && (
              <div className="rounded-lg border border-dashed border-primary/40 bg-background/60 p-3 text-sm">
                <p className="font-medium">
                  ▶ オプションが不要な場合は、このまま日時選択へお進みください。
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  頭皮スパ・フェイススパ・鼻脱毛などの追加は「オプション」タブから選べます。
                </p>
              </div>
            )}

          </CardContent>
        </Card>
      )}

      {/* 主メニュー選択直後のポップアップ: 次の操作を促す */}
      <Dialog open={optionPromptOpen} onOpenChange={setOptionPromptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>メニューを選択しました</DialogTitle>
            <DialogDescription>
              {selectedMenus
                .filter((m) => !m.is_option)
                .map((m) => m.name)
                .join("、") || "メニュー"}
              をお選びいただきました。
              <br />
              お顔剃り・頭皮スパなどの<strong>オプション</strong>を追加できます。
              不要な場合はこのまま日時選択へお進みください。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="lg"
              className="h-12 w-full sm:w-auto"
              onClick={() => setOptionPromptOpen(false)}
            >
              オプションを見る
            </Button>
            <Button
              size="lg"
              className="h-12 w-full font-bold sm:w-auto"
              onClick={() => {
                setOptionPromptOpen(false);
                onNext();
              }}
            >
              日時選択へ進む
              <ChevronRightIcon className="size-5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// Step 1: 日時選択（月別カレンダー + 週次表）
// =============================================================================

/** 表で使う 15 分刻みの時刻ラベル（"09:00" 〜 "19:30"）。 */
const TIME_GRID: string[] = (() => {
  const out: string[] = [];
  for (let mins = 9 * 60; mins <= 19 * 60 + 30; mins += 15) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    out.push(
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    );
  }
  return out;
})();

function shiftDate(dateStr: string, days: number): string {
  const anchor = new Date(`${dateStr}T12:00:00+09:00`);
  const shifted = new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000);
  return formatDateJst(shifted);
}

function todayStr(): string {
  return formatDateJst(new Date());
}

function maxFromStr(): string {
  return shiftDate(todayStr(), MAX_FUTURE_DAYS - WEEK_DAYS + 1);
}

function shortDateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function dowOf(dateStr: string): number {
  return getDowJst(jstWallToUtc(dateStr, "12:00"));
}

function compareTimeStrings(a: string, b: string): number {
  return a.localeCompare(b);
}

type CellState = "closed" | "out" | "available" | "blocked";

function cellState(
  day: DayAvailability,
  time: string,
  totalDurationMin: number,
  slotByTime: Map<string, Slot>,
): CellState {
  if (!day.isOpen) return "closed";
  if (compareTimeStrings(time, day.open) < 0) return "out";

  const [closeH, closeM] = day.close.split(":").map(Number);
  const closeMin = closeH * 60 + closeM;
  const lastStartMin = closeMin - totalDurationMin;
  const [tH, tM] = time.split(":").map(Number);
  const tMin = tH * 60 + tM;
  if (tMin > lastStartMin) return "out";

  if (slotByTime.has(time)) return "available";
  return "blocked";
}

function SlotStep({
  totalDuration,
  slot,
  setSlot,
  overrides,
}: {
  totalDuration: number;
  slot: Slot | null;
  setSlot: (s: Slot | null) => void;
  overrides: HolidayOverride[];
}) {
  const [fromDateStr, setFromDateStr] = React.useState<string>(() =>
    todayStr(),
  );
  const [days, setDays] = React.useState<DayAvailability[]>([]);
  const [fullDates, setFullDates] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const requestRef = React.useRef(0);
  const tableRef = React.useRef<HTMLDivElement | null>(null);

  const fetchRange = React.useCallback(
    (from: string, duration: number) => {
      const myReq = ++requestRef.current;
      startTransition(async () => {
        try {
          const res = await getAvailableSlotsRange({
            fromDateStr: from,
            days: WEEK_DAYS,
            totalDurationMin: duration,
          });
          if (myReq !== requestRef.current) return;
          if (res.ok) {
            setDays(res.days);
            setError(null);
          } else {
            setDays([]);
            setError(res.error);
          }
        } catch (e) {
          if (myReq !== requestRef.current) return;
          setDays([]);
          setError(
            e instanceof Error ? e.message : "通信エラーが発生しました",
          );
        }
      });
    },
    [],
  );

  // カレンダー全体（当月＋翌月 ≒ 62日）の満員日を取得してグレーアウトに使う
  const fetchFullDates = React.useCallback((duration: number) => {
    (async () => {
      try {
        const res = await getUnavailableDates({
          fromDateStr: todayStr(),
          days: 62,
          totalDurationMin: duration,
        });
        if (res.ok) setFullDates(new Set(res.fullDates));
      } catch {
        // 失敗時はグレーアウトなし（致命的ではない）
      }
    })();
  }, []);

  React.useEffect(() => {
    if (totalDuration > 0) {
      fetchRange(fromDateStr, totalDuration);
    }
  }, [fromDateStr, totalDuration, fetchRange]);

  React.useEffect(() => {
    if (totalDuration > 0) {
      fetchFullDates(totalDuration);
    }
  }, [totalDuration, fetchFullDates]);

  const canPrev = compareTimeStrings(fromDateStr, todayStr()) > 0;
  const canNext = compareTimeStrings(fromDateStr, maxFromStr()) < 0;

  function goPrevWeek() {
    const next = shiftDate(fromDateStr, -WEEK_DAYS);
    setFromDateStr(
      compareTimeStrings(next, todayStr()) < 0 ? todayStr() : next,
    );
  }
  function goNextWeek() {
    const next = shiftDate(fromDateStr, WEEK_DAYS);
    setFromDateStr(
      compareTimeStrings(next, maxFromStr()) > 0 ? maxFromStr() : next,
    );
  }

  // カレンダーで日付を選ぶ → その週を表示 → 時間表まで自動スクロール
  function handleSelectDate(dateStr: string) {
    setFromDateStr(dateStr);
    // レイアウト確定後にスクロール
    requestAnimationFrame(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const rangeLabel = days.length
    ? `${shortDateLabel(days[0]!.date)} 〜 ${shortDateLabel(days[days.length - 1]!.date)}`
    : `${shortDateLabel(fromDateStr)} 〜`;

  return (
    <div className="space-y-6">
      <MonthlyCalendar
        overrides={overrides}
        weekStart={fromDateStr}
        onSelectDate={handleSelectDate}
        fullDates={fullDates}
      />

      <div ref={tableRef} className="scroll-mt-44 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrevWeek}
            disabled={!canPrev || pending}
          >
            <ChevronLeftIcon className="size-4" />
            前の7日
          </Button>
          <span className="text-sm font-medium tabular-nums">{rangeLabel}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={goNextWeek}
            disabled={!canNext || pending}
          >
            次の7日
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>

        {error && (
          <Alert>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card size="sm" className="overflow-hidden">
          <CardContent className="p-0">
            {pending && days.length === 0 ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <SlotTable
                days={days}
                slot={slot}
                setSlot={setSlot}
                totalDuration={totalDuration}
                loading={pending}
              />
            )}
          </CardContent>
        </Card>

        <Legend />

        <p className="text-[11px] text-muted-foreground">
          所要時間 {formatDurationMin(totalDuration)}
          の枠が確保できる時刻のみ ○ で表示しています。当日のご予約は店舗まで直接お電話ください。
        </p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 月別カレンダーは src/components/public/monthly-calendar.tsx に移動済み。
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// 週次の枠表（時刻 × 日付）
// -----------------------------------------------------------------------------

function SlotTable({
  days,
  slot,
  setSlot,
  totalDuration,
  loading,
}: {
  days: DayAvailability[];
  slot: Slot | null;
  setSlot: (s: Slot | null) => void;
  totalDuration: number;
  loading: boolean;
}) {
  const slotMaps = React.useMemo(() => {
    return days.map((day) => {
      const m = new Map<string, Slot>();
      if (day.isOpen) {
        for (const s of day.slots) {
          m.set(s.label, s);
        }
      }
      return m;
    });
  }, [days]);

  const todayKey = todayStr();
  const selectedKey = slot ? slot.startIso : null;

  return (
    <div
      className={
        "overflow-x-auto " + (loading ? "opacity-60 transition-opacity" : "")
      }
    >
      <table className="w-full min-w-[640px] border-collapse text-center text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 w-16 border-b border-r bg-muted/40 px-2 py-2 text-xs font-medium text-muted-foreground"
            >
              時刻
            </th>
            {days.map((day, dayIdx) => {
              const dow = dowOf(day.date);
              const isToday = day.date === todayKey;
              const closed = !day.isOpen;
              const openCount = slotMaps[dayIdx]?.size ?? 0;
              return (
                <th
                  key={day.date}
                  scope="col"
                  className={
                    "border-b px-1 py-2 text-xs font-medium " +
                    (closed
                      ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      : dow === 0
                        ? "text-rose-600"
                        : dow === 6
                          ? "text-sky-600"
                          : "text-foreground") +
                    (isToday && !closed ? " bg-primary/10" : "")
                  }
                >
                  <div className="font-semibold tabular-nums">
                    {shortDateLabel(day.date)}
                  </div>
                  <div className="text-[10px] tracking-wider">
                    ({DOW_LABELS[dow]})
                  </div>
                  {!closed && (
                    <div
                      className={
                        "text-[10px] font-bold " +
                        (openCount > 0
                          ? "text-emerald-600"
                          : "text-muted-foreground/50")
                      }
                    >
                      {openCount > 0 ? `空${openCount}` : "満"}
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {TIME_GRID.map((time, timeIdx) => (
            <tr key={time} className="border-b last:border-b-0">
              <th
                scope="row"
                className="sticky left-0 z-10 w-16 border-r bg-card px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground"
              >
                {time}
              </th>
              {days.map((day, dayIdx) => {
                const slotMap = slotMaps[dayIdx]!;

                // 休業日: 1 列まるごと縦書きの「定休日」「臨時休業」表示にする（rowSpan 利用）
                if (!day.isOpen) {
                  if (timeIdx !== 0) return null; // 既に最初の行で span 済み
                  const reason = day.reason ?? "定休日";
                  return (
                    <td
                      key={day.date}
                      rowSpan={TIME_GRID.length}
                      className="bg-rose-50 align-middle text-center dark:bg-rose-950/40"
                    >
                      <div
                        className="inline-block px-2 py-3 text-base font-bold leading-tight text-rose-700 dark:text-rose-300"
                        style={{
                          writingMode: "vertical-rl",
                          textOrientation: "upright",
                          letterSpacing: "0.15em",
                        }}
                      >
                        {reason}
                      </div>
                    </td>
                  );
                }

                // 通常セル
                const baseState = cellState(
                  day,
                  time,
                  totalDuration,
                  slotMap,
                );

                // 30 分以上の連続予約が取れない枠は ○ → — に降格。
                // 「次の 15 分」が "available" でない（"blocked" / "out" / "closed"
                //  のいずれか）ならその枠は単独 1 コマしか空かないので、最短 30 分
                //  の予約が取れない。
                // ただし当該セル自身が「最終開始可能時刻ピッタリ」(= cellState では
                //  available) で、次の 15 分が "out (lastStartMin 超過)" になる
                //  正当ケースは保護する。具体的には slotMap が次の 15 分を持って
                //  いれば "available" 扱い、無ければ降格。
                let state: CellState = baseState;
                if (state === "available") {
                  const nextTime = TIME_GRID[timeIdx + 1];
                  if (!nextTime) {
                    // 表の最後尾。理論上ここまでくる available は無いはずだが安全側で残す。
                  } else {
                    const nextState = cellState(
                      day,
                      nextTime,
                      totalDuration,
                      slotMap,
                    );
                    if (nextState !== "available") {
                      // 「最終開始時刻」の正当ケース判定:
                      //   現在の time + totalDuration が close と一致するなら
                      //   現在の枠だけで予約は完結する。降格しない。
                      const [closeH, closeM] = day.close
                        .split(":")
                        .map(Number);
                      const closeMin = closeH * 60 + closeM;
                      const [tH, tM] = time.split(":").map(Number);
                      const tMin = tH * 60 + tM;
                      const fitsExactly = tMin + totalDuration === closeMin;
                      if (!fitsExactly) {
                        state = "out";
                      }
                    }
                  }
                }

                if (state === "out") {
                  return (
                    <td
                      key={day.date}
                      className="px-1 py-1 text-xs text-muted-foreground/40"
                    >
                      —
                    </td>
                  );
                }
                if (state === "blocked") {
                  return (
                    <td
                      key={day.date}
                      className="px-1 py-1 text-xs text-muted-foreground/60"
                    >
                      ×
                    </td>
                  );
                }
                // available
                const target = slotMap.get(time)!;
                const isSelected = selectedKey === target.startIso;
                return (
                  <td key={day.date} className="px-0.5 py-0.5">
                    <button
                      type="button"
                      onClick={() => setSlot(target)}
                      aria-label={`${day.date} ${time} に予約`}
                      className={
                        "inline-flex h-7 w-full items-center justify-center rounded-md text-xs font-semibold transition-colors " +
                        (isSelected
                          ? "bg-primary text-primary-foreground"
                          : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30")
                      }
                    >
                      {isSelected ? "✓" : "○"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <li className="flex items-center gap-1">
        <span className="font-bold text-emerald-600">○</span> 予約可
      </li>
      <li className="flex items-center gap-1">
        <span>×</span> 予約不可
      </li>
      <li className="flex items-center gap-1">
        <span>—</span> 営業時間外 / 1コマのみ空き
      </li>
      <li className="flex items-center gap-1">
        <span className="text-rose-700">休</span> 定休・臨時休業
      </li>
    </ul>
  );
}

// =============================================================================
// Step 2: お客様情報
// =============================================================================
function CustomerStep({
  customer,
  setCustomer,
  errors,
  clearError,
}: {
  customer: CustomerForm;
  setCustomer: React.Dispatch<React.SetStateAction<CustomerForm>>;
  errors: CustomerErrors;
  clearError: (key: keyof CustomerForm) => void;
}) {
  function update<K extends keyof CustomerForm>(key: K, value: string) {
    setCustomer((c) => ({ ...c, [key]: value }));
    clearError(key);
  }

  return (
    <div className="grid gap-4">
      <FieldGroup id="name" label="お名前" required error={errors.name}>
        <Input
          id="name"
          value={customer.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="山田 太郎"
          autoComplete="name"
        />
      </FieldGroup>

      <FieldGroup
        id="email"
        label="メールアドレス"
        required
        error={errors.email}
        hint="予約番号と確認メールをお送りします。"
      >
        <Input
          id="email"
          type="email"
          value={customer.email}
          onChange={(e) => update("email", e.target.value)}
          placeholder="example@mail.com"
          autoComplete="email"
        />
      </FieldGroup>

      <FieldGroup
        id="phone"
        label="電話番号"
        required
        error={errors.phone}
        hint="当日のご連絡先としてお伺いします。"
      >
        <Input
          id="phone"
          type="tel"
          value={customer.phone}
          onChange={(e) => update("phone", e.target.value)}
          placeholder="090-1234-5678"
          autoComplete="tel"
        />
      </FieldGroup>

      <FieldGroup id="notes" label="ご要望（任意）" error={errors.notes}>
        <Textarea
          id="notes"
          value={customer.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="髪質・スタイルのご希望などあればご記入ください。"
          rows={4}
        />
      </FieldGroup>
    </div>
  );
}

function FieldGroup({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// =============================================================================
// Step 3: 確認
// =============================================================================
function ConfirmStep({
  paymentMethod,
  setPaymentMethod,
  submitError,
}: {
  paymentMethod: PaymentMethod;
  setPaymentMethod: (m: PaymentMethod) => void;
  submitError: string | null;
}) {
  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardContent className="py-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            お支払い
          </p>
          <fieldset className="mt-3 grid gap-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                name="payment_method"
                value="in_store"
                checked={paymentMethod === "in_store"}
                onChange={() => setPaymentMethod("in_store")}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium">店舗払い</span>
                <span className="block text-xs text-muted-foreground">
                  ご来店時に現金またはカードでお支払いいただきます。
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                name="payment_method"
                value="stripe"
                checked={paymentMethod === "stripe"}
                onChange={() => setPaymentMethod("stripe")}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium">
                  オンラインで事前決済（Stripe）
                </span>
                <span className="block text-xs text-muted-foreground">
                  予約確定後、決済画面（Stripe）へ移動します。
                </span>
              </span>
            </label>
          </fieldset>
        </CardContent>
      </Card>

      {submitError && (
        <Alert>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertDescription className="text-xs">
          Webからのキャンセルは予約日の7日前まで可能です。それ以降はお電話にてご連絡ください。
        </AlertDescription>
      </Alert>
    </div>
  );
}

// =============================================================================
// 完了画面
// =============================================================================
function DoneView({
  code,
  email,
  slot,
  menus,
  totalPrice,
}: {
  code: string;
  email: string;
  slot: Slot | null;
  menus: MenuRow[];
  totalPrice: number;
}) {
  // Google カレンダー登録用 URL（UTC 基準の YYYYMMDDTHHMMSSZ 形式）
  const gcalUrl = slot
    ? (() => {
        const fmt = (iso: string) =>
          new Date(iso)
            .toISOString()
            .replace(/[-:]/g, "")
            .replace(/\.\d{3}/, "");
        const params = new URLSearchParams({
          action: "TEMPLATE",
          text: `STONE'S BARBER ご予約（${code}）`,
          dates: `${fmt(slot.startIso)}/${fmt(slot.endIso)}`,
          details: `メニュー: ${menus.map((m) => m.name).join(" + ")}\n予約番号: ${code}`,
          location: "福岡市東区若宮2丁目2-37 永正店舗105 STONE'S BARBER",
        });
        return `https://calendar.google.com/calendar/render?${params.toString()}`;
      })()
    : null;

  function copyCode() {
    navigator.clipboard
      .writeText(code)
      .then(() => toast.success("予約番号をコピーしました"))
      .catch(() => toast.error("コピーできませんでした"));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 py-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary">
              <CheckIcon className="size-4" />
            </span>
            <h2 className="font-heading text-xl font-bold">
              ご予約を承りました
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {email} 宛に確認メールをお送りします。届かない場合は迷惑メールフォルダをご確認ください。
          </p>
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              予約番号（予約の確認・キャンセルに必要です）
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <p className="font-mono text-2xl font-bold tracking-widest">
                {code}
              </p>
              <Button size="sm" variant="outline" onClick={copyCode}>
                コピー
              </Button>
            </div>
          </div>
          {slot && (
            <p className="text-sm">
              <span className="text-muted-foreground">日時:</span>{" "}
              <span className="font-medium">
                {formatHumanJst(new Date(slot.startIso))}
              </span>
            </p>
          )}
          <div className="text-sm">
            <p className="text-muted-foreground">メニュー:</p>
            <ul className="mt-1 space-y-0.5">
              {menus.map((m) => (
                <li key={m.id}>・{m.name}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              合計 {totalPrice.toLocaleString("ja-JP")}円〜（店舗にてお支払い）
            </p>
          </div>
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            キャンセルは予約日の7日前までWebから可能です。それ以降のご変更はお電話（092-231-8037）にてご連絡ください。
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        {gcalUrl && (
          <Button
            render={
              <a href={gcalUrl} target="_blank" rel="noopener noreferrer" />
            }
          >
            <CalendarPlusIcon className="size-4" />
            カレンダーに追加
          </Button>
        )}
        <Button render={<Link href="/reservations/lookup" />} variant="outline">
          予約の確認・変更
        </Button>
        <Button render={<Link href="/" />} variant="ghost">
          トップに戻る
        </Button>
      </div>
    </div>
  );
}
