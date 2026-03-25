// Pharmacokinetic model for caffeine and metabolites
// One-compartment model with first-order absorption and elimination
// Solver: RK4 at dt = 1 minute

const PRESETS = {
  normal: {
    halfLife_caffeine: 5.0,
    halfLife_paraxanthine: 3.1,
    halfLife_theobromine: 7.2,
    halfLife_theophylline: 6.2,
  },
  slow: {
    halfLife_caffeine: 8.0,
    halfLife_paraxanthine: 5.0,
    halfLife_theobromine: 10.0,
    halfLife_theophylline: 9.0,
  },
  fast: {
    halfLife_caffeine: 2.5,
    halfLife_paraxanthine: 1.8,
    halfLife_theobromine: 4.5,
    halfLife_theophylline: 4.0,
  },
};

const DEFAULT_PARAMS = {
  ...PRESETS.normal,
  fraction_paraxanthine: 0.80,
  fraction_theobromine: 0.11,
  fraction_theophylline: 0.04,
  ka_caffeine: 4.0,       // absorption rate, h^-1
  ka_paraxanthine: 3.5,   // absorption rate for PX supplements, h^-1
  bodyWeight: 70,          // kg
  vd: 0.7,                // L/kg
  // A1R relative potency (caffeine = 1.0)
  // Rat A1R Ki values used for cross-compound consistency (human data
  // unavailable for paraxanthine/theobromine). Sources:
  //   Muller & Jacobson 2011 (PMC3882893), Table 1
  //   Fredholm et al. 2001 (PMC9389454), Table 7
  // Ki (rat): caffeine ~44 μM, paraxanthine ~21 μM,
  //           theophylline ~11 μM, theobromine ~94 μM
  potency_caffeine: 1.0,        // 44/44
  potency_paraxanthine: 2.1,    // 44/21
  potency_theobromine: 0.47,    // 44/94
  potency_theophylline: 4.0,    // 44/11
};

// Drink presets: { label, mg, isParaxanthine }
const DRINKS = [
  { id: 'coffee', label: 'Coffee (8 oz)', mg: 95, isParaxanthine: false },
  { id: 'espresso', label: 'Espresso (single)', mg: 63, isParaxanthine: false },
  { id: 'double_espresso', label: 'Espresso (double)', mg: 126, isParaxanthine: false },
  { id: 'black_tea', label: 'Black tea (8 oz)', mg: 47, isParaxanthine: false },
  { id: 'green_tea', label: 'Green tea (8 oz)', mg: 28, isParaxanthine: false },
  { id: 'energy_drink', label: 'Energy drink (8 oz)', mg: 80, isParaxanthine: false },
  { id: 'px_100', label: 'Paraxanthine 100mg', mg: 100, isParaxanthine: true },
  { id: 'px_200', label: 'Paraxanthine 200mg', mg: 200, isParaxanthine: true },
  { id: 'custom_caffeine', label: 'Custom (caffeine)', mg: 0, isParaxanthine: false },
  { id: 'custom_px', label: 'Custom (paraxanthine)', mg: 0, isParaxanthine: true },
];

// State vector indices
const G_CAF = 0;  // gut caffeine (mg)
const C     = 1;  // plasma caffeine (mg/L)
const G_PX  = 2;  // gut paraxanthine (mg)
const P     = 3;  // plasma paraxanthine (mg/L)
const TB    = 4;  // plasma theobromine (mg/L)
const TP    = 5;  // plasma theophylline (mg/L)
const STATE_SIZE = 6;

function halfLifeToRate(halfLife) {
  return Math.LN2 / halfLife;
}

function derivatives(state, p) {
  const Vd = p.vd * p.bodyWeight;
  const ke_caf = halfLifeToRate(p.halfLife_caffeine);
  const ke_px  = halfLifeToRate(p.halfLife_paraxanthine);
  const ke_tb  = halfLifeToRate(p.halfLife_theobromine);
  const ke_tp  = halfLifeToRate(p.halfLife_theophylline);

  const d = new Float64Array(STATE_SIZE);

  // Gut caffeine absorption
  d[G_CAF] = -p.ka_caffeine * state[G_CAF];

  // Plasma caffeine: absorbed from gut, eliminated by metabolism
  d[C] = (p.ka_caffeine * state[G_CAF]) / Vd - ke_caf * state[C];

  // Gut paraxanthine absorption (supplements only)
  d[G_PX] = -p.ka_paraxanthine * state[G_PX];

  // Plasma paraxanthine: from caffeine metabolism + supplement absorption - elimination
  d[P] = p.fraction_paraxanthine * ke_caf * state[C]
       + (p.ka_paraxanthine * state[G_PX]) / Vd
       - ke_px * state[P];

  // Plasma theobromine: from caffeine metabolism - elimination
  d[TB] = p.fraction_theobromine * ke_caf * state[C] - ke_tb * state[TB];

  // Plasma theophylline: from caffeine metabolism - elimination
  d[TP] = p.fraction_theophylline * ke_caf * state[C] - ke_tp * state[TP];

  return d;
}

function addScaled(state, delta, scale) {
  const result = new Float64Array(STATE_SIZE);
  for (let i = 0; i < STATE_SIZE; i++) {
    result[i] = state[i] + delta[i] * scale;
  }
  return result;
}

function rk4Step(state, params, dt) {
  const k1 = derivatives(state, params);
  const k2 = derivatives(addScaled(state, k1, dt / 2), params);
  const k3 = derivatives(addScaled(state, k2, dt / 2), params);
  const k4 = derivatives(addScaled(state, k3, dt), params);

  const next = new Float64Array(STATE_SIZE);
  for (let i = 0; i < STATE_SIZE; i++) {
    next[i] = state[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    if (next[i] < 0) next[i] = 0; // clamp negatives from numerical noise
  }
  return next;
}

/**
 * Run the simulation.
 * @param {Array} doses - [{ timeMinutes, mg, isParaxanthine }]
 *   timeMinutes is minutes from simulation start
 * @param {Object} params - PK parameters (merged with DEFAULT_PARAMS)
 * @returns {{ timestamps, caffeine, paraxanthine, theobromine, theophylline, stats }}
 */
function simulate(doses, params) {
  const p = { ...DEFAULT_PARAMS, ...params };

  // Sort doses by time
  const sortedDoses = [...doses].sort((a, b) => a.timeMinutes - b.timeMinutes);

  // Simulation window: adaptive based on half-lives
  // Need ~6 half-lives from last dose for compounds to clear below threshold
  const lastDoseTime = sortedDoses.length > 0
    ? sortedDoses[sortedDoses.length - 1].timeMinutes
    : 0;
  const longestHalfLife = Math.max(
    p.halfLife_caffeine, p.halfLife_paraxanthine,
    p.halfLife_theobromine, p.halfLife_theophylline
  );
  const clearanceWindow = Math.ceil(longestHalfLife * 7 * 60); // 7 half-lives in minutes
  const totalMinutes = Math.max(lastDoseTime + clearanceWindow, 24 * 60);

  const dt = 1 / 60; // 1 minute in hours
  const steps = totalMinutes;

  // Output arrays
  const timestamps = new Float64Array(steps);
  const caffeine = new Float64Array(steps);
  const paraxanthine = new Float64Array(steps);
  const theobromine = new Float64Array(steps);
  const theophylline = new Float64Array(steps);
  const effective = new Float64Array(steps);

  let state = new Float64Array(STATE_SIZE);
  let doseIdx = 0;

  for (let i = 0; i < steps; i++) {
    // Inject any doses at this timestep
    while (doseIdx < sortedDoses.length && sortedDoses[doseIdx].timeMinutes <= i) {
      const dose = sortedDoses[doseIdx];
      if (dose.isParaxanthine) {
        state[G_PX] += dose.mg;
      } else {
        state[G_CAF] += dose.mg;
      }
      doseIdx++;
    }

    // Record current concentrations
    timestamps[i] = i; // minutes from start
    caffeine[i] = state[C];
    paraxanthine[i] = state[P];
    theobromine[i] = state[TB];
    theophylline[i] = state[TP];

    // Effective caffeine-equivalent concentration weighted by A1R potency
    effective[i] = state[C] * p.potency_caffeine
                 + state[P] * p.potency_paraxanthine
                 + state[TB] * p.potency_theobromine
                 + state[TP] * p.potency_theophylline;

    // Advance one step
    state = rk4Step(state, p, dt);
  }

  const stats = computeStats(timestamps, caffeine, paraxanthine, theobromine, theophylline, effective, dt);

  return { timestamps, caffeine, paraxanthine, theobromine, theophylline, effective, stats };
}

function computeStats(timestamps, caffeine, paraxanthine, theobromine, theophylline, effective, dt) {
  const THRESHOLD = 0.1; // mg/L — "cleared" threshold

  function seriesStats(data, label) {
    let peak = 0;
    let peakIdx = 0;
    let auc = 0;
    let clearIdx = -1;

    for (let i = 0; i < data.length; i++) {
      if (data[i] > peak) {
        peak = data[i];
        peakIdx = i;
      }
      // Trapezoidal AUC (dt in hours, data in mg/L => AUC in mg*h/L)
      if (i > 0) {
        auc += (data[i - 1] + data[i]) / 2 * (1 / 60); // 1 minute = 1/60 hour
      }
    }

    // Find last time above threshold
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i] >= THRESHOLD) {
        clearIdx = i + 1;
        break;
      }
    }

    return {
      peak: Math.round(peak * 100) / 100,
      peakTimeMinutes: timestamps[peakIdx],
      auc: Math.round(auc * 100) / 100,
      clearTimeMinutes: clearIdx >= 0 ? timestamps[clearIdx] : null,
    };
  }

  return {
    caffeine: seriesStats(caffeine, 'caffeine'),
    paraxanthine: seriesStats(paraxanthine, 'paraxanthine'),
    theobromine: seriesStats(theobromine, 'theobromine'),
    theophylline: seriesStats(theophylline, 'theophylline'),
    effective: seriesStats(effective, 'effective'),
  };
}
