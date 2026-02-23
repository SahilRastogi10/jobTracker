"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Application = {
  id: string;
  company: string;
  role: string;
  link?: string | null;
  stage: string;
  dateApplied: string;
  notes?: string | null;
  followUpDate?: string | null;
};

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [item, setItem] = useState<Application | null>(null);
  const [saving, setSaving] = useState(false);

  async function load(appId: string) {
    const res = await fetch(`/api/applications/${appId}`);
    if (!res.ok) {
      setItem(null);
      return;
    }
    const data = await res.json();
    setItem(data.item ?? null);
  }

  useEffect(() => {
    if (!id) return;
    load(id);
  }, [id]);

  async function save(patch: Partial<Application>) {
    if (!item) return;
    setSaving(true);
    const res = await fetch(`/api/applications/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      setItem(data.item);
    }
  }

  async function remove() {
    if (!item) return;
    if (!confirm("Delete this application?")) return;
    await fetch(`/api/applications/${item.id}`, { method: "DELETE" });
    router.push("/applications");
  }

  if (!id) return <main className="p-6 max-w-3xl mx-auto">Loading...</main>;
  if (!item) return <main className="p-6 max-w-3xl mx-auto">Loading...</main>;

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Edit</h1>
        <a className="underline text-sm" href="/applications">
          Back
        </a>
      </div>

      <section className="border rounded p-4 space-y-3">
        <div className="grid gap-2">
          <label className="text-sm opacity-70">Company</label>
          <input
            className="border rounded px-3 py-2"
            value={item.company}
            onChange={(e) => setItem({ ...item, company: e.target.value })}
            onBlur={() => save({ company: item.company })}
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm opacity-70">Role</label>
          <input
            className="border rounded px-3 py-2"
            value={item.role}
            onChange={(e) => setItem({ ...item, role: e.target.value })}
            onBlur={() => save({ role: item.role })}
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm opacity-70">Link</label>
          <input
            className="border rounded px-3 py-2"
            value={item.link ?? ""}
            onChange={(e) => setItem({ ...item, link: e.target.value })}
            onBlur={() => save({ link: item.link ?? "" })}
            placeholder="https://..."
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm opacity-70">Stage</label>
          <select
            className="border rounded px-3 py-2"
            value={item.stage}
            onChange={(e) => {
              const v = e.target.value;
              setItem({ ...item, stage: v });
              save({ stage: v });
            }}
          >
            <option value="applied">applied</option>
            <option value="interview">interview</option>
            <option value="rejected">rejected</option>
            <option value="offer">offer</option>
          </select>
        </div>

        <div className="grid gap-2">
          <label className="text-sm opacity-70">Follow up date</label>
          <input
            className="border rounded px-3 py-2"
            type="date"
            value={item.followUpDate ?? ""}
            onChange={(e) => setItem({ ...item, followUpDate: e.target.value })}
            onBlur={() => save({ followUpDate: item.followUpDate ?? "" })}
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm opacity-70">Notes</label>
          <textarea
            className="border rounded px-3 py-2 min-h-[120px]"
            value={item.notes ?? ""}
            onChange={(e) => setItem({ ...item, notes: e.target.value })}
            onBlur={() => save({ notes: item.notes ?? "" })}
          />
        </div>

        <div className="flex items-center justify-between">
          <button className="border rounded px-3 py-2" onClick={remove}>
            Delete
          </button>
          <div className="text-sm opacity-70">{saving ? "Saving..." : ""}</div>
        </div>
      </section>
    </main>
  );
}