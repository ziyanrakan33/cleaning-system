import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";

/**
 * Serves defect evidence.
 *
 * Photos are stored in the database and served here rather than written under
 * /public, so that viewing one requires a session and the defects permission —
 * a site photo should not be readable by anyone who guesses a filename.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "defects.view")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const { photoId } = await params;
  const photo = await prisma.defectPhoto.findUnique({ where: { id: photoId } });
  if (!photo) return NextResponse.json({ error: "תמונה לא נמצאה" }, { status: 404 });

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(photo.sizeBytes),
      // Private: the response is user-scoped, so it must not land in a shared cache.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
