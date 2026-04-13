"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageFrame } from "@/components/PageFrame";

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

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function stageBadgeClass(stage: string) {
  switch (stage) {
    case "interview":
      return "badge badge-interview";
    case "offer":
      return "badge badge-offer";
    case "rejected":
      return "badge badge-rejected";
    case "applied":
    default:
      return "badge badge-applied";
  }
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
    void load(id);
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

    const checkRes = await fetch(
      `/api/reminders/exists?applicationId=${encodeURIComponent(
        item.id
      )}&date=${encodeURIComponent(followDate)}`
    );
    const checkData = await checkRes.json();

    if (checkData.exists) {
      setCreatingFU(false);
      alert("A follow up reminder already exists for this date.");
      return;
    }

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

  if (!id) {
    return (
      <PageFrame
        title="Loading application"
        subtitle="Pulling application details into the editor."
      >
        <section className="panel-card">
          <div className="empty-state">Loading...</div>
        </section>
      </PageFrame>
    );
  }

  if (!item) {
    return (
      <PageFrame
        title="Application not found"
        subtitle="The record could not be loaded."
        actions={
          <Link href="/applications" className="app-button-secondary">
            Back to Applications
          </Link>
        }
      >
        <section className="panel-card">
          <div className="empty-state">Loading...</div>
        </section>
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title={`${item.company}`}
      subtitle="Edit the record, keep follow-up timing tight, and capture notes while the context is fresh."
      actions={
        <>
          <span className={stageBadgeClass(item.stage)}>{item.stage}</span>
          <Link href="/applications" className="app-button-secondary">
            Back
          </Link>
        </>
      }
    >
      <section className="panel-card space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="company">
              Company
            </label>
            <input
              id="company"
              className="field-input"
              value={item.company}
              onChange={(e) => setItem({ ...item, company: e.target.value })}
              onBlur={() => save({ company: item.company })}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="role">
              Role
            </label>
            <input
              id="role"
              className="field-input"
              value={item.role}
              onChange={(e) => setItem({ ...item, role: e.target.value })}
              onBlur={() => save({ role: item.role })}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="link">
              Job Link
            </label>
            <input
              id="link"
              className="field-input"
              value={item.link ?? ""}
              onChange={(e) => setItem({ ...item, link: e.target.value })}
              onBlur={() => save({ link: item.link ?? "" })}
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="field-label" htmlFor="stage">
              Stage
            </label>
            <select
              id="stage"
              className="field-select"
              value={item.stage}
              onChange={(e) => {
                const value = e.target.value;
                setItem({ ...item, stage: value });
                void save({ stage: value });
              }}
            >
              <option value="applied">applied</option>
              <option value="interview">interview</option>
              <option value="rejected">rejected</option>
              <option value="offer">offer</option>
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="date-applied">
              Applied Date
            </label>
            <input
              id="date-applied"
              className="field-input"
              type="date"
              value={item.dateApplied}
              onChange={(e) => setItem({ ...item, dateApplied: e.target.value })}
              onBlur={() => save({ dateApplied: item.dateApplied })}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="follow-up-date">
              Follow-up Date
            </label>
            <input
              id="follow-up-date"
              className="field-input"
              type="date"
              value={item.followUpDate ?? ""}
              onChange={(e) => setItem({ ...item, followUpDate: e.target.value })}
              onBlur={() => save({ followUpDate: item.followUpDate ?? "" })}
            />
          </div>
        </div>

        <div className="list-card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="section-title">Quick follow-up</div>
              <p className="section-subtitle">
                Create a linked reminder using the existing follow-up date, or default to seven days after applying.
              </p>
            </div>

            <button
              className="app-button"
              onClick={quickFollowUp}
              disabled={creatingFU}
            >
              {creatingFU ? "Creating..." : "Create reminder"}
            </button>
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            className="field-textarea"
            value={item.notes ?? ""}
            onChange={(e) => setItem({ ...item, notes: e.target.value })}
            onBlur={() => save({ notes: item.notes ?? "" })}
          />
        </div>

        <div className="soft-divider" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button className="app-button-secondary" onClick={remove}>
            Delete application
          </button>
          <div className="badge badge-neutral">{saving ? "Saving..." : "All changes saved"}</div>
        </div>
      </section>
    </PageFrame>
  );
}
