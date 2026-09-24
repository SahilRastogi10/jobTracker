"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/LanguageProvider";
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
  const { t } = useI18n();
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
      setError(getErrorMessage(loadError, t("reminders.errLoadApps")));
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
      setError(getErrorMessage(loadError, t("reminders.errLoad")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setError(null);
    void loadApps();
    // Reload on data changes only; switching language needs no refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setError(getErrorMessage(submitError, t("reminders.errAdd")));
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
      setError(getErrorMessage(updateError, t("reminders.errUpdate")));
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
      setError(getErrorMessage(deleteError, t("reminders.errDelete")));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <PageFrame
      eyebrow={t("reminders.eyebrow")}
      title={t("reminders.title")}
      subtitle={t("reminders.subtitle")}
      actions={loading ? <div className="badge badge-neutral">{t("common.loading")}</div> : null}
    >
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel-card space-y-4">
        <div>
          <h2 className="section-title">{t("reminders.create")}</h2>
          <p className="section-subtitle">
            {t("reminders.createHelp")}
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.9fr_0.9fr_1.3fr_1.2fr_auto]">
          <div>
            <label className="field-label" htmlFor="date">
              {t("common.date")}
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
              {t("common.time")}
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
              {t("common.message")}
            </label>
            <input
              id="message"
              className="field-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("reminders.messagePlaceholder")}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="application">
              {t("reminders.linked")}
            </label>
            <select
              id="application"
              className="field-select"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
              disabled={appsLoading}
            >
              <option value="">{t("common.none")}</option>
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
              {submitting ? t("common.adding") : t("common.add")}
            </button>
          </div>
        </div>
      </section>

      <section className="panel-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">{t("reminders.selectedDate", { date })}</h2>
            <p className="section-subtitle">
              {t("reminders.inlineHelp")}
            </p>
          </div>
          {loading ? <div className="badge badge-neutral">{t("common.loading")}</div> : null}
        </div>

        {loading && items.length === 0 ? (
          <div className="empty-state">{t("reminders.loadingList")}</div>
        ) : items.length === 0 ? (
          <div className="empty-state">{t("reminders.noneForDate")}</div>
        ) : (
          <ul className="space-y-3">
            {items.map((reminder) => (
              <li
                key={reminder.id}
                className={`list-card space-y-3 ${reminder.done ? "opacity-70" : ""}`}
              >
                <div className="grid gap-3 md:grid-cols-[0.85fr_0.8fr_1.5fr]">
                  <div>
                    <label className="field-label">{t("common.date")}</label>
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
                    <label className="field-label">{t("common.time")}</label>
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
                    <label className="field-label">{t("common.message")}</label>
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
                      {reminder.done ? t("reminders.statusDone") : t("reminders.statusPending")}
                    </div>

                    {reminder.application ? (
                      <Link
                        className="subtle-link"
                        href={`/applications/${reminder.application.id}`}
                      >
                        {reminder.application.company} | {reminder.application.role}
                      </Link>
                    ) : (
                      <div className="section-subtitle">{t("reminders.noLinked")}</div>
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
                        ? t("common.saving")
                        : reminder.done
                          ? t("common.undo")
                          : t("common.done")}
                    </button>
                    <button
                      className="app-button"
                      onClick={() => remove(reminder.id)}
                      disabled={deletingId === reminder.id}
                    >
                      {deletingId === reminder.id ? t("common.deleting") : t("common.delete")}
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
