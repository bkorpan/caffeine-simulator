// Application controller — state management, events, DOM updates

const state = {
  doses: [],
  metabolismSpeed: 1.0, // 0.5 to 2.0, log-scaled
  mode: 'single', // 'single' or 'steady'
  params: { ...DEFAULT_PARAMS },
  isCustomParams: false,
  nextDoseId: 1,
};

const isEmbed = document.body.classList.contains('embed');

// --- Initialization ---

function init() {
  initChart(document.getElementById('chart'), getDoseMarkers);
  addDose('coffee', isEmbed ? '00:00' : '08:00');
  syncParamsToDOM();
  bindEvents();
  update();
}

// --- Dose Management ---

function addDose(drinkId, time) {
  const drink = DRINKS.find(d => d.id === drinkId) || DRINKS[0];
  const dose = {
    id: state.nextDoseId++,
    drinkId: drink.id,
    mg: drink.mg,
    time: time || currentTimeString(),
    isParaxanthine: drink.isParaxanthine,
    isCustom: drink.id === 'custom_caffeine' || drink.id === 'custom_px',
  };
  state.doses.push(dose);
  renderDoseList();
  update();
}

function removeDose(id) {
  state.doses = state.doses.filter(d => d.id !== id);
  renderDoseList();
  update();
}

function updateDose(id, field, value) {
  const dose = state.doses.find(d => d.id === id);
  if (!dose) return;

  if (field === 'drinkId') {
    const drink = DRINKS.find(d => d.id === value);
    if (drink) {
      dose.drinkId = drink.id;
      dose.isParaxanthine = drink.isParaxanthine;
      dose.isCustom = drink.id === 'custom_caffeine' || drink.id === 'custom_px';
      if (!dose.isCustom) dose.mg = drink.mg;
    }
    renderDoseList();
  } else if (field === 'time') {
    dose.time = value;
  } else if (field === 'mg') {
    dose.mg = parseFloat(value) || 0;
  }
  update();
}

function currentTimeString() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToTimeString(minutes, showDay) {
  const totalHours = Math.floor(minutes / 60);
  const h = totalHours % 24;
  const m = Math.round(minutes % 60);
  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  if (showDay && totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    return `${time} (+${days}d)`;
  }
  return time;
}

// --- DOM Rendering ---

function renderDoseList() {
  const container = document.getElementById('dose-list');
  if (state.doses.length === 0) {
    container.innerHTML = '<div class="no-doses">No doses added. Click "+ Add Dose" to start.</div>';
    return;
  }

  container.innerHTML = state.doses.map(dose => {
    const options = DRINKS.map(d =>
      `<option value="${d.id}" ${d.id === dose.drinkId ? 'selected' : ''}>${d.label}</option>`
    ).join('');

    const mgDisplay = dose.isCustom
      ? `<input type="number" class="dose-mg-input" data-id="${dose.id}" value="${dose.mg}" min="0" max="2000" step="5">`
      : `<span class="dose-mg-label">${dose.mg} mg</span>`;

    return `
      <div class="dose-entry" data-id="${dose.id}">
        <select class="dose-select" data-id="${dose.id}">${options}</select>
        <input type="time" class="dose-time" data-id="${dose.id}" value="${dose.time}">
        ${mgDisplay}
        <button class="btn-remove" data-id="${dose.id}" title="Remove dose">&times;</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.dose-select').forEach(el => {
    el.addEventListener('change', e => updateDose(Number(e.target.dataset.id), 'drinkId', e.target.value));
  });
  container.querySelectorAll('.dose-time').forEach(el => {
    el.addEventListener('change', e => updateDose(Number(e.target.dataset.id), 'time', e.target.value));
  });
  container.querySelectorAll('.dose-mg-input').forEach(el => {
    el.addEventListener('input', debounce(e => updateDose(Number(e.target.dataset.id), 'mg', e.target.value), 150));
  });
  container.querySelectorAll('.btn-remove').forEach(el => {
    el.addEventListener('click', e => removeDose(Number(e.target.dataset.id)));
  });
}

function renderSummary(stats) {
  const container = document.getElementById('summary');
  if (!stats) {
    container.innerHTML = '<div class="no-doses">Add a dose to see results.</div>';
    return;
  }

  const compounds = [
    { key: 'caffeine', label: 'Caffeine', color: 'var(--color-caffeine)' },
    { key: 'paraxanthine', label: 'Paraxanthine', color: 'var(--color-paraxanthine)' },
    { key: 'effective', label: 'Effective', color: 'var(--color-effective)' },
  ];

  const isSteady = state.mode === 'steady';

  let html = '';
  for (const c of compounds) {
    const s = stats[c.key];
    const peakTime = s.peakTimeMinutes != null
      ? minutesToTimeString(s.peakTimeMinutes % 1440, false)
      : '—';
    const firstDoseMinutes = Math.min(...state.doses.map(d => timeToMinutes(d.time)));
    const elimHours = s.clearTimeMinutes != null
      ? Math.round((s.clearTimeMinutes - firstDoseMinutes) / 60 * 10) / 10
      : null;
    const elimDisplay = elimHours != null ? `${elimHours} h` : '< threshold';
    const aucValue = isSteady ? Math.round(s.auc / 2 * 100) / 100 : s.auc;
    const aucLabel = isSteady ? 'AUC / day' : 'AUC';

    html += `
      <div class="stat-section-title">
        <span class="stat-dot" style="background: ${c.color}"></span>
        ${c.label}
      </div>
      <div class="stat-row"><span class="stat-label">Peak</span><span class="stat-value">${s.peak} mg/L at ${peakTime}</span></div>
      <div class="stat-row"><span class="stat-label">${aucLabel}</span><span class="stat-value">${aucValue} mg&middot;h/L</span></div>
      ${!isSteady ? `<div class="stat-row"><span class="stat-label">Elimination (&lt;0.1 mg/L)</span><span class="stat-value">${elimDisplay}</span></div>` : ''}
    `;
  }

  container.innerHTML = html;
}

// --- Parameters ---

function syncParamsToDOM() {
  document.getElementById('param-hl-caffeine').value = state.params.halfLife_caffeine;
  document.getElementById('param-hl-paraxanthine').value = state.params.halfLife_paraxanthine;
  document.getElementById('param-f-paraxanthine').value = state.params.fraction_paraxanthine;
  document.getElementById('param-pot-caffeine').value = state.params.potency_caffeine;
  document.getElementById('param-pot-paraxanthine').value = state.params.potency_paraxanthine;
  document.getElementById('param-ka-caffeine').value = state.params.ka_caffeine;
  document.getElementById('param-ka-paraxanthine').value = state.params.ka_paraxanthine;
  document.getElementById('param-bodyweight').value = state.params.bodyWeight;
  document.getElementById('param-vd').value = state.params.vd;
}

function readParamsFromDOM() {
  state.params.halfLife_caffeine = parseFloat(document.getElementById('param-hl-caffeine').value) || DEFAULT_PARAMS.halfLife_caffeine;
  state.params.halfLife_paraxanthine = parseFloat(document.getElementById('param-hl-paraxanthine').value) || DEFAULT_PARAMS.halfLife_paraxanthine;
  state.params.fraction_paraxanthine = parseFloat(document.getElementById('param-f-paraxanthine').value) || DEFAULT_PARAMS.fraction_paraxanthine;
  state.params.potency_caffeine = parseFloat(document.getElementById('param-pot-caffeine').value) || DEFAULT_PARAMS.potency_caffeine;
  state.params.potency_paraxanthine = parseFloat(document.getElementById('param-pot-paraxanthine').value) || DEFAULT_PARAMS.potency_paraxanthine;
  state.params.ka_caffeine = parseFloat(document.getElementById('param-ka-caffeine').value) || DEFAULT_PARAMS.ka_caffeine;
  state.params.ka_paraxanthine = parseFloat(document.getElementById('param-ka-paraxanthine').value) || DEFAULT_PARAMS.ka_paraxanthine;
  state.params.bodyWeight = parseFloat(document.getElementById('param-bodyweight').value) || DEFAULT_PARAMS.bodyWeight;
  state.params.vd = parseFloat(document.getElementById('param-vd').value) || DEFAULT_PARAMS.vd;
}

// Convert slider value (-1..1) to speed (0.5..2.0) with log spacing
function sliderToSpeed(v) {
  return Math.pow(2, v);
}

function speedToSlider(speed) {
  return Math.log2(speed);
}

function setMetabolismSpeed(sliderVal) {
  state.metabolismSpeed = Math.round(sliderToSpeed(sliderVal) * 100) / 100;
  document.getElementById('speed-label').textContent = state.metabolismSpeed.toFixed(1) + 'x';
  update();
}

// Apply speed scaling: faster metabolism = shorter half-lives
function getEffectiveParams() {
  const p = { ...state.params };
  const scale = 1 / state.metabolismSpeed;
  p.halfLife_caffeine *= scale;
  p.halfLife_paraxanthine *= scale;
  return p;
}

// --- Simulation & Update ---

function getDoseMarkers() {
  return state.doses.map(d => {
    const drink = DRINKS.find(dr => dr.id === d.drinkId);
    return {
      timestamp: timeToMinutes(d.time),
      label: drink ? drink.label.split('(')[0].trim() : d.drinkId,
    };
  });
}

function update() {
  if (state.doses.length === 0) {
    updateChartData({
      timestamps: new Float64Array(0),
      caffeine: new Float64Array(0),
      paraxanthine: new Float64Array(0),
      effective: new Float64Array(0),
    });
    renderSummary(null);
    return;
  }

  const baseDoses = state.doses.map(d => ({
    timeMinutes: timeToMinutes(d.time),
    mg: d.mg,
    isParaxanthine: d.isParaxanthine,
  }));

  const showMinutes = isEmbed ? 1440 : 2880;

  if (state.mode === 'steady') {
    const RAMP_DAYS = 10;
    const SHOW_DAYS = isEmbed ? 1 : 2;
    const simDoses = [];
    for (let day = 0; day < RAMP_DAYS; day++) {
      for (const d of baseDoses) {
        simDoses.push({ ...d, timeMinutes: d.timeMinutes + day * 1440 });
      }
    }

    const fullResults = simulate(simDoses, getEffectiveParams());

    const showStart = (RAMP_DAYS - SHOW_DAYS) * 1440;
    const sliceFrom = Math.min(showStart, fullResults.timestamps.length - 1);
    const sliceTo = Math.min(sliceFrom + SHOW_DAYS * 1440, fullResults.timestamps.length);

    const sliced = {
      timestamps: fullResults.timestamps.slice(sliceFrom, sliceTo),
      caffeine: fullResults.caffeine.slice(sliceFrom, sliceTo),
      paraxanthine: fullResults.paraxanthine.slice(sliceFrom, sliceTo),
      effective: fullResults.effective.slice(sliceFrom, sliceTo),
      stats: computeStatsForRange(fullResults, sliceFrom, sliceTo),
    };

    updateChartData(sliced);
    renderSummary(sliced.stats);
  } else {
    const results = simulate(baseDoses, { ...getEffectiveParams(), minMinutes: showMinutes });
    const displayEnd = Math.min(showMinutes, results.timestamps.length);
    updateChartData({
      timestamps: results.timestamps.slice(0, displayEnd),
      caffeine: results.caffeine.slice(0, displayEnd),
      paraxanthine: results.paraxanthine.slice(0, displayEnd),
      effective: results.effective.slice(0, displayEnd),
    });
    renderSummary(results.stats);
  }
}

function computeStatsForRange(results, fromIdx, toIdx) {
  const THRESHOLD = 0.1;
  const end = toIdx || results.timestamps.length;
  function sliceStats(data, timestamps) {
    let peak = 0, peakIdx = fromIdx, auc = 0, clearIdx = -1;
    for (let i = fromIdx; i < end; i++) {
      if (data[i] > peak) { peak = data[i]; peakIdx = i; }
      if (i > fromIdx) {
        auc += (data[i - 1] + data[i]) / 2 * (1 / 60);
      }
    }
    for (let i = end - 1; i >= fromIdx; i--) {
      if (data[i] >= THRESHOLD) { clearIdx = i + 1; break; }
    }
    return {
      peak: Math.round(peak * 100) / 100,
      peakTimeMinutes: timestamps[peakIdx],
      auc: Math.round(auc * 100) / 100,
      clearTimeMinutes: clearIdx >= 0 && clearIdx < timestamps.length ? timestamps[clearIdx] : null,
    };
  }
  return {
    caffeine: sliceStats(results.caffeine, results.timestamps),
    paraxanthine: sliceStats(results.paraxanthine, results.timestamps),
    effective: sliceStats(results.effective, results.timestamps),
  };
}

// --- Event Binding ---

function bindEvents() {
  document.getElementById('add-dose').addEventListener('click', () => {
    addDose('coffee', currentTimeString());
  });

  document.getElementById('metabolism-speed').addEventListener('input', e => {
    setMetabolismSpeed(parseFloat(e.target.value));
  });

  document.querySelectorAll('#mode-select .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.value;
      document.querySelectorAll('#mode-select .seg-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.value === state.mode);
      });
      update();
    });
  });

  const paramInputs = document.querySelectorAll('#advanced-panel input[type="number"]');
  paramInputs.forEach(input => {
    input.addEventListener('input', debounce(() => {
      readParamsFromDOM();
      state.isCustomParams = true;
      update();
    }, 150));
  });

  document.getElementById('reset-params').addEventListener('click', () => {
    state.params = { ...DEFAULT_PARAMS };
    state.metabolismSpeed = 1.0;
    document.getElementById('metabolism-speed').value = 0;
    document.getElementById('speed-label').textContent = '1.0x';
    syncParamsToDOM();
    update();
  });
}

// --- Utilities ---

function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// --- Start ---

document.addEventListener('DOMContentLoaded', init);
