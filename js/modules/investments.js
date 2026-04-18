import { state, loadState } from '../state.js';
import {
  pageHeader,
  openModal,
  closeModal,
  toast,
  confirmDialog,
} from '../ui.js';
import { currency, percent, datePt } from '../utils/formatters.js';
import { putOne, getOne, bulkPut } from '../services/storage.js';
import { enqueueSync } from '../services/sync.js';
import { createId } from '../utils/ids.js';
import { nowIso, formatDateInput, compareDateInputs } from '../utils/dates.js';
import {
  validateRequired,
  validatePositive,
  validateNonNegative,
} from '../utils/validators.js';
import { getCurrentUser } from './onboarding.js';

const INVESTMENT_KINDS = {
  broker: 'broker_account',
  position: 'position',
  movement: 'movement',
  allocationTarget: 'allocation_target',
};

const ASSET_TYPES = [
  ['stock', 'Ações'],
  ['etf', 'ETFs'],
  ['fii', 'FIIs'],
  ['fixed_income', 'Renda fixa'],
  ['broker_cash', 'Caixa da corretora'],
  ['other', 'Outros'],
];

const MOVEMENT_TYPES = {
  cashIn: 'cash_in',
  cashOut: 'cash_out',
  buy: 'buy',
  sell: 'sell',
  dividend: 'dividend',
  yield: 'yield',
  fee: 'fee',
  manualAdjustment: 'manual_adjustment',
  initialPosition: 'initial_position',
};

const CASH_DESTINATIONS = {
  brokerCash: 'broker_cash',
  bankAccount: 'bank_account',
};

const TARGET_SCOPES = {
  assetType: 'asset_type',
  asset: 'asset',
};

let selectedBrokerFilter = 'all';

export function renderInvestments() {
  const model = buildInvestmentModel();
  const filteredPositions = filterByBroker(model.positions);
  const filteredMovements = filterByBroker(model.movements)
    .sort((a, b) => compareDateInputs(b.date, a.date))
    .slice(0, 12);

  return `
    ${pageHeader(
      'Investimentos',
      'Controle corretoras, posições, movimentações, caixa e alocação sem misturar investimento com despesa comum.',
      `
        <button id="new-broker-account-btn" class="primary-btn"><i class="fa-solid fa-building-columns"></i> Nova corretora</button>
        <button id="new-investment-btn" class="action-btn"><i class="fa-solid fa-plus"></i> Posição inicial</button>
        <button id="new-investment-movement-btn" class="action-btn"><i class="fa-solid fa-arrow-right-arrow-left"></i> Movimentação</button>
        <button id="new-allocation-target-btn" class="action-btn"><i class="fa-solid fa-bullseye"></i> Alocação alvo</button>
      `,
    )}

    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6 investment-summary-grid">
      ${metricCard('Total investido', currency(model.totals.investedCost), 'fa-wallet')}
      ${metricCard('Valor atual', currency(model.totals.currentValue), 'fa-chart-line')}
      ${metricCard('Resultado', `${currency(model.totals.profitLoss)} • ${percent(model.totals.profitLossPercent)}`, 'fa-sparkles')}
      ${metricCard('Caixa em corretoras', currency(model.totals.cashBalance), 'fa-vault')}
    </section>

    <section class="card p-4 md:p-5 mb-6">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="section-title">Visão consolidada</h2>
          <p class="text-sm text-slate-500">Filtre por corretora e acompanhe posições, caixa e movimentações.</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <label for="investment-broker-filter" class="text-sm font-semibold text-slate-600">Corretora</label>
          <select id="investment-broker-filter" class="field min-w-[220px]">
            <option value="all" ${selectedBrokerFilter === 'all' ? 'selected' : ''}>Todas</option>
            ${model.brokers.map((broker) => `
              <option value="${broker.id}" ${selectedBrokerFilter === broker.id ? 'selected' : ''}>${broker.name}</option>
            `).join('')}
          </select>
        </div>
      </div>
    </section>

    <section class="grid gap-5 mb-6">
      <div class="card p-4 md:p-5">
        <div class="section-head section-head-spaced items-start gap-4">
          <div>
            <h2 class="section-title">Corretoras / contas de investimento</h2>
            <p class="text-sm text-slate-500">Caixa e patrimônio agrupados por instituição.</p>
          </div>
        </div>
        <div class="grid gap-4 mt-4">
          ${model.brokers.length ? model.brokers.map((broker) => renderBrokerCard(broker, model)).join('') : emptyState('Nenhuma corretora cadastrada', 'Crie uma corretora para separar seus investimentos.')}
        </div>
      </div>

      <div class="card p-4 md:p-5">
        <div class="section-head section-head-spaced items-start gap-4">
          <div>
            <h2 class="section-title">Distribuição</h2>
            <p class="text-sm text-slate-500">Por tipo de ativo e corretora.</p>
          </div>
        </div>
        <div class="mt-4 space-y-3">
          ${model.distributionByType.length ? model.distributionByType.map((item) => distributionLine(item.label, item.value, model.totals.currentValue)).join('') : emptyInline('Sem posições para calcular distribuição.')}
        </div>
      </div>
    </section>

    <section class="card p-4 md:p-5 mb-6">
      <div class="section-head section-head-spaced items-start gap-4">
        <div>
          <h2 class="section-title">Posições</h2>
          <p class="text-sm text-slate-500">Quantidade, preço médio, custo, valor atual e proventos por ativo.</p>
        </div>
        <span class="badge badge-muted">${filteredPositions.length} posição(ões)</span>
      </div>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mt-4">
        ${filteredPositions.length ? filteredPositions.map((position) => renderPositionCard(position, model)).join('') : emptyState('Nenhuma posição encontrada', 'Cadastre uma posição inicial ou registre uma compra de ativo.')}
      </div>
    </section>

    <section class="grid gap-5 xl:grid-cols-[1fr_1fr] mb-6">
      <div class="card p-4 md:p-5">
        <div class="section-head section-head-spaced items-start gap-4">
          <div>
            <h2 class="section-title">Planejamento de alocação</h2>
            <p class="text-sm text-slate-500">Compare percentual atual com a alocação alvo definida por você.</p>
          </div>
        </div>
        <div class="overflow-x-auto mt-4">
          ${renderAllocationTable(model)}
        </div>
      </div>

      <div class="card p-4 md:p-5">
        <div class="section-head section-head-spaced items-start gap-4">
          <div>
            <h2 class="section-title">Histórico recente</h2>
            <p class="text-sm text-slate-500">Movimentações com origem, destino e usuário responsável.</p>
          </div>
        </div>
        <div class="mt-4">
          ${filteredMovements.length ? filteredMovements.map((movement) => renderMovementLine(movement, model)).join('') : emptyInline('Nenhuma movimentação registrada.')}
        </div>
      </div>
    </section>
  `;
}

export function bindInvestmentsEvents() {
  document
    .getElementById('new-broker-account-btn')
    ?.addEventListener('click', () => openBrokerModal());

  document
    .getElementById('new-investment-btn')
    ?.addEventListener('click', () => openPositionModal());

  document
    .getElementById('new-investment-movement-btn')
    ?.addEventListener('click', () => openMovementModal());

  document
    .getElementById('new-allocation-target-btn')
    ?.addEventListener('click', () => openAllocationTargetModal());

  document
    .getElementById('investment-broker-filter')
    ?.addEventListener('change', async (event) => {
      selectedBrokerFilter = event.target.value || 'all';
      await loadState();
    });

  document.querySelectorAll('[data-broker-edit]').forEach((button) => {
    button.addEventListener('click', () => openBrokerModal(button.dataset.brokerEdit));
  });

  document.querySelectorAll('[data-broker-delete]').forEach((button) => {
    button.addEventListener('click', () => confirmDeleteInvestmentRecord(button.dataset.brokerDelete, 'Corretora'));
  });

  document.querySelectorAll('[data-investment-edit]').forEach((button) => {
    button.addEventListener('click', () => openPositionModal(button.dataset.investmentEdit));
  });

  document.querySelectorAll('[data-investment-delete]').forEach((button) => {
    button.addEventListener('click', () => confirmDeleteInvestmentRecord(button.dataset.investmentDelete, 'Posição'));
  });

  document.querySelectorAll('[data-movement-edit]').forEach((button) => {
    button.addEventListener('click', () => openMovementModal(button.dataset.movementEdit));
  });

  document.querySelectorAll('[data-movement-delete]').forEach((button) => {
    button.addEventListener('click', () => confirmDeleteInvestmentRecord(button.dataset.movementDelete, 'Movimentação'));
  });

  document.querySelectorAll('[data-allocation-edit]').forEach((button) => {
    button.addEventListener('click', () => openAllocationTargetModal(button.dataset.allocationEdit));
  });

  document.querySelectorAll('[data-allocation-delete]').forEach((button) => {
    button.addEventListener('click', () => confirmDeleteInvestmentRecord(button.dataset.allocationDelete, 'Alocação alvo'));
  });
}

function buildInvestmentModel() {
  const rawRecords = state.data.investments.filter((item) => !item.isDeleted);
  const brokerRecords = rawRecords.filter((item) => item.kind === INVESTMENT_KINDS.broker);
  const positionRecords = rawRecords
    .filter((item) => isPositionRecord(item))
    .map(normalizePositionRecord);
  const movementRecords = rawRecords
    .filter((item) => item.kind === INVESTMENT_KINDS.movement)
    .map(normalizeMovementRecord);
  const allocationTargets = rawRecords
    .filter((item) => item.kind === INVESTMENT_KINDS.allocationTarget)
    .map(normalizeAllocationTarget);

  const legacyBrokerNames = [...new Set(
    positionRecords
      .filter((item) => !item.brokerId && item.broker)
      .map((item) => String(item.broker || '').trim())
      .filter(Boolean),
  )];

  const inferredBrokers = legacyBrokerNames.map((name) => ({
    id: `legacy_broker_${slugify(name)}`,
    name,
    institution: name,
    kind: INVESTMENT_KINDS.broker,
    isInferred: true,
  }));

  const brokers = [...brokerRecords, ...inferredBrokers]
    .map(normalizeBrokerRecord)
    .sort((a, b) => a.name.localeCompare(b.name));

  const cashByBroker = calculateCashByBroker(movementRecords);
  const dividendsByPosition = calculateDividendsByPosition(movementRecords);
  const movementsByPosition = groupBy(movementRecords, (item) => item.positionId || '');

  const positions = positionRecords.map((position) => {
    const movementSummary = movementsByPosition[position.id] || [];
    return {
      ...position,
      brokerName: getBrokerName(position, brokers),
      receivedProceeds: dividendsByPosition[position.id] || 0,
      movementsCount: movementSummary.length,
    };
  });

  const investedCost = positions.reduce((sum, item) => sum + Number(item.amountInvested || 0), 0);
  const currentValue = positions.reduce((sum, item) => sum + Number(item.currentValue || 0), 0);
  const cashBalance = Object.values(cashByBroker).reduce((sum, value) => sum + Number(value || 0), 0);
  const proceeds = movementRecords
    .filter((item) => [MOVEMENT_TYPES.dividend, MOVEMENT_TYPES.yield].includes(item.movementType))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const deposits = movementRecords
    .filter((item) => item.movementType === MOVEMENT_TYPES.cashIn)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const withdrawals = movementRecords
    .filter((item) => item.movementType === MOVEMENT_TYPES.cashOut)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const profitLoss = currentValue - investedCost;
  const profitLossPercent = investedCost ? (profitLoss / investedCost) * 100 : 0;

  const distributionByType = buildDistributionByType(positions);
  const distributionByBroker = buildDistributionByBroker(positions, brokers, cashByBroker);

  return {
    brokers,
    positions,
    movements: movementRecords,
    allocationTargets,
    cashByBroker,
    distributionByType,
    distributionByBroker,
    totals: {
      investedCost,
      currentValue,
      cashBalance,
      portfolioValue: currentValue + cashBalance,
      profitLoss,
      profitLossPercent,
      proceeds,
      deposits,
      withdrawals,
    },
  };
}

function isPositionRecord(item) {
  return !item.kind || item.kind === INVESTMENT_KINDS.position;
}

function normalizeBrokerRecord(record) {
  return {
    ...record,
    kind: INVESTMENT_KINDS.broker,
    name: record.name || record.institution || record.broker || 'Corretora',
    institution: record.institution || record.name || record.broker || 'Corretora',
  };
}

function normalizePositionRecord(record) {
  const quantity = Number(record.quantity || 0);
  const averagePrice = Number(record.averagePrice || record.unitPrice || 0);
  const amountInvested = Number(record.amountInvested || (quantity * averagePrice) || 0);
  const currentValue = Number(record.currentValue || amountInvested || 0);
  const ticker = String(record.ticker || record.name || '').trim().toUpperCase();

  return {
    ...record,
    kind: INVESTMENT_KINDS.position,
    assetType: record.assetType || record.type || 'other',
    ticker,
    name: record.name || ticker || 'Ativo',
    quantity,
    averagePrice,
    amountInvested,
    currentValue,
    referenceDate: record.referenceDate || record.purchaseDate || formatDateInput(),
  };
}

function normalizeMovementRecord(record) {
  return {
    ...record,
    kind: INVESTMENT_KINDS.movement,
    movementType: record.movementType || record.type || MOVEMENT_TYPES.manualAdjustment,
    amount: Number(record.amount || 0),
    quantity: Number(record.quantity || 0),
    unitPrice: Number(record.unitPrice || 0),
    date: record.date || formatDateInput(),
    cashDestination: record.cashDestination || CASH_DESTINATIONS.brokerCash,
  };
}

function normalizeAllocationTarget(record) {
  return {
    ...record,
    kind: INVESTMENT_KINDS.allocationTarget,
    targetScope: record.targetScope || TARGET_SCOPES.assetType,
    targetKey: record.targetKey || record.assetType || record.ticker || '',
    label: record.label || getAssetTypeLabel(record.targetKey || record.assetType) || record.targetKey || 'Alvo',
    targetPercent: Number(record.targetPercent || 0),
  };
}

function filterByBroker(items = []) {
  if (selectedBrokerFilter === 'all') return items;
  return items.filter((item) => item.brokerId === selectedBrokerFilter || getLegacyBrokerId(item.broker) === selectedBrokerFilter);
}

function calculateCashByBroker(movements = []) {
  return movements.reduce((acc, movement) => {
    const brokerId = movement.brokerId || 'unassigned';
    if (!acc[brokerId]) acc[brokerId] = 0;
    const amount = Number(movement.amount || 0);

    if (movement.movementType === MOVEMENT_TYPES.cashIn) acc[brokerId] += amount;
    if (movement.movementType === MOVEMENT_TYPES.cashOut) acc[brokerId] -= amount;
    if (movement.movementType === MOVEMENT_TYPES.buy) acc[brokerId] -= amount;
    if (movement.movementType === MOVEMENT_TYPES.sell && movement.cashDestination !== CASH_DESTINATIONS.bankAccount) acc[brokerId] += amount;
    if ([MOVEMENT_TYPES.dividend, MOVEMENT_TYPES.yield].includes(movement.movementType) && movement.cashDestination !== CASH_DESTINATIONS.bankAccount) acc[brokerId] += amount;
    if (movement.movementType === MOVEMENT_TYPES.fee) acc[brokerId] -= amount;
    if (movement.movementType === MOVEMENT_TYPES.manualAdjustment) acc[brokerId] += amount;

    return acc;
  }, {});
}

function calculateDividendsByPosition(movements = []) {
  return movements.reduce((acc, movement) => {
    if (![MOVEMENT_TYPES.dividend, MOVEMENT_TYPES.yield].includes(movement.movementType)) return acc;
    const key = movement.positionId || '';
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + Number(movement.amount || 0);
    return acc;
  }, {});
}

function buildDistributionByType(positions = []) {
  const grouped = groupBy(positions, (item) => item.assetType || 'other');
  return Object.entries(grouped)
    .map(([type, items]) => ({
      key: type,
      label: getAssetTypeLabel(type),
      value: items.reduce((sum, item) => sum + Number(item.currentValue || 0), 0),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

function buildDistributionByBroker(positions = [], brokers = [], cashByBroker = {}) {
  const grouped = groupBy(positions, (item) => item.brokerId || getLegacyBrokerId(item.broker) || 'unassigned');
  const brokerMap = new Map(brokers.map((broker) => [broker.id, broker]));

  return Object.entries(grouped).map(([brokerId, items]) => ({
    brokerId,
    label: brokerMap.get(brokerId)?.name || 'Sem corretora',
    value: items.reduce((sum, item) => sum + Number(item.currentValue || 0), 0) + Number(cashByBroker[brokerId] || 0),
  }));
}

function renderBrokerCard(broker, model) {
  const positions = model.positions.filter((item) => item.brokerId === broker.id || getLegacyBrokerId(item.broker) === broker.id);
  const value = positions.reduce((sum, item) => sum + Number(item.currentValue || 0), 0);
  const cost = positions.reduce((sum, item) => sum + Number(item.amountInvested || 0), 0);
  const cash = Number(model.cashByBroker[broker.id] || 0);
  const total = value + cash;
  const result = value - cost;
  const resultPercent = cost ? (result / cost) * 100 : 0;
  const disabledActions = broker.isInferred ? 'opacity-50 pointer-events-none' : '';
  const topPositions = [...positions]
    .sort((a, b) => Number(b.currentValue || 0) - Number(a.currentValue || 0))
    .slice(0, 3);

  return `
    <article class="relative overflow-hidden rounded-[30px] border border-slate-200 bg-white p-5 md:p-6 shadow-[0_24px_70px_-44px_rgba(15,23,42,.55)]">
      <div class="absolute inset-y-0 left-0 w-1.5 bg-slate-950"></div>
      <div class="grid gap-5 lg:grid-cols-[minmax(240px,.85fr)_minmax(0,1.2fr)_auto] lg:items-center pl-2">
        <div class="min-w-0">
          <div class="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 mb-4">
            <i class="fa-solid fa-building-columns"></i>
          </div>
          <div class="compact-stat-label">Corretora</div>
          <h3 class="text-[clamp(1.5rem,3.2vw,2.4rem)] leading-none font-black tracking-[-0.05em] text-slate-950 mt-2 break-words">${broker.name}</h3>
          <p class="text-sm text-slate-500 mt-3 max-w-[46ch]">${broker.notes || broker.institution || 'Conta de investimento'}</p>
          <div class="flex items-center gap-2 mt-4 flex-wrap">
            <span class="badge badge-muted">${positions.length} ativo(s)</span>
            <span class="badge ${result >= 0 ? 'badge-success' : 'badge-danger'}">${percent(resultPercent)}</span>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-3">
          ${brokerInfoBlock('Patrimônio', currency(value))}
          ${brokerInfoBlock('Caixa', currency(cash))}
          ${brokerInfoBlock('Total na corretora', currency(total))}
          ${brokerInfoBlock('Custo base', currency(cost))}
          ${brokerInfoBlock('Resultado', currency(result), result >= 0 ? 'text-emerald-600' : 'text-rose-600')}
          ${brokerInfoBlock('Principais ativos', topPositions.length ? topPositions.map((item) => item.ticker || item.name).join(', ') : 'Sem ativos')}
        </div>

        <div class="flex gap-2 lg:flex-col lg:items-stretch ${disabledActions}">
          <button class="action-btn justify-center" data-broker-edit="${broker.id}">Editar</button>
          <button class="danger-btn justify-center" data-broker-delete="${broker.id}">Excluir</button>
        </div>
      </div>
    </article>
  `;
}

function renderPositionCard(position, model) {
  const profit = Number(position.currentValue || 0) - Number(position.amountInvested || 0);
  const profitability = position.amountInvested ? (profit / position.amountInvested) * 100 : 0;

  return `
    <article class="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-32px_rgba(15,23,42,.45)]">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">${getAssetTypeLabel(position.assetType)}</div>
          <h3 class="text-xl font-extrabold text-slate-950 mt-2 truncate">${position.ticker || position.name}</h3>
          <p class="text-sm text-slate-500 mt-1">${position.name}${position.brokerName ? ` • ${position.brokerName}` : ''}</p>
        </div>
        <span class="badge ${profit >= 0 ? 'badge-success' : 'badge-danger'}">${percent(profitability)}</span>
      </div>
      <div class="grid grid-cols-2 gap-4 mt-5 text-sm">
        <div>
          <div class="text-slate-400">Quantidade</div>
          <div class="font-bold text-slate-950">${formatQuantity(position.quantity)}</div>
        </div>
        <div>
          <div class="text-slate-400">Preço médio</div>
          <div class="font-bold text-slate-950">${currency(position.averagePrice)}</div>
        </div>
        <div>
          <div class="text-slate-400">Custo</div>
          <div class="font-bold text-slate-950">${currency(position.amountInvested)}</div>
        </div>
        <div>
          <div class="text-slate-400">Valor atual</div>
          <div class="font-bold text-slate-950">${currency(position.currentValue)}</div>
        </div>
      </div>
      <div class="rounded-2xl bg-slate-50 p-3 mt-5 text-sm text-slate-600">
        Proventos/rendimentos: <strong>${currency(position.receivedProceeds)}</strong>
      </div>
      <div class="flex items-center gap-2 mt-5 flex-wrap">
        <button class="action-btn" data-investment-edit="${position.id}">Editar</button>
        <button class="action-btn" data-movement-edit="new:${position.id}">Movimentar</button>
        <button class="danger-btn" data-investment-delete="${position.id}">Excluir</button>
      </div>
    </article>
  `;
}

function renderAllocationTable(model) {
  if (!model.allocationTargets.length) {
    return emptyState('Nenhum alvo definido', 'Defina percentuais alvo por classe ou ativo para planejar o próximo aporte.');
  }

  const totalValue = model.totals.currentValue || 0;
  const byType = Object.fromEntries(model.distributionByType.map((item) => [item.key, item.value]));
  const byAsset = Object.fromEntries(model.positions.map((item) => [item.ticker || item.name, Number(item.currentValue || 0)]));

  return `
    <table class="min-w-full text-sm">
      <thead>
        <tr class="text-left text-slate-400 border-b border-slate-100">
          <th class="py-3 pr-4">Alvo</th>
          <th class="py-3 pr-4">Atual</th>
          <th class="py-3 pr-4">Desejado</th>
          <th class="py-3 pr-4">Diferença</th>
          <th class="py-3 pr-4">Ações</th>
        </tr>
      </thead>
      <tbody>
        ${model.allocationTargets.map((target) => {
          const currentValue = target.targetScope === TARGET_SCOPES.asset
            ? Number(byAsset[target.targetKey] || 0)
            : Number(byType[target.targetKey] || 0);
          const currentPercent = totalValue ? (currentValue / totalValue) * 100 : 0;
          const diff = currentPercent - Number(target.targetPercent || 0);
          return `
            <tr class="border-b border-slate-100 last:border-b-0">
              <td class="py-3 pr-4 font-semibold text-slate-950">${target.label}</td>
              <td class="py-3 pr-4">${percent(currentPercent)}</td>
              <td class="py-3 pr-4">${percent(target.targetPercent)}</td>
              <td class="py-3 pr-4 ${diff <= 0 ? 'text-emerald-600' : 'text-rose-600'}">${diff <= 0 ? 'Abaixo' : 'Acima'} ${percent(Math.abs(diff))}</td>
              <td class="py-3 pr-4 whitespace-nowrap">
                <button class="action-btn" data-allocation-edit="${target.id}">Editar</button>
                <button class="danger-btn" data-allocation-delete="${target.id}">Excluir</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderMovementLine(movement, model) {
  const broker = model.brokers.find((item) => item.id === movement.brokerId);
  const position = model.positions.find((item) => item.id === movement.positionId);
  const account = state.data.accounts.find((item) => item.id === movement.bankAccountId || item.id === movement.sourceAccountId || item.id === movement.destinationAccountId);

  return `
    <div class="py-3 border-b border-slate-100 last:border-b-0">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="font-semibold text-slate-950">${getMovementTypeLabel(movement.movementType)}${position ? ` • ${position.ticker || position.name}` : ''}</div>
          <div class="text-sm text-slate-500">
            ${datePt(movement.date)} • ${broker?.name || 'Sem corretora'}${account ? ` • ${account.name}` : ''}
          </div>
          <div class="text-xs text-slate-400 mt-1">${movement.userName ? `Feito por ${movement.userName}` : 'Usuário não identificado'}</div>
        </div>
        <div class="text-right">
          <div class="font-black text-slate-950">${currency(movement.amount)}</div>
          ${movement.quantity ? `<div class="text-xs text-slate-400">Qtd. ${formatQuantity(movement.quantity)}</div>` : ''}
          <div class="flex items-center gap-2 justify-end mt-2">
            <button class="action-btn" data-movement-edit="${movement.id}">Editar</button>
            <button class="danger-btn" data-movement-delete="${movement.id}">Excluir</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function openBrokerModal(brokerId = null) {
  const existing = brokerId && !String(brokerId).startsWith('legacy_broker_') ? await getOne('investments', brokerId) : null;

  openModal(`
    <div class="modal-card max-w-xl">
      <div class="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 class="text-2xl font-black text-slate-950">${existing ? 'Editar corretora' : 'Nova corretora'}</h2>
          <p class="text-sm text-slate-500 mt-1">Separe seus investimentos por instituição ou conta.</p>
        </div>
        <button id="close-modal" class="action-btn h-10 w-10 !p-0"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="broker-account-form" class="grid gap-4">
        <input type="hidden" name="id" value="${existing?.id || ''}" />
        <label class="form-field"><span>Nome</span><input class="field" name="name" required value="${existing?.name || ''}" placeholder="Inter, XP, NuInvest..." /></label>
        <label class="form-field"><span>Instituição</span><input class="field" name="institution" value="${existing?.institution || ''}" placeholder="Banco/corretora" /></label>
        <label class="form-field"><span>Observações</span><textarea class="field" name="notes" rows="3">${existing?.notes || ''}</textarea></label>
        <div class="flex justify-end gap-3">
          <button type="button" id="cancel-broker-account" class="action-btn">Cancelar</button>
          <button class="primary-btn">${existing ? 'Salvar alterações' : 'Salvar corretora'}</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('close-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-broker-account')?.addEventListener('click', closeModal);
  document.getElementById('broker-account-form')?.addEventListener('submit', saveBrokerAccount);
}

async function openPositionModal(positionId = null) {
  const model = buildInvestmentModel();
  const existing = positionId ? await getOne('investments', positionId) : null;

  openModal(`
    <div class="modal-card max-w-2xl">
      <div class="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 class="text-2xl font-black text-slate-950">${existing ? 'Editar posição' : 'Cadastrar posição inicial'}</h2>
          <p class="text-sm text-slate-500 mt-1">Use para registrar ativos que você já possui hoje.</p>
        </div>
        <button id="close-modal" class="action-btn h-10 w-10 !p-0"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="investment-position-form" class="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="id" value="${existing?.id || ''}" />
        <label class="form-field"><span>Corretora</span><select class="field" name="brokerId" required>${brokerOptions(model.brokers, existing?.brokerId)}</select></label>
        <label class="form-field"><span>Tipo de ativo</span><select class="field" name="assetType" required>${assetTypeOptions(existing?.assetType || existing?.type)}</select></label>
        <label class="form-field"><span>Nome</span><input class="field" name="name" required value="${existing?.name || ''}" placeholder="Itaú, Tesouro Selic..." /></label>
        <label class="form-field"><span>Ticker / Identificador</span><input class="field" name="ticker" value="${existing?.ticker || ''}" placeholder="ITUB4, IVVB11..." /></label>
        <label class="form-field"><span>Quantidade</span><input class="field" name="quantity" type="number" min="0" step="0.000001" required value="${existing?.quantity ?? ''}" /></label>
        <label class="form-field"><span>Preço médio</span><input class="field" name="averagePrice" type="number" min="0" step="0.01" required value="${existing?.averagePrice || existing?.unitPrice || ''}" /></label>
        <label class="form-field"><span>Custo total</span><input class="field" name="amountInvested" type="number" min="0" step="0.01" value="${existing?.amountInvested || ''}" /></label>
        <label class="form-field"><span>Valor atual</span><input class="field" name="currentValue" type="number" min="0" step="0.01" value="${existing?.currentValue || ''}" /></label>
        <label class="form-field"><span>Data de referência</span><input class="field" name="referenceDate" type="date" value="${existing?.referenceDate || existing?.purchaseDate || formatDateInput()}" /></label>
        <label class="form-field md:col-span-2"><span>Observações</span><textarea class="field" name="notes" rows="3">${existing?.notes || ''}</textarea></label>
        <div class="md:col-span-2 flex justify-end gap-3">
          <button type="button" id="cancel-investment-position" class="action-btn">Cancelar</button>
          <button class="primary-btn">${existing ? 'Salvar alterações' : 'Salvar posição'}</button>
        </div>
      </form>
    </div>
  `);

  bindPositionComputedFields();
  document.getElementById('close-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-investment-position')?.addEventListener('click', closeModal);
  document.getElementById('investment-position-form')?.addEventListener('submit', savePosition);
}

async function openMovementModal(movementId = null) {
  const model = buildInvestmentModel();
  let existing = null;
  let preselectedPositionId = '';

  if (movementId && String(movementId).startsWith('new:')) {
    preselectedPositionId = String(movementId).replace('new:', '');
  } else if (movementId) {
    existing = await getOne('investments', movementId);
  }

  openModal(`
    <div class="modal-card max-w-2xl">
      <div class="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 class="text-2xl font-black text-slate-950">${existing ? 'Editar movimentação' : 'Nova movimentação'}</h2>
          <p class="text-sm text-slate-500 mt-1">Registre aporte, compra, venda, provento, taxa ou retirada.</p>
        </div>
        <button id="close-modal" class="action-btn h-10 w-10 !p-0"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="investment-movement-form" class="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="id" value="${existing?.id || ''}" />
        <label class="form-field"><span>Tipo</span><select class="field" id="movement-type-field" name="movementType" required>${movementTypeOptions(existing?.movementType)}</select></label>
        <label class="form-field"><span>Data</span><input class="field" name="date" type="date" required value="${existing?.date || formatDateInput()}" /></label>
        <label class="form-field"><span>Corretora</span><select class="field" id="movement-broker-field" name="brokerId" required>${brokerOptions(model.brokers, existing?.brokerId)}</select></label>
        <label class="form-field"><span>Ativo</span><select class="field" id="movement-position-field" name="positionId"><option value="">Nenhum / caixa</option>${positionOptions(model.positions, existing?.positionId || preselectedPositionId)}</select></label>
        <label class="form-field"><span>Tipo de ativo</span><select class="field" name="assetType">${assetTypeOptions(existing?.assetType)}</select></label>
        <label class="form-field"><span>Ticker / Identificador</span><input class="field" name="ticker" value="${existing?.ticker || ''}" placeholder="Opcional para compra nova" /></label>
        <label class="form-field"><span>Quantidade</span><input class="field" name="quantity" type="number" min="0" step="0.000001" value="${existing?.quantity || ''}" /></label>
        <label class="form-field"><span>Preço unitário</span><input class="field" name="unitPrice" type="number" min="0" step="0.01" value="${existing?.unitPrice || ''}" /></label>
        <label class="form-field"><span>Valor total</span><input class="field" name="amount" type="number" step="0.01" required value="${existing?.amount || ''}" /></label>
        <label class="form-field"><span>Destino do dinheiro</span><select class="field" name="cashDestination"><option value="broker_cash" ${existing?.cashDestination !== CASH_DESTINATIONS.bankAccount ? 'selected' : ''}>Caixa da corretora</option><option value="bank_account" ${existing?.cashDestination === CASH_DESTINATIONS.bankAccount ? 'selected' : ''}>Conta bancária</option></select></label>
        <label class="form-field"><span>Conta bancária</span><select class="field" name="bankAccountId"><option value="">Não vincular</option>${accountOptions(existing?.bankAccountId || existing?.sourceAccountId || existing?.destinationAccountId)}</select></label>
        <label class="form-field md:col-span-2"><span>Observações</span><textarea class="field" name="notes" rows="3">${existing?.notes || ''}</textarea></label>
        <div class="md:col-span-2 rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">
          Aportes e retiradas vinculados a uma conta bancária criam ajuste patrimonial, não receita/despesa comum.
        </div>
        <div class="md:col-span-2 flex justify-end gap-3">
          <button type="button" id="cancel-investment-movement" class="action-btn">Cancelar</button>
          <button class="primary-btn">${existing ? 'Salvar alterações' : 'Salvar movimentação'}</button>
        </div>
      </form>
    </div>
  `);

  bindMovementComputedFields();
  document.getElementById('close-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-investment-movement')?.addEventListener('click', closeModal);
  document.getElementById('investment-movement-form')?.addEventListener('submit', saveMovement);
}

async function openAllocationTargetModal(targetId = null) {
  const model = buildInvestmentModel();
  const existing = targetId ? await getOne('investments', targetId) : null;

  openModal(`
    <div class="modal-card max-w-xl">
      <div class="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 class="text-2xl font-black text-slate-950">${existing ? 'Editar alocação alvo' : 'Nova alocação alvo'}</h2>
          <p class="text-sm text-slate-500 mt-1">Planejamento simples, sem recomendação automática.</p>
        </div>
        <button id="close-modal" class="action-btn h-10 w-10 !p-0"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="allocation-target-form" class="grid gap-4">
        <input type="hidden" name="id" value="${existing?.id || ''}" />
        <label class="form-field"><span>Escopo</span><select class="field" id="allocation-scope-field" name="targetScope"><option value="asset_type" ${existing?.targetScope !== TARGET_SCOPES.asset ? 'selected' : ''}>Classe de ativo</option><option value="asset" ${existing?.targetScope === TARGET_SCOPES.asset ? 'selected' : ''}>Ativo específico</option></select></label>
        <label class="form-field"><span>Classe de ativo</span><select class="field" id="allocation-type-field" name="assetType">${assetTypeOptions(existing?.targetScope === TARGET_SCOPES.assetType ? existing?.targetKey : existing?.assetType)}</select></label>
        <label class="form-field"><span>Ativo</span><select class="field" id="allocation-asset-field" name="assetKey"><option value="">Selecione</option>${model.positions.map((position) => `<option value="${position.ticker || position.name}" ${(existing?.targetScope === TARGET_SCOPES.asset && existing?.targetKey === (position.ticker || position.name)) ? 'selected' : ''}>${position.ticker || position.name}</option>`).join('')}</select></label>
        <label class="form-field"><span>Percentual alvo</span><input class="field" name="targetPercent" type="number" min="0" max="100" step="0.1" required value="${existing?.targetPercent || ''}" /></label>
        <label class="form-field"><span>Nome exibido</span><input class="field" name="label" value="${existing?.label || ''}" placeholder="Opcional" /></label>
        <div class="flex justify-end gap-3">
          <button type="button" id="cancel-allocation-target" class="action-btn">Cancelar</button>
          <button class="primary-btn">${existing ? 'Salvar alterações' : 'Salvar alvo'}</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('close-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-allocation-target')?.addEventListener('click', closeModal);
  document.getElementById('allocation-target-form')?.addEventListener('submit', saveAllocationTarget);
}

async function saveBrokerAccount(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    validateRequired(payload.name, 'Nome da corretora');

    const timestamp = nowIso();
    const existing = payload.id ? await getOne('investments', payload.id) : null;
    const currentUser = getCurrentUser();
    const record = {
      ...existing,
      kind: INVESTMENT_KINDS.broker,
      id: payload.id || createId('broker'),
      name: payload.name.trim(),
      institution: payload.institution || payload.name.trim(),
      notes: payload.notes || '',
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      createdByUserId: existing?.createdByUserId || currentUser?.id || '',
      createdByUserName: existing?.createdByUserName || currentUser?.name || '',
      updatedByUserId: currentUser?.id || '',
      updatedByUserName: currentUser?.name || '',
      version: Number(existing?.version || 0) + 1,
      syncStatus: 'pending',
      isDeleted: false,
    };

    await putAndSync('investments', record);
    await loadState();
    closeModal();
    toast(existing ? 'Corretora atualizada.' : 'Corretora cadastrada.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function savePosition(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    validateRequired(payload.brokerId, 'Corretora');
    validateRequired(payload.assetType, 'Tipo de ativo');
    validateRequired(payload.name, 'Nome');
    validateNonNegative(payload.quantity, 'Quantidade');
    validateNonNegative(payload.averagePrice, 'Preço médio');

    const timestamp = nowIso();
    const existing = payload.id ? await getOne('investments', payload.id) : null;
    const currentUser = getCurrentUser();
    const quantity = Number(payload.quantity || 0);
    const averagePrice = Number(payload.averagePrice || 0);
    const amountInvested = Number(payload.amountInvested || (quantity * averagePrice));
    const currentValue = Number(payload.currentValue || amountInvested);
    const ticker = String(payload.ticker || payload.name || '').trim().toUpperCase();

    const record = {
      ...existing,
      kind: INVESTMENT_KINDS.position,
      id: payload.id || createId('inv'),
      brokerId: payload.brokerId,
      assetType: payload.assetType,
      type: payload.assetType,
      name: payload.name.trim(),
      ticker,
      quantity,
      averagePrice,
      amountInvested,
      currentValue,
      referenceDate: payload.referenceDate || formatDateInput(),
      purchaseDate: payload.referenceDate || existing?.purchaseDate || formatDateInput(),
      notes: payload.notes || '',
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      createdByUserId: existing?.createdByUserId || currentUser?.id || '',
      createdByUserName: existing?.createdByUserName || currentUser?.name || '',
      updatedByUserId: currentUser?.id || '',
      updatedByUserName: currentUser?.name || '',
      version: Number(existing?.version || 0) + 1,
      syncStatus: 'pending',
      isDeleted: false,
    };

    const recordsToSave = [record];

    if (!existing) {
      recordsToSave.push(buildMovementRecord({
        movementType: MOVEMENT_TYPES.initialPosition,
        brokerId: record.brokerId,
        positionId: record.id,
        assetType: record.assetType,
        ticker: record.ticker,
        amount: record.amountInvested,
        quantity: record.quantity,
        unitPrice: record.averagePrice,
        date: record.referenceDate,
        notes: 'Posição inicial cadastrada manualmente.',
      }));
    }

    await bulkPut('investments', recordsToSave, { skipInvalid: true });
    await Promise.all(recordsToSave.map((item) => enqueueSync('investments', item.id)));
    await loadState();
    closeModal();
    toast(existing ? 'Posição atualizada.' : 'Posição inicial cadastrada.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function saveMovement(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    validateRequired(payload.movementType, 'Tipo de movimentação');
    validateRequired(payload.brokerId, 'Corretora');
    validateRequired(payload.date, 'Data');
    validateRequired(payload.amount, 'Valor');

    const existing = payload.id ? await getOne('investments', payload.id) : null;
    const amount = Number(payload.amount || 0);

    if (payload.movementType !== MOVEMENT_TYPES.manualAdjustment) {
      validatePositive(amount, 'Valor');
    }

    const movement = buildMovementRecord({
      existing,
      movementType: payload.movementType,
      brokerId: payload.brokerId,
      positionId: payload.positionId || '',
      assetType: payload.assetType || '',
      ticker: payload.ticker || '',
      amount,
      quantity: Number(payload.quantity || 0),
      unitPrice: Number(payload.unitPrice || 0),
      date: payload.date,
      cashDestination: payload.cashDestination || CASH_DESTINATIONS.brokerCash,
      bankAccountId: payload.bankAccountId || '',
      notes: payload.notes || '',
    });

    const recordsToSave = [movement];
    const positionUpdate = await buildPositionUpdateFromMovement(movement, existing);
    if (positionUpdate) recordsToSave.push(positionUpdate);

    const transactionAdjustment = buildBankAdjustmentFromMovement(movement);
    if (transactionAdjustment) {
      await putAndSync('transactions', transactionAdjustment);
    }

    await bulkPut('investments', recordsToSave, { skipInvalid: true });
    await Promise.all(recordsToSave.map((item) => enqueueSync('investments', item.id)));
    await loadState();
    closeModal();
    toast(existing ? 'Movimentação atualizada.' : 'Movimentação registrada.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function saveAllocationTarget(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    validateRequired(payload.targetScope, 'Escopo');
    validatePositive(payload.targetPercent, 'Percentual alvo');

    const targetKey = payload.targetScope === TARGET_SCOPES.asset ? payload.assetKey : payload.assetType;
    validateRequired(targetKey, 'Alvo');

    const timestamp = nowIso();
    const existing = payload.id ? await getOne('investments', payload.id) : null;
    const currentUser = getCurrentUser();
    const label = payload.label || (payload.targetScope === TARGET_SCOPES.asset ? targetKey : getAssetTypeLabel(targetKey));
    const record = {
      ...existing,
      kind: INVESTMENT_KINDS.allocationTarget,
      id: payload.id || createId('allocation'),
      targetScope: payload.targetScope,
      targetKey,
      label,
      targetPercent: Number(payload.targetPercent || 0),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      createdByUserId: existing?.createdByUserId || currentUser?.id || '',
      createdByUserName: existing?.createdByUserName || currentUser?.name || '',
      updatedByUserId: currentUser?.id || '',
      updatedByUserName: currentUser?.name || '',
      version: Number(existing?.version || 0) + 1,
      syncStatus: 'pending',
      isDeleted: false,
    };

    await putAndSync('investments', record);
    await loadState();
    closeModal();
    toast(existing ? 'Alocação alvo atualizada.' : 'Alocação alvo cadastrada.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function buildMovementRecord({ existing = null, ...payload }) {
  const timestamp = nowIso();
  const currentUser = getCurrentUser();

  return {
    ...existing,
    kind: INVESTMENT_KINDS.movement,
    id: existing?.id || createId('inv_move'),
    movementType: payload.movementType,
    brokerId: payload.brokerId || '',
    positionId: payload.positionId || '',
    assetType: payload.assetType || '',
    ticker: String(payload.ticker || '').trim().toUpperCase(),
    amount: Number(payload.amount || 0),
    quantity: Number(payload.quantity || 0),
    unitPrice: Number(payload.unitPrice || 0),
    date: payload.date || formatDateInput(),
    cashDestination: payload.cashDestination || CASH_DESTINATIONS.brokerCash,
    bankAccountId: payload.bankAccountId || '',
    notes: payload.notes || '',
    userId: currentUser?.id || '',
    userName: currentUser?.name || '',
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    version: Number(existing?.version || 0) + 1,
    syncStatus: 'pending',
    isDeleted: false,
  };
}

async function buildPositionUpdateFromMovement(movement, existingMovement = null) {
  if (existingMovement) {
    return null;
  }

  if (![MOVEMENT_TYPES.buy, MOVEMENT_TYPES.sell].includes(movement.movementType)) {
    return null;
  }

  const model = buildInvestmentModel();
  const currentUser = getCurrentUser();
  let position = movement.positionId ? model.positions.find((item) => item.id === movement.positionId) : null;

  if (!position && movement.movementType === MOVEMENT_TYPES.buy) {
    const ticker = String(movement.ticker || '').trim().toUpperCase();
    position = model.positions.find(
      (item) => item.brokerId === movement.brokerId && String(item.ticker || '').toUpperCase() === ticker,
    );
  }

  const timestamp = nowIso();

  if (!position && movement.movementType === MOVEMENT_TYPES.buy) {
    validateRequired(movement.ticker, 'Ticker / Identificador');
    validatePositive(movement.quantity, 'Quantidade');

    const averagePrice = movement.quantity ? Number(movement.amount || 0) / Number(movement.quantity || 1) : Number(movement.unitPrice || 0);

    return {
      kind: INVESTMENT_KINDS.position,
      id: createId('inv'),
      brokerId: movement.brokerId,
      assetType: movement.assetType || 'other',
      type: movement.assetType || 'other',
      name: movement.ticker,
      ticker: movement.ticker,
      quantity: Number(movement.quantity || 0),
      averagePrice,
      amountInvested: Number(movement.amount || 0),
      currentValue: Number(movement.quantity || 0) * Number(movement.unitPrice || averagePrice || 0),
      referenceDate: movement.date,
      purchaseDate: movement.date,
      notes: 'Criado automaticamente a partir de compra.',
      createdAt: timestamp,
      updatedAt: timestamp,
      createdByUserId: currentUser?.id || '',
      createdByUserName: currentUser?.name || '',
      updatedByUserId: currentUser?.id || '',
      updatedByUserName: currentUser?.name || '',
      version: 1,
      syncStatus: 'pending',
      isDeleted: false,
    };
  }

  if (!position) return null;

  const quantity = Number(position.quantity || 0);
  const amountInvested = Number(position.amountInvested || 0);
  let nextQuantity = quantity;
  let nextAmountInvested = amountInvested;
  let nextAveragePrice = Number(position.averagePrice || 0);

  if (movement.movementType === MOVEMENT_TYPES.buy) {
    validatePositive(movement.quantity, 'Quantidade');
    nextQuantity = quantity + Number(movement.quantity || 0);
    nextAmountInvested = amountInvested + Number(movement.amount || 0);
    nextAveragePrice = nextQuantity ? nextAmountInvested / nextQuantity : 0;
  }

  if (movement.movementType === MOVEMENT_TYPES.sell) {
    validatePositive(movement.quantity, 'Quantidade');
    nextQuantity = Math.max(0, quantity - Number(movement.quantity || 0));
    nextAmountInvested = nextQuantity * nextAveragePrice;
  }

  return {
    ...position,
    quantity: roundNumber(nextQuantity, 6),
    amountInvested: roundMoney(nextAmountInvested),
    averagePrice: roundMoney(nextAveragePrice),
    currentValue: roundMoney(nextQuantity * Number(movement.unitPrice || nextAveragePrice || 0)),
    updatedAt: timestamp,
    updatedByUserId: currentUser?.id || '',
    updatedByUserName: currentUser?.name || '',
    version: Number(position.version || 0) + 1,
    syncStatus: 'pending',
  };
}

function buildBankAdjustmentFromMovement(movement) {
  const bankAccountId = movement.bankAccountId;
  if (!bankAccountId) return null;

  let adjustmentAmount = 0;
  let description = '';

  if (movement.movementType === MOVEMENT_TYPES.cashIn) {
    adjustmentAmount = -Math.abs(Number(movement.amount || 0));
    description = 'Aporte para corretora';
  }

  if (movement.movementType === MOVEMENT_TYPES.cashOut) {
    adjustmentAmount = Math.abs(Number(movement.amount || 0));
    description = 'Retirada de corretora';
  }

  if (
    [MOVEMENT_TYPES.sell, MOVEMENT_TYPES.dividend, MOVEMENT_TYPES.yield].includes(movement.movementType) &&
    movement.cashDestination === CASH_DESTINATIONS.bankAccount
  ) {
    adjustmentAmount = Math.abs(Number(movement.amount || 0));
    description = `${getMovementTypeLabel(movement.movementType)} recebido na conta`;
  }

  if (!adjustmentAmount) return null;

  const timestamp = nowIso();
  const currentUser = getCurrentUser();

  return {
    id: movement.linkedTransactionId || createId('tx_inv'),
    description,
    type: 'adjustment',
    accountId: bankAccountId,
    amount: roundMoney(adjustmentAmount),
    category: 'Investimentos',
    date: movement.date,
    status: 'posted',
    investmentMovementId: movement.id,
    notes: movement.notes || '',
    createdAt: timestamp,
    updatedAt: timestamp,
    createdByUserId: currentUser?.id || '',
    createdByUserName: currentUser?.name || '',
    version: 1,
    syncStatus: 'pending',
    isDeleted: false,
  };
}

async function confirmDeleteInvestmentRecord(recordId, label) {
  confirmDialog({
    title: `Excluir ${label.toLowerCase()}`,
    message: `${label} será removido da visualização e sincronizado. As movimentações históricas vinculadas continuam preservadas quando existirem.`,
    confirmText: `Excluir ${label.toLowerCase()}`,
    onConfirm: async () => {
      const existing = await getOne('investments', recordId);
      if (!existing) return;
      const record = {
        ...existing,
        isDeleted: true,
        updatedAt: nowIso(),
        version: Number(existing.version || 0) + 1,
        syncStatus: 'pending',
      };
      await putAndSync('investments', record);
      await loadState();
      toast(`${label} excluída(o).`, 'success');
    },
  });
}

function bindPositionComputedFields() {
  const form = document.getElementById('investment-position-form');
  if (!form) return;

  const quantity = form.elements.quantity;
  const averagePrice = form.elements.averagePrice;
  const amountInvested = form.elements.amountInvested;
  const currentValue = form.elements.currentValue;
  const editingExisting = Boolean(form.elements.id?.value);

  let updating = false;
  let amountManuallyEdited = editingExisting && Boolean(amountInvested?.value);
  let currentValueManuallyEdited = editingExisting && Boolean(currentValue?.value);

  const sync = () => {
    if (!amountInvested || !currentValue) return;

    const quantityValue = Number(quantity?.value || 0);
    const averagePriceValue = Number(averagePrice?.value || 0);

    if (!amountManuallyEdited && quantityValue > 0 && averagePriceValue > 0) {
      updating = true;
      amountInvested.value = roundMoney(quantityValue * averagePriceValue);
      updating = false;
    }

    if (!currentValueManuallyEdited && amountInvested.value) {
      updating = true;
      currentValue.value = amountInvested.value;
      updating = false;
    }
  };

  amountInvested?.addEventListener('input', () => {
    if (updating) return;
    amountManuallyEdited = Boolean(amountInvested.value);
    if (!amountInvested.value) {
      amountManuallyEdited = false;
      sync();
    }
  });

  currentValue?.addEventListener('input', () => {
    if (updating) return;
    currentValueManuallyEdited = Boolean(currentValue.value);
    if (!currentValue.value) {
      currentValueManuallyEdited = false;
      sync();
    }
  });

  quantity?.addEventListener('input', sync);
  averagePrice?.addEventListener('input', sync);
  sync();
}

function bindMovementComputedFields() {
  const form = document.getElementById('investment-movement-form');
  if (!form) return;

  const quantity = form.elements.quantity;
  const unitPrice = form.elements.unitPrice;
  const amount = form.elements.amount;
  const positionField = form.elements.positionId;
  const brokerField = form.elements.brokerId;
  const model = buildInvestmentModel();

  let amountManuallyEdited = Boolean(amount?.value);
  let updatingAmount = false;

  const syncAmount = () => {
    if (!amount) return;

    const quantityValue = Number(quantity?.value || 0);
    const unitPriceValue = Number(unitPrice?.value || 0);

    if (!amountManuallyEdited && quantityValue > 0 && unitPriceValue > 0) {
      updatingAmount = true;
      amount.value = roundMoney(quantityValue * unitPriceValue);
      updatingAmount = false;
    }
  };

  amount?.addEventListener('input', () => {
    if (updatingAmount) return;
    amountManuallyEdited = Boolean(amount.value);
    if (!amount.value) {
      amountManuallyEdited = false;
      syncAmount();
    }
  });

  const syncPosition = () => {
    const position = model.positions.find((item) => item.id === positionField.value);
    if (!position) return;
    brokerField.value = position.brokerId || brokerField.value;
    form.elements.assetType.value = position.assetType || form.elements.assetType.value;
    form.elements.ticker.value = position.ticker || form.elements.ticker.value;
  };

  quantity?.addEventListener('input', syncAmount);
  unitPrice?.addEventListener('input', syncAmount);
  positionField?.addEventListener('change', syncPosition);
  syncPosition();
}

async function putAndSync(storeName, record) {
  await putOne(storeName, record);
  await enqueueSync(storeName, record.id);
}

function metricCard(label, value, icon) {
  return `
    <article class="card p-5 md:p-6 compact-stat-card min-h-[150px] overflow-hidden">
      <div class="compact-stat-icon"><i class="fa-solid ${icon}"></i></div>
      <div class="min-w-0">
        <div class="compact-stat-label">${label}</div>
        <div class="compact-stat-value text-[clamp(1.55rem,3vw,2.35rem)] leading-[0.95] break-words">${value}</div>
      </div>
    </article>
  `;
}

function brokerInfoBlock(label, value, valueClass = 'text-slate-950') {
  return `
    <div class="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4 min-w-0">
      <div class="text-xs uppercase tracking-[0.16em] text-slate-400 font-semibold">${label}</div>
      <div class="mt-2 text-lg font-black tracking-[-0.04em] ${valueClass} break-words">${value}</div>
    </div>
  `;
}

function distributionLine(label, value, total) {
  const pct = total ? (Number(value || 0) / Number(total || 1)) * 100 : 0;
  return `
    <div>
      <div class="flex items-center justify-between text-sm gap-3">
        <span class="font-semibold text-slate-700">${label}</span>
        <span class="text-slate-500">${currency(value)} • ${percent(pct)}</span>
      </div>
      <div class="h-2 rounded-full bg-slate-100 overflow-hidden mt-2">
        <div class="h-full rounded-full bg-slate-900" style="width:${Math.min(100, Math.max(0, pct))}%"></div>
      </div>
    </div>
  `;
}

function emptyState(title, text) {
  return `
    <div class="empty-state col-span-full">
      <h3>${title}</h3>
      <p>${text}</p>
    </div>
  `;
}

function emptyInline(text) {
  return `<div class="empty-state-inline">${text}</div>`;
}

function brokerOptions(brokers = [], selectedId = '') {
  return `
    <option value="">Selecione</option>
    ${brokers.filter((broker) => !broker.isInferred).map((broker) => `
      <option value="${broker.id}" ${selectedId === broker.id ? 'selected' : ''}>${broker.name}</option>
    `).join('')}
  `;
}

function accountOptions(selectedId = '') {
  return state.data.accounts
    .filter((account) => !account.isDeleted)
    .map((account) => `<option value="${account.id}" ${selectedId === account.id ? 'selected' : ''}>${account.name}</option>`)
    .join('');
}

function positionOptions(positions = [], selectedId = '') {
  return positions
    .map((position) => `<option value="${position.id}" ${selectedId === position.id ? 'selected' : ''}>${position.ticker || position.name} • ${position.brokerName || 'Sem corretora'}</option>`)
    .join('');
}

function assetTypeOptions(selected = '') {
  return ASSET_TYPES.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function movementTypeOptions(selected = '') {
  const options = [
    [MOVEMENT_TYPES.cashIn, 'Aporte para corretora'],
    [MOVEMENT_TYPES.cashOut, 'Retirada / resgate para conta'],
    [MOVEMENT_TYPES.buy, 'Compra de ativo'],
    [MOVEMENT_TYPES.sell, 'Venda de ativo'],
    [MOVEMENT_TYPES.dividend, 'Dividendo / JCP / provento'],
    [MOVEMENT_TYPES.yield, 'Rendimento'],
    [MOVEMENT_TYPES.fee, 'Taxa / custo operacional'],
    [MOVEMENT_TYPES.manualAdjustment, 'Ajuste manual de caixa'],
  ];

  return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function getAssetTypeLabel(type) {
  return ASSET_TYPES.find(([value]) => value === type)?.[1] || 'Outros';
}

function getMovementTypeLabel(type) {
  return ({
    [MOVEMENT_TYPES.cashIn]: 'Aporte',
    [MOVEMENT_TYPES.cashOut]: 'Retirada',
    [MOVEMENT_TYPES.buy]: 'Compra',
    [MOVEMENT_TYPES.sell]: 'Venda',
    [MOVEMENT_TYPES.dividend]: 'Provento',
    [MOVEMENT_TYPES.yield]: 'Rendimento',
    [MOVEMENT_TYPES.fee]: 'Taxa',
    [MOVEMENT_TYPES.manualAdjustment]: 'Ajuste manual',
    [MOVEMENT_TYPES.initialPosition]: 'Posição inicial',
  }[type] || 'Movimentação');
}

function getBrokerName(position, brokers = []) {
  const brokerId = position.brokerId || getLegacyBrokerId(position.broker);
  return brokers.find((broker) => broker.id === brokerId)?.name || position.broker || 'Sem corretora';
}

function getLegacyBrokerId(name = '') {
  const normalized = String(name || '').trim();
  return normalized ? `legacy_broker_${slugify(normalized)}` : '';
}

function slugify(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function groupBy(items = [], selector) {
  return items.reduce((acc, item) => {
    const key = selector(item) || 'outros';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function formatQuantity(value) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 6,
  }).format(Number(value || 0));
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function roundNumber(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(Number(value || 0) * factor) / factor;
}
