"use client";

import { useEffect, useState } from "react";
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
  };
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
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadStats() {
    setLoading(true);

    try {
      const data = await requestJson<StatsResponse>("/api/stats");
      setStats(data);
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Could not load stats."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setError(null);
    void loadStats();
  }, []);

  return (
    <PageFrame
      title="Stats"
      subtitle="A quick pulse on your pipeline, follow-up pressure, and reminder load."
      actions={loading ? <div className="badge badge-neutral">Refreshing...</div> : null}
    >
      {error ? <div className="error-banner">{error}</div> : null}

      {loading && !stats ? (
        <section className="panel-card">
          <div className="empty-state">Loading stats...</div>
        </section>
      ) : stats ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="panel-card">
              <div className="mini-stat-label">Applications</div>
              <div className="mini-stat-value">{stats.totalApplications}</div>
              <div className="section-subtitle mt-2">All-time tracked roles</div>
            </div>

            <div className="panel-card">
              <div className="mini-stat-label">Pending reminders</div>
              <div className="mini-stat-value">{stats.reminders.pending}</div>
              <div className="section-subtitle mt-2">Still need action</div>
            </div>

            <div className="panel-card">
              <div className="mini-stat-label">Completed reminders</div>
              <div className="mini-stat-value">{stats.reminders.done}</div>
              <div className="section-subtitle mt-2">Already handled</div>
            </div>

            <div className="panel-card">
              <div className="mini-stat-label">Upcoming follow-ups</div>
              <div className="mini-stat-value">{stats.followUps.upcoming}</div>
              <div className="section-subtitle mt-2">Ahead on the radar</div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="panel-card space-y-4">
              <div>
                <h2 className="section-title">Applications by stage</h2>
                <p className="section-subtitle">
                  See where your search is concentrating right now.
                </p>
              </div>

              {Object.keys(stats.stageCounts).length === 0 ? (
                <div className="empty-state">No applications yet.</div>
              ) : (
                <ul className="space-y-3">
                  {Object.entries(stats.stageCounts).map(([stage, count]) => (
                    <li key={stage} className="list-card flex items-center justify-between gap-3">
                      <span className="badge badge-neutral">{stage}</span>
                      <span className="text-xl font-semibold">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="panel-card space-y-4">
              <div>
                <h2 className="section-title">Follow-up health</h2>
                <p className="section-subtitle">
                  Keep overdue tasks low and future follow-ups intentional.
                </p>
              </div>

              <div className="list-card">
                <div className="mini-stat-label">Overdue</div>
                <div className="mini-stat-value">{stats.followUps.overdue}</div>
              </div>

              <div className="list-card">
                <div className="mini-stat-label">Upcoming</div>
                <div className="mini-stat-value">{stats.followUps.upcoming}</div>
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="panel-card">
          <div className="empty-state">No stats available.</div>
        </section>
      )}
    </PageFrame>
  );
}
