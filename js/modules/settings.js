import { pageHeader, toast } from '../ui.js';
import { DEFAULT_APPS_SCRIPT_URL } from '../config.js';
import { SheetsService } from '../services/sheets.js';
import { patchUi } from '../state.js';

export function renderSettings() {
  const currentUrl = localStorage.getItem('wiseplan_apps_script_url') || DEFAULT_APPS_SCRIPT_URL;
  return `
    ${pageHeader('Configurações', 'Preferências visuais e integração com Google Apps Script.')}
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
    </section>`;
}

export function bindSettingsEvents() {
  document.getElementById('save-settings-btn')?.addEventListener('click', () => {
    const value = document.getElementById('settings-apps-script-url')?.value?.trim() || DEFAULT_APPS_SCRIPT_URL;
    localStorage.setItem('wiseplan_apps_script_url', value);
    patchUi({ integrationStatus: 'ready', integrationLabel: 'URL salva' });
    toast('URL do Apps Script salva com sucesso.', 'success');
  });

  document.getElementById('reset-settings-btn')?.addEventListener('click', () => {
    localStorage.setItem('wiseplan_apps_script_url', DEFAULT_APPS_SCRIPT_URL);
    const input = document.getElementById('settings-apps-script-url');
    if (input) input.value = DEFAULT_APPS_SCRIPT_URL;
    patchUi({ integrationStatus: 'ready', integrationLabel: 'URL padrão restaurada' });
    toast('URL padrão restaurada.', 'success');
  });

  document.getElementById('test-settings-btn')?.addEventListener('click', async () => {
    try {
      patchUi({ integrationStatus: 'testing', integrationLabel: 'Testando integração…' });
      const result = await SheetsService.diagnose();
      patchUi({ integrationStatus: 'online', integrationLabel: 'Apps Script conectado' });
      toast(`Integração pronta. ${result.sheets?.length || 0} abas disponíveis.`, 'success');
    } catch (error) {
      patchUi({ integrationStatus: 'error', integrationLabel: 'Falha de integração' });
      toast(error.message, 'error');
    }
  });
}
