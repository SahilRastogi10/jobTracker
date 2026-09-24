"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { TODAY_CHANGED_EVENT } from "@/components/AppNav";
import { useI18n } from "@/components/LanguageProvider";
import { PageFrame } from "@/components/PageFrame";
import { localYYYYMMDD } from "@/lib/localDate";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function firstDayOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1);
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0);
}

function parseYmd(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

type DayApp = {
  id: string;
  company: string;
  role: string;
  stage: string;
  dateApplied: string;
};

type DayReminder = {
  id: string;
  date: string;
  time: string;
  message: string;
  done: boolean;
  application?: { id: string; company: string; role: string } | null;
};

type DayFollowUp = {
  id: string;
  dueDate: string;
  channel: string;
  status: string;
  application: { id: string; company: string; role: string };
  recruiter?: { name?: string | null; email?: string | null } | null;
};

type AppLite = {
  id: string;
  company: string;
  role: string;
};

type CalendarCountsResponse = {
  appsByDate: Record<string, number>;
  remsByDate: Record<string, number>;
  followUpsByDate: Record<string, number>;
  notedDates: string[];
};

type CalendarDayResponse = {
  applications: DayApp[];
  reminders: DayReminder[];
  followUps: DayFollowUp[];
  note: string;
};

type ComposerTab = "reminder" | "note" | "application";

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Request failed.");
  }

  return data as T;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function CalendarPage() {
  const { t, tValue, dateLocale } = useI18n();
  const todayStr = localYYYYMMDD();
  const todayDate = useMemo(() => parseYmd(todayStr), [todayStr]);

  const [year, setYear] = useState(todayDate.getFullYear());
  const [monthIndex, setMonthIndex] = useState(todayDate.getMonth());

  const [appsByDate, setAppsByDate] = useState<Record<string, number>>({});
  const [remsByDate, setRemsByDate] = useState<Record<string, number>>({});
  const [followUpsByDate, setFollowUpsByDate] = useState<Record<string, number>>({});
  const [notedDates, setNotedDates] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const [dayApps, setDayApps] = useState<DayApp[]>([]);
  const [dayRems, setDayRems] = useState<DayReminder[]>([]);
  const [dayFollowUps, setDayFollowUps] = useState<DayFollowUp[]>([]);
  const [appsLite, setAppsLite] = useState<AppLite[]>([]);

  const [countsLoading, setCountsLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(true);
  const [busyReminderId, setBusyReminderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<ComposerTab>("reminder");
  const [remMsg, setRemMsg] = useState("");
  const [remTime, setRemTime] = useState("09:00");
  const [remAppId, setRemAppId] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "saved">("idle");
  const noteTimer = useRef<number | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  const monthStart = useMemo(() => ymd(firstDayOfMonth(year, monthIndex)), [year, monthIndex]);
  const monthEnd = useMemo(() => ymd(lastDayOfMonth(year, monthIndex)), [year, monthIndex]);

  const monthLabel = useMemo(
    () =>
      new Date(year, monthIndex, 1).toLocaleString(dateLocale, { month: "long", year: "numeric" }),
    [year, monthIndex, dateLocale]
  );

  // 2023-01-01 was a Sunday, so these are Sun..Sat in the active language.
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        new Date(2023, 0, 1 + index).toLocaleDateString(dateLocale, { weekday: "short" })
      ),
    [dateLocale]
  );

  async function loadCounts() {
    setCountsLoading(true);

    try {
      const data = await requestJson<CalendarCountsResponse>(
        `/api/calendar?start=${monthStart}&end=${monthEnd}`
      );
      setAppsByDate(data.appsByDate ?? {});
      setRemsByDate(data.remsByDate ?? {});
      setFollowUpsByDate(data.followUpsByDate ?? {});
      setNotedDates(new Set(data.notedDates ?? []));
    } catch (loadError) {
      setError(getErrorMessage(loadError, t("calendar.errCounts")));
    } finally {
      setCountsLoading(false);
    }
  }

  async function loadDay(dateStr: string) {
    setDayLoading(true);

    try {
      const data = await requestJson<CalendarDayResponse>(
        `/api/calendar/day?date=${encodeURIComponent(dateStr)}`
      );
      setDayApps(data.applications ?? []);
      setDayRems(data.reminders ?? []);
      setDayFollowUps(data.followUps ?? []);
      setNote(data.note ?? "");
      setNoteStatus("idle");
    } catch (loadError) {
      setError(getErrorMessage(loadError, t("calendar.errDay")));
    } finally {
      setDayLoading(false);
    }
  }

  useEffect(() => {
    setError(null);
    void loadCounts();
    // Reload on data changes only; switching language needs no refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart, monthEnd]);

  useEffect(() => {
    if (!selectedDate) return;
    setError(null);
    void loadDay(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useEffect(() => {
    requestJson<{ items: AppLite[] }>("/api/applications/simple")
      .then((data) => setAppsLite(data.items ?? []))
      .catch(() => setAppsLite([]));
    return () => {
      if (noteTimer.current) window.clearTimeout(noteTimer.current);
    };
  }, []);

  const days = useMemo(() => {
    const first = firstDayOfMonth(year, monthIndex);
    const totalDays = lastDayOfMonth(year, monthIndex).getDate();
    const cells: Array<{ dateStr: string | null; dayNum: number | null }> = [];

    for (let i = 0; i < first.getDay(); i++) cells.push({ dateStr: null, dayNum: null });
    for (let day = 1; day <= totalDays; day++) {
      cells.push({ dateStr: ymd(new Date(year, monthIndex, day)), dayNum: day });
    }
    while (cells.length % 7 !== 0) cells.push({ dateStr: null, dayNum: null });

    return cells;
  }, [year, monthIndex]);

  function selectDay(dateStr: string) {
    setSelectedDate(dateStr);
    // On narrow screens the panel sits below the grid, so bring it into view.
    if (window.matchMedia("(max-width: 1279px)").matches) {
      requestAnimationFrame(() =>
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    }
  }

  function goToMonth(offset: number) {
    const d = new Date(year, monthIndex + offset, 1);
    setYear(d.getFullYear());
    setMonthIndex(d.getMonth());
    setSelectedDate(ymd(d));
  }

  function goToday() {
    setYear(todayDate.getFullYear());
    setMonthIndex(todayDate.getMonth());
    setSelectedDate(todayStr);
  }

  async function refreshAfterChange() {
    await Promise.all([loadDay(selectedDate), loadCounts()]);
  }

  async function toggleReminder(id: string, done: boolean) {
    setError(null);
    setBusyReminderId(id);

    try {
      await requestJson(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
      await loadDay(selectedDate);
    } catch (toggleError) {
      setError(getErrorMessage(toggleError, t("calendar.errReminder")));
    } finally {
      setBusyReminderId(null);
    }
  }

  async function deleteReminder(id: string) {
    setError(null);
    setBusyReminderId(id);

    try {
      await requestJson(`/api/reminders/${id}`, { method: "DELETE" });
      await refreshAfterChange();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, t("reminders.errDelete")));
    } finally {
      setBusyReminderId(null);
    }
  }

  async function addReminder() {
    setSubmitting(true);
    setError(null);

    try {
      await requestJson("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          time: remTime,
          message: remMsg,
          applicationId: remAppId || null,
        }),
      });
      setRemMsg("");
      setRemAppId("");
      await refreshAfterChange();
    } catch (submitError) {
      setError(getErrorMessage(submitError, t("today.errAddReminder")));
    } finally {
      setSubmitting(false);
    }
  }

  async function addApplication() {
    setSubmitting(true);
    setError(null);

    try {
      await requestJson("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, role, dateApplied: selectedDate }),
      });
      setCompany("");
      setRole("");
      window.dispatchEvent(new Event(TODAY_CHANGED_EVENT));
      await refreshAfterChange();
    } catch (submitError) {
      setError(getErrorMessage(submitError, t("today.errAddApplication")));
    } finally {
      setSubmitting(false);
    }
  }

  function onNoteChange(next: string) {
    const date = selectedDate;
    setNote(next);
    setNoteStatus("saving");
    if (noteTimer.current) window.clearTimeout(noteTimer.current);

    noteTimer.current = window.setTimeout(async () => {
      try {
        await requestJson("/api/note", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, text: next }),
        });
        setNoteStatus("saved");
        setNotedDates((current) => {
          const updated = new Set(current);
          if (next.trim()) updated.add(date);
          else updated.delete(date);
          return updated;
        });
      } catch (saveError) {
        setError(getErrorMessage(saveError, t("today.errNote")));
        setNoteStatus("idle");
      }
    }, 600);
  }

  const selectedLabel = parseYmd(selectedDate).toLocaleDateString(dateLocale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const relativeLabel =
    selectedDate === todayStr
      ? t("common.today")
      : selectedDate === ymd(new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + 1))
        ? t("common.tomorrow")
        : null;
  const dayIsEmpty = dayApps.length === 0 && dayRems.length === 0 && dayFollowUps.length === 0;

  const tabs: Array<{ id: ComposerTab; label: string }> = [
    { id: "reminder", label: t("calendar.tabReminder") },
    { id: "note", label: t("calendar.tabNote") },
    { id: "application", label: t("calendar.tabApplication") },
  ];

  return (
    <PageFrame
      eyebrow={t("calendar.eyebrow")}
      title={t("calendar.title")}
      subtitle={t("calendar.subtitle")}
      actions={
        countsLoading ? <div className="badge badge-neutral">{t("common.loading")}</div> : null
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="panel-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                className="app-button-secondary !px-3"
                onClick={() => goToMonth(-1)}
                aria-label={t("calendar.prev")}
              >
                {t("calendar.prev")}
              </button>
              <button
                className="app-button-secondary !px-3"
                onClick={() => goToMonth(1)}
                aria-label={t("calendar.next")}
              >
                {t("calendar.next")}
              </button>
            </div>

            <div className="text-center">
              <div className="section-title capitalize">{monthLabel}</div>
              <div className="section-subtitle">{t("calendar.byDay")}</div>
            </div>

            <button className="app-button-ghost" onClick={goToday}>
              {t("calendar.jumpToday")}
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-sm sm:gap-2">
            {weekdayLabels.map((day) => (
              <div
                key={day}
                className="py-1 text-center text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]"
              >
                {day}
              </div>
            ))}

            {days.map((cell, idx) => {
              if (!cell.dateStr) return <div key={idx} className="cal-cell is-blank" />;

              const aCount = appsByDate[cell.dateStr] ?? 0;
              const rCount = remsByDate[cell.dateStr] ?? 0;
              const fCount = followUpsByDate[cell.dateStr] ?? 0;
              const hasNote = notedDates.has(cell.dateStr);

              return (
                <button
                  key={idx}
                  className="cal-cell"
                  data-selected={cell.dateStr === selectedDate}
                  data-today={cell.dateStr === todayStr}
                  data-past={cell.dateStr < todayStr}
                  onClick={() => selectDay(cell.dateStr!)}
                  aria-label={parseYmd(cell.dateStr).toLocaleDateString(dateLocale, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="cal-day-num">{cell.dayNum}</span>
                    <span className="cal-add" aria-hidden="true">
                      +
                    </span>
                  </div>

                  {/* Only days with activity get markers, so busy days stand out */}
                  <div className="mt-1.5 space-y-0.5 text-[0.72rem] font-semibold leading-tight">
                    {aCount > 0 ? (
                      <div className="text-[color:var(--stage-applied)]">
                        {t("calendar.appliedCount", { count: aCount })}
                      </div>
                    ) : null}
                    {fCount > 0 ? (
                      <div className="text-[color:var(--accent)]">
                        {fCount === 1
                          ? t("calendar.followUpOne")
                          : t("calendar.followUpMany", { count: fCount })}
                      </div>
                    ) : null}
                    {rCount > 0 ? (
                      <div className="text-[color:var(--stage-interview)]">
                        {rCount === 1
                          ? t("calendar.reminderOne")
                          : t("calendar.reminderMany", { count: rCount })}
                      </div>
                    ) : null}
                    {hasNote ? (
                      <div className="cal-note-marker">{t("calendar.noteMarker")}</div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside ref={panelRef} className="panel-card space-y-5 scroll-mt-20 xl:sticky xl:top-6">
          <div>
            {relativeLabel ? <div className="page-eyebrow">{relativeLabel}</div> : null}
            <h2 className="font-display mt-1 text-2xl font-medium capitalize leading-tight">
              {selectedLabel}
            </h2>
          </div>

          <div className="space-y-3">
            <div className="section-subtitle font-semibold">{t("calendar.addToDay")}</div>
            <div className="segmented" role="tablist">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={tab === item.id}
                  className={tab === item.id ? "is-active" : ""}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === "reminder" ? (
              <div className="space-y-2">
                <input
                  className="field-input"
                  placeholder={t("today.reminderPlaceholder")}
                  aria-label={t("today.reminderPlaceholder")}
                  value={remMsg}
                  onChange={(e) => setRemMsg(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && remMsg.trim() && !submitting) void addReminder();
                  }}
                />
                <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                  <input
                    className="field-input"
                    type="time"
                    aria-label={t("today.reminderTime")}
                    value={remTime}
                    onChange={(e) => setRemTime(e.target.value)}
                  />
                  <select
                    className="field-select"
                    aria-label={t("today.notLinked")}
                    value={remAppId}
                    onChange={(e) => setRemAppId(e.target.value)}
                  >
                    <option value="">{t("today.notLinked")}</option>
                    {appsLite.map((application) => (
                      <option key={application.id} value={application.id}>
                        {application.company} | {application.role}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end">
                  <button
                    className="app-button"
                    onClick={addReminder}
                    disabled={!remMsg.trim() || submitting}
                  >
                    {submitting ? t("common.adding") : t("today.addReminder")}
                  </button>
                </div>
              </div>
            ) : null}

            {tab === "note" ? (
              <div className="space-y-2">
                <textarea
                  className="field-textarea !min-h-[8rem]"
                  placeholder={t("calendar.notePlaceholder")}
                  aria-label={t("calendar.tabNote")}
                  value={note}
                  onChange={(e) => onNoteChange(e.target.value)}
                />
                <div className="section-subtitle text-xs">
                  {noteStatus === "saving"
                    ? t("common.saving")
                    : noteStatus === "saved"
                      ? t("today.saved")
                      : t("calendar.noteHelp")}
                </div>
              </div>
            ) : null}

            {tab === "application" ? (
              <div className="space-y-2">
                <input
                  className="field-input"
                  placeholder={t("common.company")}
                  aria-label={t("common.company")}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
                <input
                  className="field-input"
                  placeholder={t("common.role")}
                  aria-label={t("common.role")}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="section-subtitle text-xs">{t("calendar.applicationHelp")}</span>
                  <button
                    className="app-button"
                    onClick={addApplication}
                    disabled={!company.trim() || !role.trim() || submitting}
                  >
                    {submitting ? t("common.adding") : t("calendar.addApplication")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="soft-divider" />

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="section-subtitle font-semibold">{t("calendar.onThisDay")}</div>
              {dayLoading ? (
                <span className="section-subtitle text-xs">{t("common.loading")}</span>
              ) : null}
            </div>

            {!dayLoading && dayIsEmpty ? (
              <div className="empty-state">{t("calendar.nothingYet")}</div>
            ) : null}

            {dayFollowUps.length > 0 ? (
              <div className="space-y-2">
                <div className="mini-stat-label">{t("calendar.followUps")}</div>
                {dayFollowUps.map((followUp) => (
                  <div key={followUp.id} className="agenda-item !grid-cols-1" data-kind="follow-up">
                    <div className="space-y-1">
                      <div className="agenda-kind">
                        {tValue("channel", followUp.channel)} |{" "}
                        {tValue("followUpStatus", followUp.status)}
                      </div>
                      <Link
                        className="block font-semibold hover:text-[color:var(--accent)]"
                        href={`/applications/${followUp.application.id}`}
                      >
                        {followUp.application.company}
                      </Link>
                      <div className="section-subtitle">
                        {followUp.application.role}
                        {followUp.recruiter
                          ? ` | ${t("calendar.to", {
                              name: followUp.recruiter.name || followUp.recruiter.email || "",
                            })}`
                          : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {dayRems.length > 0 ? (
              <div className="space-y-2">
                <div className="mini-stat-label">{t("calendar.reminders")}</div>
                {dayRems.map((reminder) => (
                  <div
                    key={reminder.id}
                    className={`agenda-item !grid-cols-1 ${reminder.done ? "opacity-60" : ""}`}
                    data-kind="reminder"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="agenda-kind">{reminder.time}</div>
                        <div className={`font-semibold ${reminder.done ? "line-through" : ""}`}>
                          {reminder.message}
                        </div>
                        {reminder.application ? (
                          <Link
                            className="subtle-link"
                            href={`/applications/${reminder.application.id}`}
                          >
                            {reminder.application.company}
                          </Link>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          className="app-button-secondary !min-h-8 !px-2.5 text-xs"
                          onClick={() => toggleReminder(reminder.id, !reminder.done)}
                          disabled={busyReminderId === reminder.id}
                        >
                          {reminder.done ? t("common.undo") : t("common.done")}
                        </button>
                        <button
                          className="app-button-ghost !min-h-8 !px-2.5 text-xs"
                          onClick={() => deleteReminder(reminder.id)}
                          disabled={busyReminderId === reminder.id}
                          aria-label={t("common.delete")}
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {dayApps.length > 0 ? (
              <div className="space-y-2">
                <div className="mini-stat-label">{t("calendar.applications")}</div>
                {dayApps.map((application) => (
                  <Link
                    key={application.id}
                    href={`/applications/${application.id}`}
                    className="flex items-center justify-between gap-2 rounded-[10px] border border-[color:var(--line)] bg-[color:var(--paper)] px-3 py-2 transition hover:border-[color:var(--ink)]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{application.company}</div>
                      <div className="section-subtitle truncate">{application.role}</div>
                    </div>
                    <span className={`badge badge-${application.stage} shrink-0`}>
                      {tValue("stage", application.stage)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </PageFrame>
  );
}
