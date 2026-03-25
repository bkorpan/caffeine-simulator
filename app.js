// Application controller — state management, events, DOM updates

const state = {
  doses: [],
  metabolizer: 'normal',
  params: { ...DEFAULT_PARAMS },
  visibility: {
    caffeine: true,
    paraxanthine: true,
    theobromine: false,
    theophylline: false,
    effective: false,
  },
  isCustomParams: false,
  nextDoseId: 1,
  startHour: 0, // simulation starts at midnight
};

// --- Initialization ---

function init() {
  initChart(document.getElementById('chart'), getDoseMarkers);
  addDose('coffee', '08:00');
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
    renderDoseList(); // re-render to show/hide mg input
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

  // Bind events on dose entries
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
    { key: 'caffeine', label: 'Caffeine', color: 'var(--color-caffeine)', visible: state.visibility.caffeine },
    { key: 'paraxanthine', label: 'Paraxanthine', color: 'var(--color-paraxanthine)', visible: state.visibility.paraxanthine },
    { key: 'theobromine', label: 'Theobromine', color: 'var(--color-theobromine)', visible: state.visibility.theobromine },
    { key: 'theophylline', label: 'Theophylline', color: 'var(--color-theophylline)', visible: state.visibility.theophylline },
    { key: 'effective', label: 'Effective (A1R)', color: 'var(--color-effective)', visible: state.visibility.effective },
  ];

  let html = '';
  for (const c of compounds) {
    if (!c.visible) continue;
    const s = stats[c.key];
    const peakTime = s.peakTimeMinutes != null ? minutesToTimeString(s.peakTimeMinutes, true) : '—';
    const clearTime = s.clearTimeMinutes != null ? minutesToTimeString(s.clearTimeMinutes, true) : '< threshold';

    html += `
      <div class="stat-section-title">
        <span class="stat-dot" style="background: ${c.color}"></span>
        ${c.label}
      </div>
      <div class="stat-row"><span class="stat-label">Peak</span><span class="stat-value">${s.peak} mg/L at ${peakTime}</span></div>
      <div class="stat-row"><span class="stat-label">AUC</span><span class="stat-value">${s.auc} mg&middot;h/L</span></div>
      <div class="stat-row"><span class="stat-label">Below 0.1 mg/L</span><span class="stat-value">${clearTime}</span></div>
    `;
  }

  container.innerHTML = html || '<div class="no-doses">No visible compounds.</div>';
}

// --- Parameters ---

function syncParamsToDOM() {
  document.getElementById('param-hl-caffeine').value = state.params.halfLife_caffeine;
  document.getElementById('param-hl-paraxanthine').value = state.params.halfLife_paraxanthine;
  document.getElementById('param-hl-theobromine').value = state.params.halfLife_theobromine;
  document.getElementById('param-hl-theophylline').value = state.params.halfLife_theophylline;
  document.getElementById('param-f-paraxanthine').value = state.params.fraction_paraxanthine;
  document.getElementById('param-f-theobromine').value = state.params.fraction_theobromine;
  document.getElementById('param-f-theophylline').value = state.params.fraction_theophylline;
  document.getElementById('param-pot-caffeine').value = state.params.potency_caffeine;
  document.getElementById('param-pot-paraxanthine').value = state.params.potency_paraxanthine;
  document.getElementById('param-pot-theobromine').value = state.params.potency_theobromine;
  document.getElementById('param-pot-theophylline').value = state.params.potency_theophylline;
  document.getElementById('param-ka-caffeine').value = state.params.ka_caffeine;
  document.getElementById('param-ka-paraxanthine').value = state.params.ka_paraxanthine;
  document.getElementById('param-bodyweight').value = state.params.bodyWeight;
  document.getElementById('param-vd').value = state.params.vd;
}

function readParamsFromDOM() {
  state.params.halfLife_caffeine = parseFloat(document.getElementById('param-hl-caffeine').value) || DEFAULT_PARAMS.halfLife_caffeine;
  state.params.halfLife_paraxanthine = parseFloat(document.getElementById('param-hl-paraxanthine').value) || DEFAULT_PARAMS.halfLife_paraxanthine;
  state.params.halfLife_theobromine = parseFloat(document.getElementById('param-hl-theobromine').value) || DEFAULT_PARAMS.halfLife_theobromine;
  state.params.halfLife_theophylline = parseFloat(document.getElementById('param-hl-theophylline').value) || DEFAULT_PARAMS.halfLife_theophylline;
  state.params.fraction_paraxanthine = parseFloat(document.getElementById('param-f-paraxanthine').value) || DEFAULT_PARAMS.fraction_paraxanthine;
  state.params.fraction_theobromine = parseFloat(document.getElementById('param-f-theobromine').value) || DEFAULT_PARAMS.fraction_theobromine;
  state.params.fraction_theophylline = parseFloat(document.getElementById('param-f-theophylline').value) || DEFAULT_PARAMS.fraction_theophylline;
  state.params.potency_caffeine = parseFloat(document.getElementById('param-pot-caffeine').value) || DEFAULT_PARAMS.potency_caffeine;
  state.params.potency_paraxanthine = parseFloat(document.getElementById('param-pot-paraxanthine').value) || DEFAULT_PARAMS.potency_paraxanthine;
  state.params.potency_theobromine = parseFloat(document.getElementById('param-pot-theobromine').value) || DEFAULT_PARAMS.potency_theobromine;
  state.params.potency_theophylline = parseFloat(document.getElementById('param-pot-theophylline').value) || DEFAULT_PARAMS.potency_theophylline;
  state.params.ka_caffeine = parseFloat(document.getElementById('param-ka-caffeine').value) || DEFAULT_PARAMS.ka_caffeine;
  state.params.ka_paraxanthine = parseFloat(document.getElementById('param-ka-paraxanthine').value) || DEFAULT_PARAMS.ka_paraxanthine;
  state.params.bodyWeight = parseFloat(document.getElementById('param-bodyweight').value) || DEFAULT_PARAMS.bodyWeight;
  state.params.vd = parseFloat(document.getElementById('param-vd').value) || DEFAULT_PARAMS.vd;
}

function setMetabolizer(type) {
  state.metabolizer = type;
  state.isCustomParams = false;
  const preset = PRESETS[type];
  Object.assign(state.params, preset);
  syncParamsToDOM();

  document.querySelectorAll('#metabolizer-select .seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === type);
  });

  update();
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
      theobromine: new Float64Array(0),
      theophylline: new Float64Array(0),
      effective: new Float64Array(0),
    });
    renderSummary(null);
    return;
  }

  // Convert doses to simulation format
  const simDoses = state.doses.map(d => ({
    timeMinutes: timeToMinutes(d.time),
    mg: d.mg,
    isParaxanthine: d.isParaxanthine,
  }));

  const results = simulate(simDoses, state.params);
  updateChartData(results);
  renderSummary(results.stats);
}

// --- Event Binding ---

function bindEvents() {
  // Add dose
  document.getElementById('add-dose').addEventListener('click', () => {
    addDose('coffee', currentTimeString());
  });

  // Metabolizer preset
  document.querySelectorAll('#metabolizer-select .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => setMetabolizer(btn.dataset.value));
  });

  // Visibility checkboxes
  const visMap = {
    'show-caffeine': { key: 'caffeine', seriesIdx: 1 },
    'show-paraxanthine': { key: 'paraxanthine', seriesIdx: 2 },
    'show-theobromine': { key: 'theobromine', seriesIdx: 3 },
    'show-theophylline': { key: 'theophylline', seriesIdx: 4 },
    'show-effective': { key: 'effective', seriesIdx: 5 },
  };

  for (const [id, { key, seriesIdx }] of Object.entries(visMap)) {
    document.getElementById(id).addEventListener('change', e => {
      state.visibility[key] = e.target.checked;
      setSeriesVisibility(seriesIdx, e.target.checked);
      renderSummary(lastStats());
    });
  }

  // Advanced parameter inputs
  const paramInputs = document.querySelectorAll('#advanced-panel input[type="number"]');
  paramInputs.forEach(input => {
    input.addEventListener('input', debounce(() => {
      readParamsFromDOM();
      state.isCustomParams = true;
      // Deselect metabolizer preset
      document.querySelectorAll('#metabolizer-select .seg-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      update();
    }, 150));
  });

  // Reset params
  document.getElementById('reset-params').addEventListener('click', () => {
    setMetabolizer(state.metabolizer || 'normal');
  });
}

// Helper: get last simulation stats (re-run if needed)
function lastStats() {
  if (state.doses.length === 0) return null;
  const simDoses = state.doses.map(d => ({
    timeMinutes: timeToMinutes(d.time),
    mg: d.mg,
    isParaxanthine: d.isParaxanthine,
  }));
  return simulate(simDoses, state.params).stats;
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
