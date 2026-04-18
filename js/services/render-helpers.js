export function renderMetricCard(label, value, icon, options = {}) {
  const {
    className = "",
    labelClassName = "compact-stat-label",
    valueClassName = "compact-stat-value",
    iconClassName = "compact-stat-icon",
    articleClassName = "card p-5 md:p-6 compact-stat-card min-h-[150px] overflow-hidden",
  } = options;

  return `
    <article class="${articleClassName} ${className}">
      <div class="${iconClassName}"><i class="fa-solid ${icon}"></i></div>
      <div class="min-w-0">
        <div class="${labelClassName}">${label}</div>
        <div class="${valueClassName}">${value}</div>
      </div>
    </article>
  `;
}

export function renderEmptyState(title, text, options = {}) {
  const {
    className = "card p-10 text-center",
    titleClassName = "text-xl font-bold",
    textClassName = "text-slate-500 mt-2",
  } = options;

  return `
    <div class="${className}">
      <div class="${titleClassName}">${title}</div>
      <div class="${textClassName}">${text}</div>
    </div>
  `;
}

export function renderInlineEmpty(text, options = {}) {
  const { className = "text-sm text-slate-500" } = options;
  return `<div class="${className}">${text}</div>`;
}

export function renderActivityFeed(items = [], options = {}) {
  const {
    buildLabel,
    buildMeta = () => "",
    emptyText = "Nenhuma atividade registrada ainda.",
    containerClassName = "space-y-3",
    itemClassName = "surface-soft rounded-[22px] p-4 border border-slate-100",
    labelClassName = "font-semibold text-slate-900",
    metaClassName = "text-sm text-slate-500 mt-2",
    emptyClassName = "text-sm text-slate-500",
  } = options;

  if (!items.length) {
    return renderInlineEmpty(emptyText, { className: emptyClassName });
  }

  return `
    <div class="${containerClassName}">
      ${items
        .map((item) => `
          <article class="${itemClassName}">
            <div class="${labelClassName}">${buildLabel ? buildLabel(item) : "Atividade"}</div>
            <div class="${metaClassName}">${buildMeta(item) || ""}</div>
          </article>`)
        .join("")}
    </div>
  `;
}
