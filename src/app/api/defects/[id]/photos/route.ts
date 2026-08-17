import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";

/** Large enough for a phone photo, small enough to keep out of the request timeout. */
const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });

  // Either side may attach evidence: the inspector documents the defect, the
  // contractor documents the fix.
  if (!can(session.user.role, "defects.create") && !can(session.user.role, "defects.work")) {
    return NextResponse.json({ error: "אין הרשאה להעלות תמונות" }, { status: 403 });
  }

  const { id } = await params;
  const defect = await prisma.defect.findUnique({
    where: { id },
    select: { id: true, reference: true, status: true },
  });
  if (!defect) return NextResponse.json({ error: "ליקוי לא נמצא" }, { status: 404 });
  if (defect.status === "CLOSED") {
    return NextResponse.json({ error: "לא ניתן להוסיף תמונות לליקוי סגור" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const kindRaw = String(form.get("kind") ?? "BEFORE");
  const caption = form.get("caption") ? String(form.get("caption")) : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
  }
  if (kindRaw !== "BEFORE" && kindRaw !== "AFTER") {
    return NextResponse.json({ error: "סוג תמונה לא תקין" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: "ניתן להעלות תמונות JPEG, PNG או WebP בלבד" },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "הקובץ גדול מ-6MB" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const photo = await prisma.defectPhoto.create({
    data: {
      defectId: id,
      kind: kindRaw,
      mimeType: file.type,
      sizeBytes: bytes.byteLength,
      data: bytes,
      caption,
      uploadedById: session.user.id,
    },
    select: { id: true, kind: true, caption: true, sizeBytes: true, uploadedAt: true },
  });

  await prisma.defectEvent.create({
    data: {
      defectId: id,
      action: kindRaw === "BEFORE" ? "PHOTO_BEFORE_ADDED" : "PHOTO_AFTER_ADDED",
      userId: session.user.id,
      note: caption,
    },
  });

  await audit({
    entityType: "Defect",
    entityId: id,
    action: "ADD_PHOTO",
    userId: session.user.id,
    after: { kind: kindRaw, sizeBytes: bytes.byteLength },
    description: `${defect.reference}: נוספה תמונת ${kindRaw === "BEFORE" ? "לפני" : "אחרי"}`,
  });

  return NextResponse.json(
    { ...photo, uploadedAt: photo.uploadedAt.toISOString() },
    { status: 201 }
  );
}
