import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "users.manage")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const users = await prisma.user.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, phone: true },
  });
  return NextResponse.json(users);
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum([
    "ADMIN",
    "MANAGER",
    "CITY_MANAGER",
    "DEPT_MANAGER",
    "INSPECTOR",
    "CONTRACTOR_MANAGER",
    "SITE_SUPERVISOR",
    "EMPLOYEE",
    "VIEWER",
    "FINANCE",
  ]),
  phone: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "users.manage")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return NextResponse.json({ error: "email_taken" }, { status: 409 });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role,
      phone: parsed.data.phone,
    },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json(user, { status: 201 });
}
