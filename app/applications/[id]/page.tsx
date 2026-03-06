"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Application = {
  id: string;
  company: string;
  role: string;
  link?: string | null;
  stage: string;
  dateApplied: string; // YYYY-MM-DD
  notes?: string | null;
  followUpDate?: string | null; // YYYY-MM-DD
};

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [item, setItem] = useState<Application | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingFU, setCreatingFU] = useState(false);

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

  async function quickFollowUp() {
    if (!item) return;
    setCreatingFU(true);

    const followDate = item.followUpDate ?? addDays(item.dateApplied, 7);

    // If followUpDate was empty, save it
    if (!item.followUpDate) {
      const res = await fetch(`/api/applications/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followUpDate: followDate }),
      });
      if (res.ok) {
        const data = await res.json();
        setItem(data.item);
      }
    }

    // Create reminder linked to application
    await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: followDate,
        time: "09:00",
        message: `Follow up: ${item.company} | ${item.role}`,
        applicationId: item.id,
      }),
    });

    setCreatingFU(false);
    alert(`Follow up reminder created for ${followDate}`);
  }

  if (!id) return <main className="p-6 max-w-3xl mx-auto">Loading...</main>;
  if (!item) return <main className="p-6 max-w-3xl mx-auto">Loading...</main>;

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Edit</h1>

        <div className="flex gap-3 flex-wrap">
          <a className="underline text-sm" href="/">
            Home
          </a>
          <a className="underline text-sm" href="/calendar">
            Calendar
          </a>
          <a className="underline text-sm" href="/reminders">
            Reminders
          </a>
          <a className="underline text-sm" href="/applications">
            Back
          </a>
        </div>
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
          <label className="text-sm opacity-70">Applied date</label>
          <input
            className="border rounded px-3 py-2"
            type="date"
            value={item.dateApplied}
            onChange={(e) => setItem({ ...item, dateApplied: e.target.value })}
            onBlur={() => save({ dateApplied: item.dateApplied })}
          />
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

        <div className="border rounded p-3 space-y-2">
          <div className="font-medium">Quick follow up</div>
          <div className="text-sm opacity-70">
            Creates a reminder for the follow up date. If empty, uses applied date + 7 days.
          </div>
          <button
            className="border rounded px-3 py-2"
            onClick={quickFollowUp}
            disabled={creatingFU}
          >
            {creatingFU ? "Creating..." : "Create follow up reminder"}
          </button>
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