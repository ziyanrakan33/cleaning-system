"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

type UserRow = { id: string; name: string; email: string; role: string; phone: string | null; contractAreaId: string | null };
type ContractAreaRow = { id: string; name: string; areaNumber: number };

// MANAGER is a legacy role kept only so old accounts keep working — new users
// are never created with it, so it is left out of the create-form dropdown.
const ASSIGNABLE_ROLES: Role[] = [
  "EMPLOYEE",
  "SITE_SUPERVISOR",
  "CONTRACTOR_MANAGER",
  "INSPECTOR",
  "DEPT_MANAGER",
  "CITY_MANAGER",
  "FINANCE",
  "VIEWER",
  "ADMIN",
];

// Only these two roles are restricted to a single contract area's data (see
// src/server/scope.ts) — the field is meaningless for every other role.
const CONTRACT_AREA_SCOPED_ROLES = new Set(["CONTRACTOR_MANAGER", "SITE_SUPERVISOR"]);

export function UsersManager({ users, contractAreas }: { users: UserRow[]; contractAreas: ContractAreaRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [phone, setPhone] = useState("");
  const [contractAreaId, setContractAreaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          phone: phone || undefined,
          contractAreaId: CONTRACT_AREA_SCOPED_ROLES.has(role) && contractAreaId ? contractAreaId : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error === "email_taken" ? "האימייל כבר בשימוש" : JSON.stringify(body.error));
      }
      setName("");
      setEmail("");
      setPassword("");
      setPhone("");
      setContractAreaId("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function assignContractArea(userId: string, newContractAreaId: string) {
    setAssigning(userId);
    try {
      await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractAreaId: newContractAreaId || null }),
      });
      router.refresh();
    } finally {
      setAssigning(null);
    }
  }

  return (
    <div className="p-6">
      <form onSubmit={createUser} className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-panel-border bg-panel p-4">
        <div>
          <label className="mb-1 block text-xs text-muted">שם מלא</label>
          <input name="fullName" value={name} onChange={(e) => setName(e.target.value)} required className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">אימייל</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required dir="ltr" className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">סיסמה זמנית</label>
          <input name="tempPassword" value={password} onChange={(e) => setPassword(e.target.value)} type="text" required dir="ltr" minLength={10} className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">תפקיד</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none">
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">טלפון</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="w-32 rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent" />
        </div>
        {CONTRACT_AREA_SCOPED_ROLES.has(role) && (
          <div>
            <label className="mb-1 block text-xs text-muted">אזור מכרז</label>
            <select
              value={contractAreaId}
              onChange={(e) => setContractAreaId(e.target.value)}
              className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none"
            >
              <option value="">— לא משויך (ללא גישה עד לשיוך) —</option>
              {contractAreas.map((ca) => (
                <option key={ca.id} value={ca.id}>אזור מכרז {ca.areaNumber} — {ca.name}</option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" disabled={saving} className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50">
          הוסף משתמש
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </form>

      <table className="w-full overflow-hidden rounded-xl border border-panel-border bg-panel text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-panel-border">
            <th className="px-4 py-2 text-start font-medium">שם</th>
            <th className="px-4 py-2 text-start font-medium">אימייל</th>
            <th className="px-4 py-2 text-start font-medium">תפקיד</th>
            <th className="px-4 py-2 text-start font-medium">טלפון</th>
            <th className="px-4 py-2 text-start font-medium">אזור מכרז</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-panel-border/60">
              <td className="px-4 py-2">{u.name}</td>
              <td className="px-4 py-2 text-muted" dir="ltr">{u.email}</td>
              <td className="px-4 py-2 text-muted">{ROLE_LABELS[u.role as Role] ?? u.role}</td>
              <td className="px-4 py-2 text-muted" dir="ltr">{u.phone ?? "—"}</td>
              <td className="px-4 py-2 text-muted">
                {CONTRACT_AREA_SCOPED_ROLES.has(u.role) ? (
                  <select
                    value={u.contractAreaId ?? ""}
                    disabled={assigning === u.id}
                    onChange={(e) => assignContractArea(u.id, e.target.value)}
                    className="rounded-md border border-panel-border bg-transparent px-2 py-1 text-xs outline-none disabled:opacity-50"
                  >
                    <option value="">לא משויך — ללא גישה</option>
                    {contractAreas.map((ca) => (
                      <option key={ca.id} value={ca.id}>אזור {ca.areaNumber} — {ca.name}</option>
                    ))}
                  </select>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
