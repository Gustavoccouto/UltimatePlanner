import { pageHeader, toast, confirmDialog } from "../ui.js";
import {
  DEFAULT_APPS_SCRIPT_URL,
  clearAuthSession,
  getAppsScriptUrl,
  getAuthSession,
  setAppsScriptUrl,
} from "../config.js";
import {
  deleteCurrentWorkspaceDb,
  resetDbConnection,
} from "../services/storage.js";
import { SheetsService } from "../services/sheets.js";
import { patchUi } from "../state.js";

function roleBadge(role = "member") {
  if (role === "owner") return "owner";
  if (role === "admin") return "admin";
  return "member";
}

export function renderSettings() {
  const currentUrl = getAppsScriptUrl();
  const session = getAuthSession();
  const currentUser = session?.user;
  const canManageUsers = ["owner", "admin"].includes(currentUser?.role);

  return `
    ${pageHeader(
      "Configurações",
      "Preferências visuais, integração com Google Apps Script e limpeza completa do ambiente de testes.",
    )}

    <section class="module-stack">
      <section class="card p-4 md:p-6 overflow-hidden">
        <div class="section-head section-head-spaced">
          <div>
            <div class="text-sm text-slate-500">Integração</div>
            <div class="section-title">Google Apps Script</div>
          </div>
          <span class="badge badge-muted">Estado atual</span>
        </div>

        <div class="grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
          <div class="space-y-4">
            <div>
              <label class="text-sm font-semibold mb-2 block">URL do Web App</label>
              <input id="settings-apps-script-url" class="field" value="${currentUrl}" />
            </div>
            <div class="flex flex-wrap gap-2">
              <button id="save-settings-btn" class="action-btn action-btn-primary">Salvar URL</button>
              <button id="test-settings-btn" class="action-btn">Testar integração</button>
              <button id="reset-settings-btn" class="action-btn">Restaurar padrão</button>
            </div>
            <div class="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">
              O app usa JSONP via GET para evitar CORS no localhost. O deploy do Apps Script precisa estar publicado como Web App público.
            </div>
          </div>

          <div class="rounded-[26px] border border-slate-200 bg-slate-50/80 p-5 space-y-3">
            <div class="text-sm text-slate-500">Diagnóstico rápido</div>
            <ol class="text-sm text-slate-700 space-y-2 list-decimal pl-5">
              <li>Cole o ID da planilha dentro do <code>Code.gs</code>.</li>
              <li>Faça <strong>Deploy &gt; New deployment</strong>.</li>
              <li>Escolha <strong>Web app</strong>.</li>
              <li>Execute como você.</li>
              <li>Acesso: <strong>Anyone</strong>.</li>
              <li>Salve a URL publicada aqui no app.</li>
            </ol>
          </div>
        </div>
      </section>

      <section class="card p-4 md:p-6 overflow-hidden">
        <div class="section-head section-head-spaced">
          <div>
            <div class="text-sm text-slate-500">Acesso atual</div>
            <div class="section-title">Sessão e workspace</div>
          </div>
          <span class="badge badge-muted">${roleBadge(currentUser?.role)}</span>
        </div>

        <div class="grid lg:grid-cols-[0.9fr_1.1fr] gap-6 items-start">
          <div class="rounded-[28px] border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
            <div class="flex items-center gap-4">
              <div class="h-14 w-14 rounded-full bg-slate-900 text-white flex items-center justify-center text-xl font-bold">
                ${String(currentUser?.name || "U").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div class="text-lg font-bold text-slate-900">${currentUser?.name || "Sem sessão"}</div>
                <div class="text-sm text-slate-500">@${currentUser?.login || "—"}</div>
                <div class="text-sm text-slate-500">workspace ${currentUser?.workspaceKey || "—"}</div>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button id="settings-list-users-btn" class="action-btn">Atualizar usuários</button>
              <button id="settings-logout-btn" class="action-btn">Sair deste dispositivo</button>
            </div>
          </div>

          <div id="settings-users-list" class="grid gap-3"></div>
        </div>
      </section>

      <section class="card p-4 md:p-6 overflow-hidden">
        <div class="section-head section-head-spaced">
          <div>
            <div class="text-sm text-slate-500">Gestão</div>
            <div class="section-title">Criar novo acesso</div>
          </div>
          <span class="badge badge-muted">${canManageUsers ? "liberado" : "somente owner/admin"}</span>
        </div>

        <form id="create-user-form" class="grid md:grid-cols-2 gap-4">
          <div><label class="text-sm font-semibold mb-2 block">Nome</label><input id="new-user-name" class="field" ${canManageUsers ? "" : "disabled"} /></div>
          <div><label class="text-sm font-semibold mb-2 block">Login</label><input id="new-user-login" class="field" ${canManageUsers ? "" : "disabled"} /></div>
          <div><label class="text-sm font-semibold mb-2 block">Senha inicial</label><input id="new-user-password" type="password" class="field" ${canManageUsers ? "" : "disabled"} /></div>
          <div><label class="text-sm font-semibold mb-2 block">Role</label><select id="new-user-role" class="select" ${canManageUsers ? "" : "disabled"}><option value="member">member</option><option value="admin">admin</option></select></div>
          <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Workspace</label><input id="new-user-workspace" class="field" value="${currentUser?.workspaceKey || "gustavo"}" ${canManageUsers ? "" : "disabled"} /></div>
          <div class="md:col-span-2 text-sm text-slate-500">Use o mesmo workspace para compartilhar os mesmos dados. Use outro para separar completamente.</div>
          <div class="md:col-span-2 flex justify-end"><button id="create-user-btn" class="action-btn action-btn-primary" type="submit" ${canManageUsers ? "" : "disabled"}>Criar usuário</button></div>
        </form>
      </section>

      <section class="card p-4 md:p-6 overflow-hidden border border-rose-200 bg-rose-50/70">
        <div class="section-head section-head-spaced">
          <div>
            <div class="text-sm text-rose-600">Zona de reset</div>
            <div class="section-title text-slate-900">Excluir todos os dados locais e remotos</div>
          </div>
          <span class="badge badge-danger">ação irreversível</span>
        </div>

        <div class="grid lg:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
          <div class="space-y-3 text-sm text-slate-700">
            <p>Esse botão apaga a base local do <strong>workspace atual</strong> no IndexedDB e também dispara o reset remoto via Apps Script para limpar a pasta/base vinculada ao mesmo workspace.</p>
            <p>Foi pensado para seu ciclo de testes: você reseta tudo, recarrega o app e começa do zero sem lixo de sync nem dados antigos.</p>
          </div>
          <div class="rounded-[24px] border border-rose-200 bg-white p-5 space-y-4 shadow-sm">
            <div class="text-sm text-slate-500">Use quando quiser reiniciar o ambiente inteiro de teste.</div>
            <button id="reset-all-data-btn" class="action-btn w-full justify-center" style="background:#7f1d1d;color:#fff;border-color:#7f1d1d">Excluir tudo do workspace atual</button>
          </div>
        </div>
      </section>
    </section>`;
}

function renderUsersList(root, users = []) {
  if (!root) return;

  if (!users.length) {
    root.innerHTML = `
      <div class="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 p-5 text-sm text-slate-500">
        Nenhum usuário retornado para este workspace.
      </div>`;
    return;
  }

  root.innerHTML = users
    .map(
      (user) => `
        <article class="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-4">
          <div class="h-12 w-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold">
            ${String(user.name || "U").slice(0, 1).toUpperCase()}
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-bold text-slate-900">${user.name}</div>
            <div class="text-sm text-slate-500">@${user.login}</div>
          </div>
          <span class="badge badge-muted">${roleBadge(user.role)}</span>
        </article>`,
    )
    .join("");
}

export function bindSettingsEvents() {
  document.getElementById("save-settings-btn")?.addEventListener("click", () => {
    const value =
      document.getElementById("settings-apps-script-url")?.value?.trim() ||
      DEFAULT_APPS_SCRIPT_URL;
    setAppsScriptUrl(value);
    patchUi({ integrationStatus: "ready", integrationLabel: "URL salva" });
    toast("URL do Apps Script salva com sucesso.", "success");
  });

  document.getElementById("reset-settings-btn")?.addEventListener("click", () => {
    setAppsScriptUrl(DEFAULT_APPS_SCRIPT_URL);
    const input = document.getElementById("settings-apps-script-url");
    if (input) input.value = DEFAULT_APPS_SCRIPT_URL;
    patchUi({
      integrationStatus: "ready",
      integrationLabel: "URL padrão restaurada",
    });
    toast("URL padrão restaurada.", "success");
  });

  document.getElementById("test-settings-btn")?.addEventListener("click", async () => {
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
        renderUsersList(document.getElementById("settings-users-list"), result.users || []);
        toast("Usuários atualizados.", "success");
      } catch (error) {
        toast(error.message, "error");
      }
    });

  document.getElementById("settings-logout-btn")?.addEventListener("click", () => {
    clearAuthSession();
    resetDbConnection();
    window.location.reload();
  });

  document.getElementById("create-user-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const name = document.getElementById("new-user-name")?.value?.trim();
      const login = document.getElementById("new-user-login")?.value?.trim();
      const password = document.getElementById("new-user-password")?.value || "";
      const role = document.getElementById("new-user-role")?.value || "member";
      const workspaceKey =
        document.getElementById("new-user-workspace")?.value?.trim() || "gustavo";

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

  document.getElementById("reset-all-data-btn")?.addEventListener("click", () => {
    confirmDialog({
      title: "Excluir todos os dados do workspace atual",
      message:
        "Isso apaga os dados locais do navegador e também executa o reset remoto no Apps Script. Use apenas quando quiser reiniciar o ambiente inteiro de testes.",
      confirmText: "Excluir tudo",
      tone: "danger",
      onConfirm: async () => {
        patchUi({
          integrationStatus: "testing",
          integrationLabel: "Excluindo dados locais e remotos…",
        });

        await SheetsService.resetAll();
        await deleteCurrentWorkspaceDb();
        resetDbConnection();

        patchUi({
          integrationStatus: "ready",
          integrationLabel: "Workspace limpo com sucesso",
        });
        toast("Todos os dados locais e remotos foram excluídos. Recarregando…", "success");
        window.setTimeout(() => window.location.reload(), 250);
      },
    });
  });
}
