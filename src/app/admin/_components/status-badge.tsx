import { Badge } from "@/components/ui/badge";
import type { ReservationStatus } from "@/types/database";

const LABELS: Record<
  ReservationStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "受付中", variant: "secondary" },
  confirmed: { label: "確定", variant: "default" },
  completed: { label: "完了", variant: "outline" },
  cancelled: { label: "キャンセル", variant: "destructive" },
  no_show: { label: "未来店", variant: "destructive" },
};

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const { label, variant } = LABELS[status] ?? { label: status, variant: "secondary" };
  return <Badge variant={variant}>{label}</Badge>;
}
