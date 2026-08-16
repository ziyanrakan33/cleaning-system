import { PageHeader } from "@/components/page-header";
import { WeeklyBoard } from "./weekly-board";

export default function WeeklyPlanPage() {
  return (
    <div>
      <PageHeader title="לוח שבועי" subtitle="תמונת מצב לשבוע: כלים, משימות וסטטוס תוכנית לכל יום" />
      <WeeklyBoard />
    </div>
  );
}
