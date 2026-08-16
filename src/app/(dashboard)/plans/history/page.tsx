import { PageHeader } from "@/components/page-header";
import { HistoryBrowser } from "./history-browser";
import { formatDateOnly, todayDateOnly } from "@/server/dateUtils";

export default async function PlanHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date = params.date ?? formatDateOnly(todayDateOnly());

  return (
    <div>
      <PageHeader title="היסטוריית גרסאות" subtitle="כל שינוי בתוכנית עבודה יוצר גרסה חדשה — שום מידע לא נמחק" />
      <HistoryBrowser initialDate={date} />
    </div>
  );
}
