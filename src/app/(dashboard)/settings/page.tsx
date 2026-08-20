import { PageHeader } from "@/components/page-header";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="הגדרות ומשקלים"
        subtitle="משקלי ציון הלכלוך (§2) ופונקציית עלות המסלול (§11) — ניתנים לעריכה, כל שינוי נרשם ב-Audit Log"
      />
      <SettingsClient />
    </div>
  );
}
