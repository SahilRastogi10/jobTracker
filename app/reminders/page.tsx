"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageFrame } from "@/components/PageFrame";
import { localYYYYMMDD } from "@/lib/localDate";

type AppLite = {
  id: string;
  company: string;
  role: string;
  stage: string;
  dateApplied: string;
};

type Reminder = {
  id: string;
  date: string;
  time: string;
  message: string;
  done: boolean;
  applicationId?: string | null;
  application?: { id: string; company: string; role: string } | null;
};

type AppListResponse = {
  items: AppLite[];
};

type ReminderListResponse = {
  items: Reminder[];
};

async function readJson(res: Response) {
  const text = await res.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = await readJson(res);

  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "Request failed."
    );
  }

  return data as T;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function RemindersPage() {
  const [date, setDate] = useState(localYYYYMMDD());
  const [items, setItems] = useState<Reminder[]>([]);
  const [apps, setApps] = useState<AppLite[]>([]);

  const [time, setTime] = useState("09:00");
  const [message, setMessage] = useState("");
  const [applicationId, setApplicationId] = useState("");

  const [loading, setLoading] = useState(true);
  const [appsLoading, setAppsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadApps() {
    setAppsLoading(true);

    try {
      const data = await requestJson<AppListResponse>("/api/applications/simple");
      setApps(data.items ?? []);
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Could not load applications."));
    } finally {
      setAppsLoading(false);
    }
  }

  async function loadReminders(nextDate = date) {
    setLoading(true);

    try {
      const data = await requestJson<ReminderListResponse>(
        `/api/reminders?date=${encodeURIComponent(nextDate)}`
      );
      setItems(data.items ?? []);
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Could not load reminders."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setError(null);
    void loadApps();
  }, []);

  useEffect(() => {
    setError(null);
    void loadReminders(date);
  }, [date]);

  async function add() {
    setError(null);
    setSubmitting(true);

    try {
      await requestJson("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          time,
          message,
          applicationId: applicationId || null,
        }),
      });

      setMessage("");
      setApplicationId("");
      await loadReminders(date);
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Could not add reminder."));
    } finally {
      setSubmitting(false);
    }
  }

  async function updateReminder(id: string, patch: Partial<Reminder>) {
    setError(null);
    setSavingId(id);

    try {
      await requestJson(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      await loadReminders(date);
    } catch (updateError) {
      setError(getErrorMessage(updateError, "Could not update reminder."));
    } finally {
      setSavingId(null);
    }
  }

  async function remove(id: string) {
    setError(null);
    setDeletingId(id);

    try {
      await requestJson(`/api/reminders/${id}`, { method: "DELETE" });
      await loadReminders(date);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Could not delete reminder."));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <PageFrame
      title="Reminders"
      subtitle="Manage one day at a time, edit details inline, and keep every reminder tied back to the right application."
      actions={loading ? <div className="badge badge-neutral">Loading...</div> : null}
    >
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel-card space-y-4">
        <div>
          <h2 className="section-title">Create reminder</h2>
          <p className="section-subtitle">
            Add a reminder for any date and optionally attach it to an application.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.9fr_0.9fr_1.3fr_1.2fr_auto]">
          <div>
            <label className="field-label" htmlFor="date">
              Date
            </label>
            <input
              id="date"
              type="date"
              className="field-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="time">
              Time
            </label>
            <input
              id="time"
              type="time"
              className="field-input"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="message">
              Message
            </label>
            <input
              id="message"
              className="field-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Follow up with recruiter"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="application">
              Linked application
            </label>
            <select
              id="application"
              className="field-select"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
              disabled={appsLoading}
            >
              <option value="">None</option>
              {apps.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.company} | {application.role}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              className="app-button w-full"
              onClick={add}
              disabled={!message.trim() || submitting}
            >
              {submitting ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      </section>

      <section className="panel-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Selected date: {date}</h2>
            <p className="section-subtitle">
              Edit date, time, or message inline and the change will save on blur.
            </p>
          </div>
          {loading ? <div className="badge badge-neutral">Loading...</div> : null}
        </div>

        {loading && items.length === 0 ? (
          <div className="empty-state">Loading reminders...</div>
        ) : items.length === 0 ? (
          <div className="empty-state">No reminders for this date.</div>
        ) : (
          <ul className="space-y-3">
            {items.map((reminder) => (
              <li
                key={reminder.id}
                className={`list-card space-y-3 ${reminder.done ? "opacity-70" : ""}`}
              >
                <div className="grid gap-3 md:grid-cols-[0.85fr_0.8fr_1.5fr]">
                  <div>
                    <label className="field-label">Date</label>
                    <input
                      className="field-input"
                      type="date"
                      value={reminder.date}
                      onChange={(e) => {
                        const nextDate = e.target.value;
                        setItems((prev) =>
                          prev.map((item) =>
                            item.id === reminder.id ? { ...item, date: nextDate } : item
                          )
                        );
                      }}
                      onBlur={() => updateReminder(reminder.id, { date: reminder.date })}
                    />
                  </div>

                  <div>
                    <label className="field-label">Time</label>
                    <input
                      className="field-input"
                      type="time"
                      value={reminder.time}
                      onChange={(e) => {
                        const nextTime = e.target.value;
                        setItems((prev) =>
                          prev.map((item) =>
                            item.id === reminder.id ? { ...item, time: nextTime } : item
                          )
                        );
                      }}
                      onBlur={() => updateReminder(reminder.id, { time: reminder.time })}
                    />
                  </div>

                  <div>
                    <label className="field-label">Message</label>
                    <input
                      className="field-input"
                      value={reminder.message}
                      onChange={(e) => {
                        const nextMessage = e.target.value;
                        setItems((prev) =>
                          prev.map((item) =>
                            item.id === reminder.id
                              ? { ...item, message: nextMessage }
                              : item
                          )
                        );
                      }}
                      onBlur={() =>
                        updateReminder(reminder.id, {
                          message: reminder.message,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-2">
                    <div className="badge badge-neutral">
                      {reminder.done ? "done" : "pending"}
                    </div>

                    {reminder.application ? (
                      <Link
                        className="subtle-link"
                        href={`/applications/${reminder.application.id}`}
                      >
                        {reminder.application.company} | {reminder.application.role}
                      </Link>
                    ) : (
                      <div className="section-subtitle">No linked application</div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="app-button-secondary"
                      onClick={() =>
                        updateReminder(reminder.id, { done: !reminder.done })
                      }
                      disabled={savingId === reminder.id}
                    >
                      {savingId === reminder.id
                        ? "Saving..."
                        : reminder.done
                          ? "Undo"
                          : "Done"}
                    </button>
                    <button
                      className="app-button"
                      onClick={() => remove(reminder.id)}
                      disabled={deletingId === reminder.id}
                    >
                      {deletingId === reminder.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageFrame>
  );
}
