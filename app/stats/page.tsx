"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/LanguageProvider";
import { PageFrame } from "@/components/PageFrame";

type StatsResponse = {
  totalApplications: number;
  stageCounts: Record<string, number>;
  reminders: {
    pending: number;
    done: number;
  };
  followUps: {
    overdue: number;
    upcoming: number;
    sent: number;
  };
  drafts: Partial<Record<"pending_review" | "approved" | "rejected", number>>;
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

export default function StatsPage() {
  const { t, tValue } = useI18n();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadStats() {
    setLoading(true);

    try {
      const data = await requestJson<StatsResponse>("/api/stats");
      setStats(data);
    } catch (loadError) {
      setError(getErrorMessage(loadError, t("stats.errLoad")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setError(null);
    void loadStats();
    // Reload on data changes only; switching language needs no refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draftTotal = stats
    ? Object.values(stats.drafts ?? {}).reduce((sum, count) => sum + (count ?? 0), 0)
    : 0;
  const reviewedTotal = stats
    ? (stats.drafts?.approved ?? 0) + (stats.drafts?.rejected ?? 0)
    : 0;

  return (
    <PageFrame
      eyebrow={t("stats.eyebrow")}
      title={t("stats.title")}
      subtitle={t("stats.subtitle")}
      actions={loading ? <div className="badge badge-neutral">{t("stats.refreshing")}</div> : null}
    >
      {error ? <div className="error-banner">{error}</div> : null}

      {loading && !stats ? (
        <section className="panel-card">
          <div className="empty-state">{t("stats.loading")}</div>
        </section>
      ) : stats ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="panel-card">
              <div className="mini-stat-label">{t("stats.applications")}</div>
              <div className="mini-stat-value">{stats.totalApplications}</div>
              <div className="section-subtitle mt-2">{t("stats.allTime")}</div>
            </div>

            <div className="panel-card">
              <div className="mini-stat-label">{t("stats.pendingReminders")}</div>
              <div className="mini-stat-value">{stats.reminders.pending}</div>
              <div className="section-subtitle mt-2">{t("stats.stillNeedAction")}</div>
            </div>

            <div className="panel-card">
              <div className="mini-stat-label">{t("stats.completedReminders")}</div>
              <div className="mini-stat-value">{stats.reminders.done}</div>
              <div className="section-subtitle mt-2">{t("stats.alreadyHandled")}</div>
            </div>

            <div className="panel-card">
              <div className="mini-stat-label">{t("stats.upcomingFollowUps")}</div>
              <div className="mini-stat-value">{stats.followUps.upcoming}</div>
              <div className="section-subtitle mt-2">{t("stats.aheadOnRadar")}</div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="panel-card space-y-4">
              <div>
                <h2 className="section-title">{t("stats.byStage")}</h2>
                <p className="section-subtitle">
                  {t("stats.byStageHelp")}
                </p>
              </div>

              {Object.keys(stats.stageCounts).length === 0 ? (
                <div className="empty-state">{t("stats.noApplications")}</div>
              ) : (
                <ul className="space-y-3">
                  {Object.entries(stats.stageCounts).map(([stage, count]) => (
                    <li key={stage} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`badge badge-${stage}`}>{tValue("stage", stage)}</span>
                        <span className="font-display text-2xl">{count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[color:var(--paper-sunk)]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${stats.totalApplications ? (count / stats.totalApplications) * 100 : 0}%`,
                            background: `var(--stage-${stage}, var(--ink))`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="panel-card space-y-4">
              <div>
                <h2 className="section-title">{t("stats.followUpHealth")}</h2>
                <p className="section-subtitle">
                  {t("stats.followUpHealthHelp")}
                </p>
              </div>

              <div className="list-card">
                <div className="mini-stat-label">{t("stats.overdue")}</div>
                <div className="mini-stat-value">{stats.followUps.overdue}</div>
              </div>

              <div className="list-card">
                <div className="mini-stat-label">{t("stats.upcoming")}</div>
                <div className="mini-stat-value">{stats.followUps.upcoming}</div>
              </div>

              <div className="list-card">
                <div className="mini-stat-label">{t("stats.sent")}</div>
                <div className="mini-stat-value">{stats.followUps.sent}</div>
              </div>
            </div>
          </section>

          <section className="panel-card space-y-4">
            <div>
              <h2 className="section-title">{t("stats.drafts")}</h2>
              <p className="section-subtitle">
                {t("stats.draftsHelp")}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="list-card">
                <div className="mini-stat-label">{t("stats.generated")}</div>
                <div className="mini-stat-value">{draftTotal}</div>
              </div>
              <div className="list-card">
                <div className="mini-stat-label">{t("stats.awaitingReview")}</div>
                <div className="mini-stat-value">{stats.drafts.pending_review ?? 0}</div>
              </div>
              <div className="list-card">
                <div className="mini-stat-label">{t("stats.approved")}</div>
                <div className="mini-stat-value">{stats.drafts.approved ?? 0}</div>
              </div>
              <div className="list-card">
                <div className="mini-stat-label">{t("stats.rejected")}</div>
                <div className="mini-stat-value">{stats.drafts.rejected ?? 0}</div>
              </div>
            </div>

            {reviewedTotal > 0 ? (
              <div className="section-subtitle">
                {t("stats.approvalRate", {
                  percent: Math.round(((stats.drafts.approved ?? 0) / reviewedTotal) * 100),
                })}
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <section className="panel-card">
          <div className="empty-state">{t("stats.none")}</div>
        </section>
      )}
    </PageFrame>
  );
}
