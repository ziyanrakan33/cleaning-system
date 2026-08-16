import { StreetsMap } from "@/components/map/streets-map";
import { PageHeader } from "@/components/page-header";

export default function MapPage() {
  return (
    <div className="flex h-screen flex-col">
      <PageHeader title="מפת מנהל" subtitle="אזורים ורחובות אמיתיים של כפר סבא (מבוסס OpenStreetMap)" />
      <div className="flex-1">
        <StreetsMap />
      </div>
    </div>
  );
}
