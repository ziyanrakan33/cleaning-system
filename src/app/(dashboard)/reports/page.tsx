import { PageHeader } from "@/components/page-header";
import { ReportsIndex } from "./reports-index";

export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="דוחות" subtitle="הפקת דוחות והפקה ל-Excel/הדפסה/PDF" />
      <ReportsIndex />
    </div>
  );
}
