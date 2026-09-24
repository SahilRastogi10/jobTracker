"use client";

import { useI18n } from "@/components/LanguageProvider";

export const STAGES = ["applied", "interview", "offer", "rejected"] as const;

type StagePickerProps = {
  stage: string;
  onChange: (stage: string) => void;
  label: string;
  disabled?: boolean;
};

// A stage badge that doubles as a dropdown, colored by the current stage.
export function StagePicker({ stage, onChange, label, disabled }: StagePickerProps) {
  const { tValue } = useI18n();

  return (
    <span className="stage-picker" data-stage={stage}>
      <select
        value={stage}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        disabled={disabled}
      >
        {STAGES.map((value) => (
          <option key={value} value={value}>
            {tValue("stage", value)}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="m3 4.5 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
