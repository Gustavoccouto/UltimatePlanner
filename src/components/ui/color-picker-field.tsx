"use client";

import type { CSSProperties } from "react";

const DEFAULT_COLOR = "#10b981";

const PRESET_COLORS = [
  "#10b981",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#2563eb",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#f59e0b",
  "#64748b"
];

function normalizeHexColor(value?: string | null) {
  const cleanValue = (value || "").trim();
  const shortHexMatch = cleanValue.match(/^#([0-9a-f]{3})$/i);

  if (shortHexMatch) {
    const [, shortHex] = shortHexMatch;
    return `#${shortHex.split("").map((char) => char + char).join("")}`.toLowerCase();
  }

  if (/^#[0-9a-f]{6}$/i.test(cleanValue)) {
    return cleanValue.toLowerCase();
  }

  return "";
}

type ColorPickerFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  className?: string;
  allowClear?: boolean;
};

export function ColorPickerField({
  label,
  value,
  onChange,
  helper = "Escolha no seletor ou use uma das sugestões.",
  className = "",
  allowClear = true
}: ColorPickerFieldProps) {
  const normalizedValue = normalizeHexColor(value);
  const selectedColor = normalizedValue || DEFAULT_COLOR;
  const style = { "--selected-color": selectedColor } as CSSProperties;

  return (
    <div className={`field color-field ${className}`.trim()} style={style}>
      <span className="color-field-label">{label}</span>
      <div className="color-picker-shell">
        <label className="color-picker-main">
          <input
            aria-label={label}
            className="color-picker-native"
            type="color"
            value={selectedColor}
            onChange={(event) => onChange(event.target.value)}
          />
          <span className="color-picker-preview" aria-hidden="true" />
          <span className="color-picker-copy">
            <strong>{normalizedValue ? "Cor escolhida" : "Usar cor do tema"}</strong>
            <small>{helper}</small>
          </span>
        </label>

        <div className="color-swatch-row" aria-label="Cores sugeridas">
          {PRESET_COLORS.map((presetColor) => (
            <button
              aria-label={`Escolher cor ${presetColor}`}
              className={`color-swatch${selectedColor === presetColor ? " is-selected" : ""}`}
              key={presetColor}
              onClick={() => onChange(presetColor)}
              style={{ "--swatch-color": presetColor } as CSSProperties}
              type="button"
            />
          ))}
          {allowClear ? (
            <button className="color-clear-button" onClick={() => onChange("")} type="button">
              Padrão
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
