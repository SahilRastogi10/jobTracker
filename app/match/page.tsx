"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/LanguageProvider";
import { PageFrame } from "@/components/PageFrame";
import type { MessageKey } from "@/lib/i18n/messages";
import { extractPdfText } from "@/lib/pdfText";

type Resume = {
  id: string;
  name: string;
  fileName?: string | null;
  isDefault: boolean;
  createdAt: string;
};

type Importance = "required" | "mentioned" | "preferred";

type Keyword = {
  name: string;
  category: string;
  importance: Importance;
  matched: boolean;
};

type MatchResponse = {
  score: number;
  keywords: Keyword[];
  usedAi: boolean;
  aiFailed: boolean;
  resume: { id: string; name: string };
  job: { title: string | null; url: string | null };
};

const IMPORTANCE_ORDER: Importance[] = ["required", "mentioned", "preferred"];
const CATEGORY_ORDER = [
  "languages",
  "frontend",
  "backend",
  "data",
  "cloud",
  "ai",
  "testing",
  "practices",
  "tools",
  "education",
  "other",
];

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Request failed.");
  }
  return data as T;
}

function band(score: number): { key: MessageKey; color: string } {
  if (score >= 80) return { key: "match.bandStrong", color: "var(--stage-offer)" };
  if (score >= 60) return { key: "match.bandGood", color: "var(--stage-applied)" };
  if (score >= 40) return { key: "match.bandFair", color: "var(--stage-interview)" };
  return { key: "match.bandLow", color: "var(--accent)" };
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg viewBox="0 0 140 140" className="h-40 w-40" role="img" aria-label={`${score} / 100`}>
      <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--paper-sunk)" strokeWidth="12" />
      <circle
        cx="70"
        cy="70"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - score / 100)}
        transform="rotate(-90 70 70)"
        className="score-ring-progress"
      />
      <text
        x="70"
        y="76"
        textAnchor="middle"
        className="font-display"
        style={{ fontSize: 40, fontWeight: 500, fill: "var(--ink)" }}
      >
        {score}
      </text>
      <text x="70" y="98" textAnchor="middle" style={{ fontSize: 12, fill: "var(--muted)" }}>
        / 100
      </text>
    </svg>
  );
}

export default function MatchPage() {
  const { t } = useI18n();

  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [addMode, setAddMode] = useState<"pdf" | "text">("pdf");
  const [newName, setNewName] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newText, setNewText] = useState("");
  const [saving, setSaving] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [previewText, setPreviewText] = useState<string | null>(null);

  const [jobMode, setJobMode] = useState<"link" | "text">("link");
  const [jobUrl, setJobUrl] = useState("");
  const [jobText, setJobText] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<MatchResponse | null>(null);
  // Set when the page is opened from an application with ?url=, to compare once resumes load.
  const pendingAutoCompare = useRef(false);

  async function loadResumes(preferId?: string) {
    try {
      const data = await requestJson<{ items: Resume[] }>("/api/resumes");
      setResumes(data.items);
      setSelectedId((current) => {
        const wanted = preferId ?? current;
        if (wanted && data.items.some((item) => item.id === wanted)) return wanted;
        return data.items.find((item) => item.isDefault)?.id ?? data.items[0]?.id ?? "";
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("match.errLoad"));
    }
  }

  useEffect(() => {
    const linkedUrl = new URLSearchParams(window.location.search).get("url");
    if (linkedUrl) {
      setJobMode("link");
      setJobUrl(linkedUrl);
      pendingAutoCompare.current = true;
    }
    void loadResumes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pendingAutoCompare.current || !selectedId || !jobUrl) return;
    pendingAutoCompare.current = false;
    void compare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, jobUrl]);

  useEffect(() => {
    setPreviewText(null);
  }, [selectedId]);

  async function saveResume() {
    setSaving(true);
    setError(null);

    try {
      const file = addMode === "pdf" ? newFile : null;
      const text = file ? await extractPdfText(file).catch(() => "") : newText;

      const data = await requestJson<{ item: Resume }>("/api/resumes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, text, fileName: file?.name ?? null }),
      });
      setNewName("");
      setNewFile(null);
      setNewText("");
      setFileInputKey((key) => key + 1);
      await loadResumes(data.item.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("match.errSave"));
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault(id: string) {
    try {
      await requestJson(`/api/resumes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      await loadResumes(id);
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : t("match.errSave"));
    }
  }

  async function deleteResume(id: string) {
    if (!confirm(t("match.confirmDelete"))) return;
    try {
      await requestJson(`/api/resumes/${id}`, { method: "DELETE" });
      if (result?.resume.id === id) setResult(null);
      await loadResumes();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("match.errDelete"));
    }
  }

  async function togglePreview() {
    if (previewText !== null) {
      setPreviewText(null);
      return;
    }
    const data = await requestJson<{ item: { text: string } }>(`/api/resumes/${selectedId}`);
    setPreviewText(data.item.text);
  }

  async function compare() {
    setComparing(true);
    setError(null);

    try {
      const data = await requestJson<MatchResponse>("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId: selectedId,
          jobUrl: jobMode === "link" ? jobUrl : "",
          jobText: jobMode === "text" ? jobText : "",
          useAi,
        }),
      });
      setResult(data);
    } catch (compareError) {
      setError(compareError instanceof Error ? compareError.message : t("match.errCompare"));
    } finally {
      setComparing(false);
    }
  }

  const missingByImportance = useMemo(() => {
    const missing = result?.keywords.filter((keyword) => !keyword.matched) ?? [];
    return IMPORTANCE_ORDER.map((importance) => ({
      importance,
      items: missing.filter((keyword) => keyword.importance === importance),
    })).filter((group) => group.items.length > 0);
  }, [result]);

  const matchedByCategory = useMemo(() => {
    const matched = result?.keywords.filter((keyword) => keyword.matched) ?? [];
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: matched.filter((keyword) => keyword.category === category),
    })).filter((group) => group.items.length > 0);
  }, [result]);

  const matchedCount = result?.keywords.filter((keyword) => keyword.matched).length ?? 0;
  const scoreBand = result ? band(result.score) : null;
  const canSaveResume =
    !saving && (addMode === "pdf" ? Boolean(newFile) : newText.trim().length > 0);
  const canCompare =
    !comparing &&
    Boolean(selectedId) &&
    (jobMode === "link" ? jobUrl.trim().length > 0 : jobText.trim().length > 0);

  return (
    <PageFrame eyebrow={t("match.eyebrow")} title={t("match.title")} subtitle={t("match.subtitle")}>
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section className="panel-card space-y-4">
          <div className="section-title">{t("match.resumes")}</div>

          {resumes.length === 0 ? (
            <div className="empty-state">{t("match.noResumes")}</div>
          ) : (
            <div className="space-y-2" role="radiogroup" aria-label={t("match.resumes")}>
              {resumes.map((resume) => (
                <div
                  key={resume.id}
                  role="radio"
                  aria-checked={resume.id === selectedId}
                  tabIndex={0}
                  className="resume-option"
                  data-selected={resume.id === selectedId}
                  onClick={() => setSelectedId(resume.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedId(resume.id);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{resume.name}</div>
                      {resume.fileName ? (
                        <div className="section-subtitle truncate text-xs">{resume.fileName}</div>
                      ) : null}
                    </div>
                    {resume.isDefault ? (
                      <span className="badge badge-offer shrink-0">{t("match.default")}</span>
                    ) : null}
                  </div>

                  {resume.id === selectedId ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button
                        className="app-button-ghost !min-h-8 !px-2 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          void togglePreview();
                        }}
                      >
                        {t("match.viewText")}
                      </button>
                      {!resume.isDefault ? (
                        <button
                          className="app-button-ghost !min-h-8 !px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            void makeDefault(resume.id);
                          }}
                        >
                          {t("match.makeDefault")}
                        </button>
                      ) : null}
                      <button
                        className="app-button-ghost !min-h-8 !px-2 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteResume(resume.id);
                        }}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {previewText !== null ? (
            <pre className="scroll-panel max-h-60 whitespace-pre-wrap rounded-[10px] border border-[color:var(--line)] bg-[color:var(--paper)] p-3 text-xs leading-relaxed text-[color:var(--ink-soft)]">
              {previewText}
            </pre>
          ) : null}

          <div className="soft-divider" />

          <div className="space-y-2">
            <div className="section-subtitle font-semibold">{t("match.addResume")}</div>
            <div className="segmented" role="tablist">
              {(["pdf", "text"] as const).map((mode) => (
                <button
                  key={mode}
                  role="tab"
                  aria-selected={addMode === mode}
                  className={addMode === mode ? "is-active" : ""}
                  onClick={() => setAddMode(mode)}
                >
                  {mode === "pdf" ? t("match.uploadPdf") : t("match.pasteText")}
                </button>
              ))}
            </div>
            <input
              className="field-input"
              placeholder={t("match.resumeNamePlaceholder")}
              aria-label={t("match.resumeName")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            {addMode === "pdf" ? (
              <input
                key={fileInputKey}
                className="file-input"
                type="file"
                accept="application/pdf,.pdf"
                aria-label={t("match.resumeFile")}
                onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
              />
            ) : (
              <textarea
                className="field-textarea !min-h-[8rem]"
                placeholder={t("match.resumeTextPlaceholder")}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
              />
            )}
            <div className="flex justify-end">
              <button className="app-button" onClick={saveResume} disabled={!canSaveResume}>
                {saving ? t("match.uploading") : t("match.saveResume")}
              </button>
            </div>
          </div>
        </section>

        <section className="panel-card space-y-4">
          <div className="section-title">{t("match.job")}</div>
          <div className="segmented max-w-xs" role="tablist">
            {(["link", "text"] as const).map((mode) => (
              <button
                key={mode}
                role="tab"
                aria-selected={jobMode === mode}
                className={jobMode === mode ? "is-active" : ""}
                onClick={() => setJobMode(mode)}
              >
                {mode === "link" ? t("match.tabLink") : t("match.tabText")}
              </button>
            ))}
          </div>

          {jobMode === "link" ? (
            <div className="space-y-1.5">
              <input
                className="field-input"
                type="url"
                placeholder={t("match.linkPlaceholder")}
                aria-label={t("match.tabLink")}
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canCompare) void compare();
                }}
              />
              <p className="section-subtitle text-xs">{t("match.linkHelp")}</p>
            </div>
          ) : (
            <textarea
              className="field-textarea !min-h-[14rem]"
              placeholder={t("match.textPlaceholder")}
              aria-label={t("match.tabText")}
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
            />
          )}

          <label className="flex items-start gap-2 text-sm text-[color:var(--ink-soft)]">
            <input
              type="checkbox"
              className="mt-0.5 accent-[color:var(--ink)]"
              checked={useAi}
              onChange={(e) => setUseAi(e.target.checked)}
            />
            {t("match.useAi")}
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="section-subtitle text-xs">
              {comparing && useAi
                ? t("match.comparingAi")
                : !selectedId
                  ? t("match.chooseResume")
                  : ""}
            </span>
            <button className="app-button" onClick={compare} disabled={!canCompare}>
              {comparing ? t("match.comparing") : t("match.compare")}
            </button>
          </div>
        </section>
      </div>

      {result && scoreBand ? (
        <section className="panel-card grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="mini-stat-label">{t("match.scoreLabel")}</div>
            <ScoreRing score={result.score} color={scoreBand.color} />
            <div className="font-display text-xl" style={{ color: scoreBand.color }}>
              {t(scoreBand.key)}
            </div>
            <div className="section-subtitle text-sm">
              {t("match.keywordsMatched", { matched: matchedCount, total: result.keywords.length })}
            </div>
            <div className="section-subtitle text-xs">
              {t("match.against", {
                resume: result.resume.name,
                job: result.job.title || t("match.pastedJob"),
              })}
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div>
                <div className="section-title">{t("match.missing")}</div>
                <p className="section-subtitle text-sm">{t("match.missingHelp")}</p>
              </div>
              {missingByImportance.length === 0 ? (
                <div className="empty-state">{t("match.noneMissing")}</div>
              ) : (
                missingByImportance.map((group) => (
                  <div key={group.importance} className="space-y-1.5">
                    <div className="mini-stat-label">
                      {t(`match.importance.${group.importance}` as MessageKey)}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((keyword) => (
                        <span
                          key={keyword.name}
                          className="kw-chip kw-missing"
                          data-importance={keyword.importance}
                        >
                          {keyword.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {matchedByCategory.length > 0 ? (
              <div className="space-y-3">
                <div className="section-title">{t("match.matched")}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {matchedByCategory.map((group) => (
                    <div key={group.category} className="space-y-1.5">
                      <div className="mini-stat-label">
                        {t(`match.category.${group.category}` as MessageKey)}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.items.map((keyword) => (
                          <span key={keyword.name} className="kw-chip kw-matched">
                            {keyword.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="section-subtitle text-xs">
              {t("match.scoringHelp")}{" "}
              {result.usedAi
                ? t("match.aiUsed")
                : result.aiFailed
                  ? t("match.aiFailed")
                  : t("match.aiSkipped")}
            </p>
          </div>
        </section>
      ) : null}
    </PageFrame>
  );
}
