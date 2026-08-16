"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type UserRow = { id: string; name: string; email: string; role: string; phone: string | null };

const ROLE_LABEL: Record<string, string> = { ADMIN: "מנהל מערכת", MANAGER: "מבקר", EMPLOYEE: "עובד" };

export function UsersManager({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role, phone: phone || undefined }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error === "email_taken" ? "האימייל כבר בשימוש" : JSON.stringify(body.error));
      }
      setName("");
      setEmail("");
      setPassword("");
      setPhone("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
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
          <input name="tempPassword" value={password} onChange={(e) => setPassword(e.target.value)} type="text" required dir="ltr" minLength={6} className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">תפקיד</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none">
            <option value="EMPLOYEE">עובד</option>
            <option value="MANAGER">מבקר</option>
            <option value="ADMIN">מנהל מערכת</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">טלפון</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="w-32 rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent" />
        </div>
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
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-panel-border/60">
              <td className="px-4 py-2">{u.name}</td>
              <td className="px-4 py-2 text-muted" dir="ltr">{u.email}</td>
              <td className="px-4 py-2 text-muted">{ROLE_LABEL[u.role] ?? u.role}</td>
              <td className="px-4 py-2 text-muted" dir="ltr">{u.phone ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
