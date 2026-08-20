import { PageHeader } from "@/components/page-header";
import { getOrganizationSettings } from "@/server/settings/service";
import { AdminMap } from "./admin-map";

export default async function MapPage() {
  const org = await getOrganizationSettings();
  return (
    <div className="flex h-screen flex-col">
      <PageHeader title="מפת מנהל" subtitle={`אזורים, רחובות ומשימות היום — נתונים אמיתיים של ${org.name}`} />
      <AdminMap />
    </div>
  );
}
