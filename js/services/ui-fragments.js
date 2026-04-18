export function renderActionButton({
  label = "",
  attrs = "",
  icon = "",
  tone = "default",
  className = "",
  type = "button",
} = {}) {
  const toneClass =
    tone === "primary"
      ? "action-btn action-btn-primary"
      : tone === "danger-soft"
        ? "action-btn action-btn-danger-soft"
        : tone === "danger"
          ? "danger-btn"
          : "action-btn";

  const iconHtml = icon ? `<i class="fa-solid ${icon} mr-2"></i>` : "";
  const safeAttrs = attrs ? ` ${attrs.trim()}` : "";

  return `<button type="${type}" class="${`${toneClass} ${className}`.trim()}"${safeAttrs}>${iconHtml}${label}</button>`;
}

export function renderActionGroup(actions = [], options = {}) {
  const { className = "flex gap-3 flex-wrap" } = options;
  const validActions = (Array.isArray(actions) ? actions : []).filter(Boolean);
  if (!validActions.length) return "";
  return `<div class="${className}">${validActions.join("")}</div>`;
}

export function renderInfoTiles(items = [], options = {}) {
  const {
    gridClassName = "grid md:grid-cols-2 gap-3 mt-5 text-sm",
    tileClassName = "rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3",
    labelClassName = "text-slate-500",
    valueClassName = "text-slate-900 font-bold",
  } = options;

  const validItems = (Array.isArray(items) ? items : []).filter(
    (item) => item && (item.label || item.value),
  );

  if (!validItems.length) return "";

  return `
    <div class="${gridClassName}">
      ${validItems
        .map(
          (item) => `
            <div class="${item.tileClassName || tileClassName}">
              <div class="${item.labelClassName || labelClassName}">${item.label || ""}</div>
              <div class="${item.valueClassName || valueClassName}">${item.value || "—"}</div>
            </div>`,
        )
        .join("")}
    </div>
  `;
}

export function renderSectionIntro({
  title = "",
  text = "",
  badge = "",
  actionsHtml = "",
  className = "section-head section-head-spaced items-start gap-4",
  titleClassName = "section-title",
  textClassName = "text-sm text-slate-500",
} = {}) {
  return `
    <div class="${className}">
      <div>
        <h2 class="${titleClassName}">${title}</h2>
        ${text ? `<p class="${textClassName}">${text}</p>` : ""}
      </div>
      ${badge ? `<span class="badge badge-muted">${badge}</span>` : actionsHtml || ""}
    </div>
  `;
}
