import { useT } from "../../i18n/useT";

/** Preset emphasis colors offered by the highlight tool — a small,
 * deliberately curated set (rather than a full color wheel) so the swatch
 * grid stays a one-glance pick, same spirit as the app's existing preset
 * pickers (rings, functional groups, ...). Chosen for contrast against
 * both the light and dark canvas background and against each other. */
export const HIGHLIGHT_COLORS = [
  "#ffd60a", // yellow
  "#ff9f0a", // orange
  "#ff453a", // red
  "#ff375f", // pink
  "#bf5af2", // purple
  "#0a84ff", // blue
  "#34c759", // green
  "#8e8e93", // gray
];

interface HighlightColorPickerProps {
  onChoose: (color: string | null) => void;
  disabled: boolean;
}

/** Swatch grid for the "Highlight" selection tool — applies (or, via the
 * last "none" swatch, clears) an emphasis color across whatever's
 * currently selected. Shared between Sidebar and MobileToolbar so both
 * stay in sync with HIGHLIGHT_COLORS automatically. */
export function HighlightColorPicker({ onChoose, disabled }: HighlightColorPickerProps) {
  const t = useT();
  return (
    <div className="highlight-grid">
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c}
          className="highlight-swatch"
          style={{ background: c }}
          disabled={disabled}
          title={t("highlight.apply")}
          onClick={() => onChoose(c)}
        />
      ))}
      <button
        className="highlight-swatch highlight-swatch--none"
        disabled={disabled}
        title={t("highlight.clear")}
        onClick={() => onChoose(null)}
      >
        &times;
      </button>
    </div>
  );
}
