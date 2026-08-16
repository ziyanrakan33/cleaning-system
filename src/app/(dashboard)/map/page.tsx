import { PageHeader } from "@/components/page-header";
import { AdminMap } from "./admin-map";

export default function MapPage() {
  return (
    <div className="flex h-screen flex-col">
      <PageHeader title="מפת מנהל" subtitle="אזורים, רחובות ומשימות היום — נתונים אמיתיים של כפר סבא" />
      <AdminMap />
    </div>
  );
}
