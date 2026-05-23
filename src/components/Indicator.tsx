import type { FC } from "react";

interface Props {
  level: "green" | "yellow" | "red";
  label?: string;
}

const LABELS: Record<Props["level"], string> = {
  green: "Strong",
  yellow: "Coachable",
  red: "Needs work",
};

export const Indicator: FC<Props> = ({ level, label }) => (
  <span className={`indicator ${level}`}>
    <span className="dot" />
    {label ?? LABELS[level]}
  </span>
);
