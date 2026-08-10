/**
 * 予約フォームの入力検証スキーマ。
 * フォーム / Server Action / RPC 呼び出しの境界で使う。
 */
import { z } from "zod";

export const customerInfoSchema = z.object({
  name: z
    .string()
    .min(1, "お名前を入力してください")
    .max(50, "50文字以内で入力してください"),
  email: z
    .string()
    .min(1, "メールアドレスを入力してください")
    .email("メールアドレスの形式が正しくありません")
    .max(120),
  phone: z
    .string()
    .min(1, "電話番号を入力してください")
    .regex(/^[0-9-+() ]{8,20}$/, "電話番号の形式が正しくありません"),
  notes: z.string().max(500).optional().nullable(),
});

export type CustomerInfo = z.infer<typeof customerInfoSchema>;

export const createReservationInputSchema = z.object({
  menuIds: z
    .array(z.string().uuid())
    .min(1, "メニューを1つ以上選択してください")
    .max(10),
  startAtIso: z.string().datetime(),
  endAtIso: z.string().datetime(),
  customer: customerInfoSchema,
  paymentMethod: z.enum(["in_store", "stripe"]).default("in_store"),
});

export type CreateReservationInput = z.infer<typeof createReservationInputSchema>;

export const lookupReservationSchema = z.object({
  code: z
    .string()
    .min(1, "予約番号を入力してください")
    .max(40)
    .transform((s) => s.trim().toUpperCase()),
  email: z
    .string()
    .min(1, "メールアドレスを入力してください")
    .email("メールアドレスの形式が正しくありません")
    .transform((s) => s.trim().toLowerCase()),
});

export type LookupReservationInput = z.infer<typeof lookupReservationSchema>;
