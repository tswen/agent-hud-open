import type { Quota } from "@agent-hud/protocol";
import { onDemandPacingLines } from "./on-demand-pacing";
import { useFormat } from "@agent-hud/ui/format-context";

/** Secondary lines under Cursor's on-demand quota row. */
export function OnDemandPacingDetails({
  row,
  now,
  light,
  compact,
}: {
  row: Quota;
  now: number;
  light: boolean;
  compact?: boolean;
}) {
  const format = useFormat();
  const lines = onDemandPacingLines(row, now, format);
  if (!lines) return null;
  const color = light ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.55)";
  return (
    <div
      className="hud-on-demand-pacing"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? 2 : 3,
        padding: compact
          ? "0 6px 4px 26px"
          : "0 6px 6px 26px",
        fontSize: compact ? 11 : 12,
        lineHeight: compact ? "14px" : "15px",
        color,
      }}
    >
      <span>{lines.untilReset}</span>
      <span>{lines.dailyBudget}</span>
      <span>{lines.todayRatio}</span>
    </div>
  );
}
