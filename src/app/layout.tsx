import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { getOrganizationSettings } from "@/server/settings/service";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const org = await getOrganizationSettings();
  return {
    title: `מערכת ניקיון עירוני – ${org.name}`,
    description: `ניהול, תכנון ובקרה של תוכנית הניקיון העירונית של ${org.name}`,
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
