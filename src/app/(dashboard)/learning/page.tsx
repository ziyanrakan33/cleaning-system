import { PageHeader } from "@/components/page-header";
import { LearningClient } from "./learning-client";

export const dynamic = "force-dynamic";

export default function LearningPage() {
  return (
    <div>
      <PageHeader
        title="למידה מנתוני הביצוע"
        subtitle="כל שינוי שהמערכת ביצעה בעצמה בערך ממוצע, על סמך אילו דיווחים, ואפשרות לבטל דגימה שגויה (§17)"
      />
      <LearningClient />
    </div>
  );
}
