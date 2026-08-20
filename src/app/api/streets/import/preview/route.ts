import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { buildImportPreview, parseImportWorkbook } from "@/server/streets/importParsing";

/**
 * Phase 1 of the street import (§4): parse + validate, no writes. The client
 * shows this to the manager and only calls /confirm if they choose to
 * proceed — see docs/PRE_DATA_COMPLETION_PLAN.md IMP-01.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "streets.edit")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const isCsv = file.name.toLowerCase().endsWith(".csv");
  const rows = parseImportWorkbook(buffer, isCsv);
  const preview = await buildImportPreview(rows);

  return NextResponse.json({ filename: file.name, rows, preview });
}
