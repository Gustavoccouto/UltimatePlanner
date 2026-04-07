import { pageHeader, toast } from "../ui.js";
import {
  DEFAULT_APPS_SCRIPT_URL,
  clearAuthSession,
  getAppsScriptUrl,
  getAuthSession,
  setAppsScriptUrl,
} from "../config.js";
import { resetDbConnection } from "../services/storage.js";
import { SheetsService } from "../services/sheets.js";
import { patchUi } from "../state.js";

function roleBadge(role = "member") {
  if (role === "owner") return '<span class="badge badge-success">owner</span>';
  if (role === "admin") return '<span class="badge badge-warning">admin</span>';
  return '<span class="badge badge-muted">member</span>';
}

export function renderSettings() {
  const currentUrl = getAppsScriptUrl();
  const session = getAuthSession();
  const currentUser = session?.user;
  const canManageUsers = ["owner", "admin"].includes(currentUser?.role);

  return `
    ${pageHeader("Configurações", "Preferências visuais e integração com Google Apps Script.")}

    <section class="grid xl:grid-cols-[1fr_.9fr] gap-6">
      <article class="card p-6">
        <div class="section-head">
          <div>
            <div class="text-sm text-slate-500">Integração</div>
            <div class="section-title">Google Apps Script</div>
          </div>
        </div>
        <div class="space-y-4 mt-5">
          <div>
            <label class="text-sm font-semibold block mb-2">URL do Web App</label>
            <input id="settings-apps-script-url" class="field" value="${currentUrl}" />
          </div>
          <div class="flex flex-wrap gap-3">
            <button id="save-settings-btn" class="action-btn action-btn-primary">Salvar URL</button>
            <button id="test-settings-btn" class="action-btn">Testar integração</button>
            <button id="reset-settings-btn" class="action-btn">Restaurar padrão</button>
          </div>
          <div class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">O app usa <strong>JSONP via GET</strong> para evitar CORS no localhost. O deploy do Apps Script precisa estar publicado como <strong>Web App público</strong>.</div>
        </div>
      </article>

      <article class="card p-6 card-glass">
        <div class="section-head">
          <div>
            <div class="text-sm text-slate-500">Estado atual</div>
            <div class="section-title">Diagnóstico rápido</div>
          </div>
        </div>
        <div class="space-y-3 mt-5 text-sm text-slate-600">
          <div>1. Cole o <strong>ID da planilha</strong> dentro do <code>Code.gs</code>.</div>
          <div>2. Faça <strong>Deploy &gt; New deployment</strong>.</div>
          <div>3. Escolha <strong>Web app</strong>.</div>
          <div>4. Execute como <strong>você</strong>.</div>
          <div>5. Acesso: <strong>Anyone</strong>.</div>
          <div>6. Salve a URL publicada aqui no app.</div>
        </div>
      </article>
    </section>

    <section class="grid xl:grid-cols-[.88fr_1.12fr] gap-6 mt-6">
      <article class="card p-6">
        <div class="section-head">
          <div>
            <div class="text-sm text-slate-500">Acesso atual</div>
            <div class="section-title">Sessão e workspace</div>
          </div>
          ${roleBadge(currentUser?.role)}
        </div>

        <div class="settings-user-card mt-5">
          <div class="user-pick-avatar settings-user-avatar">${String(
            currentUser?.name || "U",
          )
            .slice(0, 1)
            .toUpperCase()}</div>
          <div>
            <div class="font-bold text-slate-900">${currentUser?.name || "Sem sessão"}</div>
            <div class="text-sm text-slate-500 mt-1">@${currentUser?.login || "—"}</div>
            <div class="text-sm text-slate-500 mt-1">workspace <strong>${currentUser?.workspaceKey || "—"}</strong></div>
          </div>
        </div>

        <div class="flex flex-wrap gap-3 mt-5">
          <button id="settings-list-users-btn" class="action-btn">Atualizar usuários</button>
          <button id="settings-logout-btn" class="action-btn action-btn-danger-soft">Sair deste dispositivo</button>
        </div>

        <div id="settings-users-list" class="space-y-3 mt-5"></div>
      </article>

      <article class="card p-6 ${canManageUsers ? "" : "opacity-70"}">
        <div class="section-head">
          <div>
            <div class="text-sm text-slate-500">Gestão</div>
            <div class="section-title">Criar novo acesso</div>
          </div>
          ${canManageUsers ? '<span class="badge badge-success">liberado</span>' : '<span class="badge badge-muted">somente owner/admin</span>'}
        </div>

        <div class="grid md:grid-cols-2 gap-4 mt-5">
          <div>
            <label class="text-sm font-semibold block mb-2">Nome</label>
            <input id="new-user-name" class="field" placeholder="Nome do usuário" ${canManageUsers ? "" : "disabled"} />
          </div>
          <div>
            <label class="text-sm font-semibold block mb-2">Login</label>
            <input id="new-user-login" class="field" placeholder="login" ${canManageUsers ? "" : "disabled"} />
          </div>
          <div>
            <label class="text-sm font-semibold block mb-2">Senha inicial</label>
            <input id="new-user-password" class="field" type="password" placeholder="senha inicial" ${canManageUsers ? "" : "disabled"} />
          </div>
          <div>
            <label class="text-sm font-semibold block mb-2">Role</label>
            <select id="new-user-role" class="select" ${canManageUsers ? "" : "disabled"}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </div>
        </div>

        <div class="mt-4">
          <label class="text-sm font-semibold block mb-2">Workspace</label>
          <input id="new-user-workspace" class="field" value="${currentUser?.workspaceKey || "gustavo"}" ${canManageUsers ? "" : "disabled"} />
          <p class="text-sm text-slate-500 mt-2">Use o mesmo workspace para compartilhar os mesmos dados. Use outro para separar completamente.</p>
        </div>

        <div class="flex flex-wrap gap-3 mt-5">
          <button id="create-user-btn" class="action-btn action-btn-primary" ${canManageUsers ? "" : "disabled"}>Criar usuário</button>
        </div>
      </article>
    </section>`;
}

function renderUsersList(root, users = []) {
  if (!root) return;

  if (!users.length) {
    root.innerHTML =
      '<div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Nenhum usuário retornado para este workspace.</div>';
    return;
  }

  root.innerHTML = users
    .map(
      (user) => `
    <div class="settings-user-list-item">
      <div class="user-pick-avatar">${String(user.name || "U")
        .slice(0, 1)
        .toUpperCase()}</div>
      <div class="min-w-0 flex-1">
        <div class="font-semibold text-slate-900 truncate">${user.name}</div>
        <div class="text-sm text-slate-500 truncate">@${user.login}</div>
      </div>
      ${roleBadge(user.role)}
    </div>
  `,
    )
    .join("");
}

export function bindSettingsEvents() {
  document
    .getElementById("save-settings-btn")
    ?.addEventListener("click", () => {
      const value =
        document.getElementById("settings-apps-script-url")?.value?.trim() ||
        DEFAULT_APPS_SCRIPT_URL;
      setAppsScriptUrl(value);
      patchUi({ integrationStatus: "ready", integrationLabel: "URL salva" });
      toast("URL do Apps Script salva com sucesso.", "success");
    });

  document
    .getElementById("reset-settings-btn")
    ?.addEventListener("click", () => {
      setAppsScriptUrl(DEFAULT_APPS_SCRIPT_URL);
      const input = document.getElementById("settings-apps-script-url");
      if (input) input.value = DEFAULT_APPS_SCRIPT_URL;
      patchUi({
        integrationStatus: "ready",
        integrationLabel: "URL padrão restaurada",
      });
      toast("URL padrão restaurada.", "success");
    });

  document
    .getElementById("test-settings-btn")
    ?.addEventListener("click", async () => {
      try {
        patchUi({
          integrationStatus: "testing",
          integrationLabel: "Testando integração…",
        });
        const result = await SheetsService.diagnose();
        patchUi({
          integrationStatus: "online",
          integrationLabel: "Apps Script conectado",
        });
        toast(
          `Integração pronta. ${result.sheets?.length || 0} abas disponíveis.`,
          "success",
        );
      } catch (error) {
        patchUi({
          integrationStatus: "error",
          integrationLabel: "Falha de integração",
        });
        toast(error.message, "error");
      }
    });

  document
    .getElementById("settings-list-users-btn")
    ?.addEventListener("click", async () => {
      try {
        const result = await SheetsService.listUsers();
        renderUsersList(
          document.getElementById("settings-users-list"),
          result.users || [],
        );
        toast("Usuários atualizados.", "success");
      } catch (error) {
        toast(error.message, "error");
      }
    });

  document
    .getElementById("settings-logout-btn")
    ?.addEventListener("click", () => {
      clearAuthSession();
      resetDbConnection();
      window.location.reload();
    });

  document
    .getElementById("create-user-btn")
    ?.addEventListener("click", async () => {
      try {
        const name = document.getElementById("new-user-name")?.value?.trim();
        const login = document.getElementById("new-user-login")?.value?.trim();
        const password =
          document.getElementById("new-user-password")?.value || "";
        const role =
          document.getElementById("new-user-role")?.value || "member";
        const workspaceKey =
          document.getElementById("new-user-workspace")?.value?.trim() ||
          "gustavo";

        if (!name || !login || !password) {
          toast("Preencha nome, login e senha.", "error");
          return;
        }

        await SheetsService.createUser({
          name,
          login,
          password,
          role,
          workspaceKey,
        });
        toast(`Usuário ${name} criado com sucesso.`, "success");

        document.getElementById("new-user-name").value = "";
        document.getElementById("new-user-login").value = "";
        document.getElementById("new-user-password").value = "";
        document.getElementById("settings-list-users-btn")?.click();
      } catch (error) {
        toast(error.message, "error");
      }
    });
}
