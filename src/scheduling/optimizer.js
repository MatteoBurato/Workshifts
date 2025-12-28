/**
 * Schedule Optimization Engine
 *
 * This module provides optimization strategies for shift scheduling:
 *
 * 1. Genetic Algorithm (Primary) - Evolutionary optimization
 *    - Starts from valid matrix-based baseline
 *    - Optimizes for hours balance and minimal changes
 *    - Always finds a solution
 *
 * 2. Greedy Assignment (Fallback) - Fast heuristic approach
 *    - Uses matrix patterns with continuity scoring
 *    - Used as baseline for GA and quick generation
 */

import { runGeneticAlgorithm, DEFAULT_SCHEDULE_GA_CONFIG } from './ga/index.js';
import { getFirstDayOfMonth } from '../utils/dates.js';

// ============================================
// GENETIC ALGORITHM OPTIMIZATION (Primary)
// ============================================

/**
 * Generate schedule using Genetic Algorithm
 *
 * @param {Object} params
 * @param {number} params.year
 * @param {number} params.month
 * @param {number} params.daysInMonth
 * @param {Array<Object>} params.employees
 * @param {Array<Object>} params.shiftTypes
 * @param {Array<Object>} params.matrices - Array of { id, name, rows } matrix objects
 * @param {Object} params.matrixMap - Map from matrixId to matrix rows
 * @param {Array<Array<string>>} params.defaultMatrix - Default matrix rows (first matrix)
 * @param {Array<Object>} params.constraints - Application constraints
 * @param {Object<string, number>} params.requirements - Coverage requirements
 * @param {Object} params.options - GA options
 * @returns {Object} Result with schedule and metadata
 */
export const solveWithGA = (params) => {
  const {
    daysInMonth,
    employees,
    shiftTypes,
    constraints,
    coverageRules,
    options = {}
  } = params;

  try {
    // Use solveWithGreedy to generate the baseline schedule
    // This handles global phase synchronization and matrix unraveling
    const greedyResult = solveWithGreedy(params);

    // Extract shifts from greedy result to use as baseline
    const baselineShifts = {};
    for (const emp of employees) {
      if (greedyResult.schedule[emp.id]?.shifts) {
        baselineShifts[emp.id] = greedyResult.schedule[emp.id].shifts;
      }
    }

    // Get assignments from greedy result for metadata
    const initialAssignments = greedyResult.assignments || [];
    console.log('[Optimizer] Baseline from greedy, assignments sample:', initialAssignments.slice(0, 3));

    // Build GA options explicitly using single source of truth for defaults
    const gaOptions = {
      populationSize: options.populationSize || DEFAULT_SCHEDULE_GA_CONFIG.POPULATION_SIZE,
      maxGenerations: options.maxGenerations || DEFAULT_SCHEDULE_GA_CONFIG.MAX_GENERATIONS,
      timeoutMs: options.timeoutMs || DEFAULT_SCHEDULE_GA_CONFIG.TIMEOUT_MS,
      stagnationLimit: options.stagnationLimit || DEFAULT_SCHEDULE_GA_CONFIG.STAGNATION_LIMIT,
      eliteCount: options.eliteCount || DEFAULT_SCHEDULE_GA_CONFIG.ELITE_COUNT,
      mutationRate: options.mutationRate || DEFAULT_SCHEDULE_GA_CONFIG.MUTATION_RATE,
      weights: options.weights,
      baselineAdherence: options.baselineAdherence
    };

    console.log('[GA] Running with options:', gaOptions);

    // Pass baselineShifts directly - GA evolves from greedy solution
    const result = runGeneticAlgorithm({
      daysInMonth,
      employees,
      shiftTypes,
      baselineShifts,
      constraints,
      coverageRules,
      options: gaOptions,
      onProgress: options.onProgress
    });

    // Check if the solution is actually valid (all hard constraints met)
    if (!result.evaluation || !result.evaluation.isValid) {
      // Still build the schedule from the best result found, so user can view it
      const failedSchedule = {};
      for (const emp of employees) {
        const shifts = result.schedule[emp.id];
        const assignment = initialAssignments.find(a => a.employeeId === emp.id);

        if (shifts) {
          failedSchedule[emp.id] = {
            shifts,
            source: 'ga-failed',
            matrixRow: assignment?.matrixRow ?? 0,
            dayOffset: assignment?.dayOffset ?? 0,
            continuityScore: assignment?.continuityScore
          };
        }
      }

      return {
        success: false,
        reason: 'constraints_violated',
        error: 'Unable to find a solution that satisfies all hard constraints.',
        method: 'ga',
        schedule: failedSchedule, // Include best schedule found even on failure
        stats: result.evaluation ? {
          fitness: result.fitness,
          constraintViolations: result.evaluation.components.constraintViolations,
          coverageViolations: result.evaluation.components.coverageViolations,
          coverageDetails: result.evaluation.coverageDetails || []
        } : null,
        evaluation: result.evaluation
      };
    }

    // Convert GA result to optimizer format
    const schedule = {};
    for (const emp of employees) {
      const shifts = result.schedule[emp.id];
      const assignment = initialAssignments.find(a => a.employeeId === emp.id);

      if (shifts) {
        schedule[emp.id] = {
          shifts,
          source: 'ga',
          matrixRow: assignment?.matrixRow ?? 0,
          dayOffset: assignment?.dayOffset ?? 0,
          continuityScore: assignment?.continuityScore
        };
      }
    }

    return {
      success: true,
      schedule,
      method: 'ga',
      stats: {
        generations: result.generations,
        fitness: result.fitness,
        timeMs: result.timeMs
      },
      evaluation: result.evaluation
    };
  } catch (error) {
    return {
      success: false,
      reason: 'error',
      error: error.message,
      method: 'ga'
    };
  }
};

// ============================================
// GREEDY OPTIMIZATION (Fallback)
// ============================================

/**
 * Generate a default optimal matrix pattern
 * This is a pre-designed 8x7 matrix that respects common Italian healthcare constraints
 *
 * @returns {Array<Array<string>>} Default 8x7 shift matrix
 */
export const generateDefaultMatrix = () => [
  ['M', 'P', 'N', 'SN', 'RP', 'M', 'P'],
  ['P', 'N', 'SN', 'RP', 'M', 'P', 'P'],
  ['N', 'SN', 'RP', 'M', 'P', 'N', 'SN'],
  ['SN', 'RP', 'M', 'P', 'N', 'SN', 'RP'],
  ['RP', 'M', 'P', 'N', 'SN', 'RP', 'M'],
  ['M', 'P', 'P', 'N', 'SN', 'RP', 'M'],
  ['P', 'P', 'N', 'SN', 'RP', 'M', 'P'],
  ['P', 'N', 'SN', 'RP', 'M', 'M', 'P'],
];

/**
 * Calculate how well an employee's previous month shifts match a matrix position
 * Uses "Snake" pattern logic (continuous matrix)
 *
 * @param {Array<string>} lastShifts - Employee's shifts from previous month
 * @param {Array<Array<string>>} matrix - The shift pattern matrix
 * @param {number} matrixRow - Row to evaluate
 * @param {number} startOffset - Starting day offset to evaluate
 * @returns {number} Continuity score from 0 (no match) to 1 (perfect match)
 */
export const calculateContinuityScore = (lastShifts, matrix, matrixRow, startOffset) => {
  if (!lastShifts || lastShifts.length === 0) return 0;
  if (!matrix || matrix.length === 0) return 0;

  const fullPattern = matrix.flat();
  const rowLength = matrix[0].length;
  const startIndex = (matrixRow * rowLength + startOffset);

  let matches = 0;
  // Increase check window to 28 days (4 weeks) to ensure robust row identification
  // This prevents short-term pattern ambiguities from assigning the wrong row.
  const checkDays = Math.min(lastShifts.length, 28);

  for (let i = 0; i < checkDays; i++) {
    const shiftIndex = lastShifts.length - checkDays + i;
    const patternIndex = (startIndex + i) % fullPattern.length;

    if (lastShifts[shiftIndex] === fullPattern[patternIndex]) {
      matches++;
    }
  }

  return matches / checkDays;
};

/**
 * Find optimal matrix assignment using a better distribution algorithm
 *
 * @param {Array<Object>} employees
 * @param {Array<Array<string>>} matrix
 * @param {Object|null} previousMonthSchedule
 * @param {number} cycleLength
 * @returns {Array<Object>} Assignments
 */
export const findOptimalMatrixAssignment = (employees, matrix, previousMonthSchedule, cycleLength, forcedPhase = null) => {
  const rowLength = matrix[0].length;
  const totalRows = matrix.length;
  
  if (!previousMonthSchedule || Object.keys(previousMonthSchedule).length === 0) {
    return employees.map((emp, idx) => ({
      employeeId: emp.id,
      matrixRow: idx % totalRows,
      dayOffset: 0,
      continuityScore: null,
      hasHistory: false
    }));
  }

  // 1. Calculate all possible scores for all employees and all positions
  // To keep it simple but effective, we'll only consider the R standard starting positions (row starts)
  const scoring = [];
  
  for (const emp of employees) {
    const lastShifts = previousMonthSchedule[emp.id];
    if (!lastShifts || lastShifts.length === 0) {
      scoring.push({ emp, scores: Array(totalRows).fill({ score: 0, row: 0, offset: 0 }) });
      continue;
    }

    const empScores = [];
    for (let row = 0; row < totalRows; row++) {
      // We check continuity for this row
      // We also check all possible start offsets within the cycle length
      let bestRowScore = -1;
      let bestOffset = 0;

      for (let offset = 0; offset < rowLength; offset++) {
        const score = calculateContinuityScore(lastShifts, matrix, row, offset);
        if (score > bestRowScore) {
          bestRowScore = score;
          bestOffset = offset;
        }
      }
      
      // The "actual" starting position for this month should be the one following the last shifts
      // calculateContinuityScore matches against the LAST 'checkDays' (max 28) of the history.
      // So 'bestOffset' corresponds to the position at (HistoryEnd - checkDays).
      // To get the position for (HistoryEnd + 1) -> Start of Current Month, we add checkDays.
      const checkDays = Math.min(lastShifts.length, 28);
      const totalPrevIndex = row * rowLength + bestOffset + checkDays;
      const totalLen = totalRows * rowLength;
      const newTotalIndex = totalPrevIndex % totalLen;
      
      empScores.push({
        score: bestRowScore,
        row: Math.floor(newTotalIndex / rowLength),
        offset: newTotalIndex % rowLength,
        origRow: row,
        origOffset: bestOffset,
        checkDays: checkDays // Store for later use
      });
    }
    scoring.push({ emp, scores: empScores });
  }

  // 2. Greedy assignment to distribute employees
  // We want to fill each row roughly equally
  const assignments = [];
  const rowUsage = Array(totalRows).fill(0);
  const maxPerRow = Math.ceil(employees.length / totalRows);
  
  // Sort employees by their best score difference (MRV-like heuristic) or just best score
  const sortedEmps = [...scoring].sort((a, b) => {
    const maxA = Math.max(...a.scores.map(s => s.score));
    const maxB = Math.max(...b.scores.map(s => s.score));
    return maxB - maxA; // High scores first
  });

  const assignedEmpIds = new Set();

  for (const { emp, scores } of sortedEmps) {
    // Find best row that still has capacity
    let bestRowIdx = -1;
    let bestScore = -1;

    // Try to find the best row that isn't over-used
    const availableScores = scores
      .map((s, idx) => ({ ...s, idx }))
      .sort((a, b) => b.score - a.score);

    for (const s of availableScores) {
      if (rowUsage[s.row] < maxPerRow) {
        bestRowIdx = s.idx;
        bestScore = s.score;
        break;
      }
    }

    // Fallback if all rows at maxPerRow (shouldn't happen with ceil)
    if (bestRowIdx === -1) {
      bestRowIdx = availableScores[0].idx;
      bestScore = availableScores[0].score;
    }

    const chosen = scores[bestRowIdx];
    
    // Calculate where this employee would land next month
    // chosen.offset is ALREADY the projected offset for Day 0 of current month
    const targetNextOffset = chosen.offset;

    assignments.push({
      employeeId: emp.id,
      matrixRow: chosen.row,
      dayOffset: chosen.offset,
      continuityScore: chosen.score,
      historyLength: (previousMonthSchedule && previousMonthSchedule[emp.id]) ? previousMonthSchedule[emp.id].length : 0,
      checkDays: chosen.checkDays,
      targetNextOffset: targetNextOffset,
      rawScore: chosen.score
    });
    rowUsage[chosen.row]++;
    assignedEmpIds.add(emp.id);
  }

  // --- PHASE SYNCHRONIZATION ---
  // We need to ensure everyone starts the new month at the same "Matrix Column" (Phase)
  // to preserve vertical coverage.

  let dominantPhase;
  let useDominantPhase;

  if (forcedPhase !== null) {
    // Use externally provided phase (for global sync across matrices)
    dominantPhase = forcedPhase;
    useDominantPhase = true;
  } else {
    // Vote for the most common "Target Next Offset" among reliable matches
    const phaseVotes = {};
    assignments.forEach(a => {
      if (a.rawScore >= 0.4 && a.historyLength > 0) {
        phaseVotes[a.targetNextOffset] = (phaseVotes[a.targetNextOffset] || 0) + 1;
      }
    });

    // Find dominant phase
    dominantPhase = -1;
    let maxVotes = 0;
    for (const [phase, count] of Object.entries(phaseVotes)) {
      if (count > maxVotes) {
        maxVotes = count;
        dominantPhase = parseInt(phase);
      }
    }

    // Align everyone to Dominant Phase (if widely supported)
    // If dominant phase has little support (e.g. < 2 votes), we might just trust the calendar (hasHistory=false).
    useDominantPhase = maxVotes >= 2;
  }

  if (useDominantPhase) {
    // We need to re-evaluate assignments for everyone to find the best ROW given the forced PHASE.
    assignments.forEach(a => {
      const emp = employees.find(e => e.id === a.employeeId);
      const lastShifts = previousMonthSchedule ? previousMonthSchedule[emp.id] : null;

      if (!lastShifts || lastShifts.length === 0) return; // No history, keep default

      // Calculate the specific startOffset required to hit the Dominant Phase
      // We want: startOffset + checkDays = dominantPhase (modulo rowLength)
      // So: startOffset = dominantPhase - checkDays
      const checkDays = Math.min(lastShifts.length, 28);
      let requiredStartOffset = (dominantPhase - checkDays) % rowLength;
      if (requiredStartOffset < 0) requiredStartOffset += rowLength;

      // Check if the employee is already aligned
      if (a.targetNextOffset === dominantPhase && a.rawScore >= 0.4) {
        a.hasHistory = true;
        return; // Already optimal and aligned
      }

      // Re-scan ALL rows to find the best match for this specific required offset
      let bestRow = -1;
      let bestScore = -1;

      for (let row = 0; row < totalRows; row++) {
        const score = calculateContinuityScore(lastShifts, matrix, row, requiredStartOffset);
        if (score > bestScore) {
          bestScore = score;
          bestRow = row;
        }
      }

      // Update the assignment with the best row for this phase
      // Even if the score is 0, we must align them to the phase to ensure coverage.
      if (bestRow !== -1) {
          a.matrixRow = bestRow;
          a.dayOffset = dominantPhase; // The resulting offset IS the dominant phase
          a.continuityScore = bestScore;
          a.hasHistory = true; // Force generator to use this aligned offset
      }
    });
  } else {
    // No consensus found - Fallback to individual scores
    assignments.forEach(a => {
        // If score is bad, disable history to fall back to Calendar Default
        a.hasHistory = a.rawScore >= 0.4 && a.historyLength > 0;
    });
  }

  return assignments;
};

/**
 * Generate schedule using greedy matrix assignment
 *
 * @param {Object} params
 * @returns {Object} Result with schedule
 */
export const solveWithGreedy = (params) => {
  const {
    year,
    month,
    daysInMonth,
    employees,
    matrices,
    matrixMap,
    defaultMatrix,
    previousMonthSchedule,
    cycleLength
  } = params;

  const dayOfWeekOffset = getFirstDayOfMonth(year, month);
  const defaultMatrixId = matrices?.[0]?.id;

  // Group employees by their assigned matrix
  const employeesByMatrix = {};
  for (const emp of employees) {
    const matrixId = emp.matrixId || defaultMatrixId;
    if (!employeesByMatrix[matrixId]) {
      employeesByMatrix[matrixId] = [];
    }
    employeesByMatrix[matrixId].push(emp);
  }

  // ========== GLOBAL PHASE SYNCHRONIZATION (Two-Pass Approach) ==========
  // PASS 1: Get preliminary assignments WITHOUT phase enforcement
  const preliminaryAssignments = [];

  for (const matrixId of Object.keys(employeesByMatrix)) {
    const groupEmployees = employeesByMatrix[matrixId];
    const matrix = (matrixMap && matrixMap[matrixId]) || defaultMatrix;
    const rowLength = matrix[0]?.length || 7;

    const groupAssignments = findOptimalMatrixAssignment(
      groupEmployees,
      matrix,
      previousMonthSchedule,
      cycleLength || rowLength,
      null  // No forced phase - just get targetNextOffset
    );

    for (const assignment of groupAssignments) {
      assignment.matrixId = matrixId;
      preliminaryAssignments.push(assignment);
    }
  }

  // GLOBAL PHASE VOTE across all matrices
  const phaseVotes = {};
  preliminaryAssignments.forEach(a => {
    if (a.rawScore >= 0.4 && a.historyLength > 0) {
      phaseVotes[a.targetNextOffset] = (phaseVotes[a.targetNextOffset] || 0) + 1;
    }
  });

  // Find dominant phase
  let globalDominantPhase = null;
  let maxVotes = 0;
  for (const [phase, count] of Object.entries(phaseVotes)) {
    if (count > maxVotes) {
      maxVotes = count;
      globalDominantPhase = parseInt(phase);
    }
  }

  // Only use global phase if we have meaningful consensus (>= 2 votes)
  const useGlobalPhase = maxVotes >= 2;
  // console.log('[Greedy] Global phase vote:', { phaseVotes, globalDominantPhase, useGlobalPhase });

  // PASS 2: Re-assign with global dominant phase and generate schedule
  const allAssignments = [];
  const schedule = {};

  for (const matrixId of Object.keys(employeesByMatrix)) {
    const groupEmployees = employeesByMatrix[matrixId];
    const matrix = (matrixMap && matrixMap[matrixId]) || defaultMatrix;
    const rowLength = matrix[0]?.length || 7;
    const fullPattern = matrix.flat();

    const groupAssignments = findOptimalMatrixAssignment(
      groupEmployees,
      matrix,
      previousMonthSchedule,
      cycleLength || rowLength,
      useGlobalPhase ? globalDominantPhase : null  // Force global phase if consensus
    );

    for (const assignment of groupAssignments) {
      assignment.matrixId = matrixId;
      allAssignments.push(assignment);
    }

    for (const emp of groupEmployees) {
      const assignment = groupAssignments.find(a => a.employeeId === emp.id);
      const matrixRow = assignment?.matrixRow || 0;
      const dayOffset = assignment?.dayOffset || 0;
      const effectiveDOW = assignment?.hasHistory ? 0 : dayOfWeekOffset;

      // Calculate start index in the snake
      const startIndex = matrixRow * rowLength + dayOffset;

      const shifts = [];
      for (let day = 0; day < daysInMonth; day++) {
        const patternIndex = (startIndex + day + effectiveDOW) % fullPattern.length;
        shifts.push(fullPattern[patternIndex]);
      }

      schedule[emp.id] = {
        shifts,
        source: 'greedy',
        matrixRow,
        dayOffset,
        matrixId,
        continuityScore: assignment?.continuityScore
      };
    }
  }

  return {
    success: true,
    schedule,
    method: 'greedy',
    assignments: allAssignments
  };
};

// ============================================
// UNIFIED OPTIMIZATION API
// ============================================

/**
 * Main optimization function - uses GA for optimization
 *
 * @param {Object} params - All scheduling parameters
 * @param {Object} options - Optimization options
 * @param {boolean} options.useGA - Whether to use GA (default: true)
 * @param {boolean} options.greedyFallback - Fall back to greedy if GA fails (default: true)
 * @param {number} options.gaTimeoutMs - GA timeout (default: 60000)
 * @returns {Object} Optimization result
 */
export const optimizeSchedule = (params, options = {}) => {
  const {
    useGA = true,
    greedyFallback = true,
    gaTimeoutMs = DEFAULT_SCHEDULE_GA_CONFIG.TIMEOUT_MS,
    gaPopulationSize = DEFAULT_SCHEDULE_GA_CONFIG.POPULATION_SIZE,
    gaMaxGenerations = DEFAULT_SCHEDULE_GA_CONFIG.MAX_GENERATIONS,
    gaStagnationLimit = DEFAULT_SCHEDULE_GA_CONFIG.STAGNATION_LIMIT,
    gaEliteCount = DEFAULT_SCHEDULE_GA_CONFIG.ELITE_COUNT,
    gaMutationRate = DEFAULT_SCHEDULE_GA_CONFIG.MUTATION_RATE,
    weights,
    baselineAdherence
  } = options;

  // Try GA optimizer first
  if (useGA) {
    const gaResult = solveWithGA({
      ...params,
      options: {
        timeoutMs: gaTimeoutMs,
        populationSize: gaPopulationSize,
        maxGenerations: gaMaxGenerations,
        stagnationLimit: gaStagnationLimit,
        eliteCount: gaEliteCount,
        mutationRate: gaMutationRate,
        weights: weights,
        onProgress: options.onProgress,
        baselineAdherence
      }
    });

    if (gaResult.success) {
      return gaResult;
    }

    // GA failed - log reason
    console.log(`GA optimizer failed: ${gaResult.reason}`, gaResult.error);

    if (!greedyFallback) {
      return gaResult;
    }
  }

  // Fall back to greedy
  const greedyResult = solveWithGreedy(params);

  return {
    ...greedyResult,
    gaFailed: useGA,
    gaReason: useGA ? 'fallback' : undefined
  };
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Calculate total working hours from a shift sequence
 *
 * @param {Array<string>} shifts
 * @param {Array<Object>} shiftTypes
 * @returns {number}
 */
export const calculateWorkerHours = (shifts, shiftTypes) => {
  return shifts.reduce((total, shiftId) => {
    const shift = shiftTypes.find(s => s.id === shiftId || shiftId?.startsWith(s.id + '_'));
    return total + (shift?.hours || 0);
  }, 0);
};

/**
 * Analyze the quality of assignments
 *
 * @param {Array<Object>} assignments
 * @returns {Object}
 */
export const analyzeAssignmentQuality = (assignments) => {
  const scores = assignments
    .map(a => a.continuityScore)
    .filter(s => s !== null && s !== undefined);

  if (scores.length === 0) {
    return {
      avgContinuity: null,
      minContinuity: null,
      maxContinuity: null,
      employeesWithData: 0,
      employeesWithoutData: assignments.length
    };
  }

  return {
    avgContinuity: scores.reduce((a, b) => a + b, 0) / scores.length,
    minContinuity: Math.min(...scores),
    maxContinuity: Math.max(...scores),
    employeesWithData: scores.length,
    employeesWithoutData: assignments.length - scores.length
  };
};
