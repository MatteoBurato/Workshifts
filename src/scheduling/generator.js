/**
 * Schedule Generator
 *
 * This module generates monthly schedules using the CSP optimizer.
 * It handles:
 * - CSP-based schedule generation with constraint satisfaction
 * - Fallback to greedy approach if CSP times out
 * - Employee-specific rules (noNights, contract hours)
 * - Constraint validation on final schedule
 * - Coverage requirements checking
 */

import { getDaysInMonth, calculateMonthlyHours } from '../utils/dates';
import { validateSequenceWithConstraints } from './constraints';
import {
  optimizeSchedule,
  calculateWorkerHours,
  generateDefaultMatrix
} from './optimizer';

/**
 * @typedef {Object} EmployeeSchedule
 * @property {Array<string>} shifts - Array of shift IDs for each day
 * @property {number} totalHours - Total hours worked in the month
 * @property {number} contractHours - Expected contract hours for the month
 * @property {number} hoursDiff - Difference between actual and contract hours
 * @property {number} matrixRow - Assigned matrix row
 * @property {number} dayOffset - Day offset in the cycle
 * @property {number|null} continuityScore - Continuity score with previous month
 * @property {string} source - 'csp' or 'greedy'
 * @property {Array<Object>} warnings - Constraint violations for this employee
 */

/**
 * @typedef {Object} GenerationResult
 * @property {Object<string, EmployeeSchedule>} schedule - Schedule by employee ID
 * @property {Array<Object>} warnings - All warnings (employee + coverage)
 * @property {Object} metadata - Generation metadata (method used, stats)
 */

/**
 * Apply exclusion constraints to a shift sequence
 *
 * @param {Array<string>} shifts
 * @param {Object} employee
 * @param {string} replacement
 * @returns {Array<string>}
 */
const applyExclusionConstraints = (shifts, employee, replacement = 'P') => {
  // Check for specific excluded shifts
  if (employee.excludedShifts && Array.isArray(employee.excludedShifts)) {
    return shifts.map(shift => {
      if (employee.excludedShifts.includes(shift)) {
        return replacement;
      }
      return shift;
    });
  }

  return shifts;
};

/**
 * Generate a complete monthly schedule using optimization
 *
 * Process:
 * 1. Run optimizer (GA or greedy fallback)
 * 2. Calculate hours for each employee
 *
 * Note: Constraint validation and warnings are now handled by the
 * centralized evaluator (evaluateSchedule) in App.jsx after generation.
 *
 * @param {Object} params
 * @param {number} params.year
 * @param {number} params.month
 * @param {Array<Object>} params.employees
 * @param {Array<Object>} params.shiftTypes
 * @param {Array<Array<string>>} params.matrix
 * @param {Array<Object>} params.coverageRules
 * @param {Array<Object>} params.constraints
 * @param {Object|null} params.previousMonthSchedule
 * @param {Object} params.optimizerOptions - Options for the optimizer
 * @returns {GenerationResult}
 */
export const generateMonthlySchedule = ({
  year,
  month,
  employees,
  shiftTypes,
  matrix,
  coverageRules,
  constraints,
  previousMonthSchedule,
  optimizerOptions = {}
}) => {
  const daysInMonth = getDaysInMonth(year, month);
  const cycleLength = matrix[0]?.length || 7;

  // Step 1: Run optimizer
  const optimizerResult = optimizeSchedule({
    year,
    month,
    daysInMonth,
    employees,
    shiftTypes,
    matrix,
    constraints,
    coverageRules,
    previousMonthSchedule,
    cycleLength
  }, {
    useGA: optimizerOptions.useCSP !== false, // Map legacy useCSP to useGA
    greedyFallback: optimizerOptions.greedyFallback === true,
    gaTimeoutMs: optimizerOptions.gaTimeoutMs || 60000,
    gaPopulationSize: optimizerOptions.populationSize,
    gaMaxGenerations: optimizerOptions.maxGenerations,
    gaStagnationLimit: optimizerOptions.stagnationLimit,
    gaEliteCount: optimizerOptions.eliteCount,
    gaMutationRate: optimizerOptions.mutationRate,
    weights: optimizerOptions.weights,
    onProgress: optimizerOptions.onProgress,
    baselineAdherence: optimizerOptions.baselineAdherence
  });

  if (!optimizerResult.success) {
    let friendlyMessage = "Errore durante l'ottimizzazione.";
    switch (optimizerResult.reason) {
      case 'no_solution':
        friendlyMessage = "Spazio di ricerca esaurito: nessuna soluzione soddisfa tutti i vincoli rigidi configurati.";
        break;
      case 'timeout':
        friendlyMessage = "Tempo limite di calcolo superato (30 minuti).";
        break;
      case 'max_backtracks':
        friendlyMessage = "Limite di tentativi superato. Il problema è troppo complesso o i vincoli sono molto restrittivi.";
        break;
      case 'initial_inconsistency':
        friendlyMessage = "I vincoli configurati sono intrinsecamente contraddittori (impossibile iniziare).";
        break;
      case 'constraints_violated':
        friendlyMessage = "L'algoritmo non ha trovato una soluzione che soddisfi tutti i vincoli.";
        break;
      default:
        friendlyMessage = `Errore di ottimizzazione: ${optimizerResult.reason}`;
    }

    // Build the best-effort schedule if optimizer returned one (even on failure)
    // Note: Detailed warnings will be built by the centralized evaluator in App.jsx
    let bestEffortSchedule = {};

    if (optimizerResult.schedule && Object.keys(optimizerResult.schedule).length > 0) {
      for (const emp of employees) {
        const optResult = optimizerResult.schedule[emp.id];
        if (optResult?.shifts) {
          const totalHours = calculateWorkerHours(optResult.shifts, shiftTypes);
          const monthlyContract = calculateMonthlyHours(emp.contractHours, year, month);

          bestEffortSchedule[emp.id] = {
            shifts: optResult.shifts,
            totalHours,
            contractHours: monthlyContract,
            hoursDiff: totalHours - monthlyContract,
            matrixRow: optResult.matrixRow ?? 0,
            dayOffset: optResult.dayOffset ?? 0,
            continuityScore: optResult.continuityScore ?? null,
            source: optResult.source || 'ga-failed',
            warnings: []
          };
        }
      }
    }

    return {
      schedule: bestEffortSchedule,
      warnings: [{
        message: friendlyMessage,
        details: {
          reason: optimizerResult.reason,
          stats: optimizerResult.stats
        }
      }],
      metadata: {
        method: optimizerResult.method,
        cspFailed: optimizerResult.cspFailed,
        cspReason: optimizerResult.cspReason,
        stats: optimizerResult.stats,
        failed: true,
        hasBestEffortSchedule: Object.keys(bestEffortSchedule).length > 0
      }
    };
  }

  const schedule = {};
  const optimizerSchedule = optimizerResult.schedule || {};

  // Process each employee's schedule
  // Note: Constraint validation and warnings are handled by the centralized evaluator in App.jsx
  for (const emp of employees) {
    const optResult = optimizerSchedule[emp.id];
    let shifts = optResult?.shifts || [];

    // If no shifts from optimizer, generate from matrix (shouldn't happen)
    if (shifts.length === 0) {
      const matrixRow = 0;
      const dayOffset = 0;
      const pattern = matrix[matrixRow] || matrix[0];

      shifts = [];
      for (let day = 0; day < daysInMonth; day++) {
        const cycleDay = (dayOffset + day) % pattern.length;
        shifts.push(pattern[cycleDay]);
      }
    }

    // Calculate hours
    const totalHours = calculateWorkerHours(shifts, shiftTypes);
    const monthlyContract = calculateMonthlyHours(emp.contractHours, year, month);

    schedule[emp.id] = {
      shifts,
      totalHours,
      contractHours: monthlyContract,
      hoursDiff: totalHours - monthlyContract,
      matrixRow: optResult?.matrixRow ?? 0,
      dayOffset: optResult?.dayOffset ?? 0,
      continuityScore: optResult?.continuityScore ?? null,
      source: optResult?.source || 'unknown'
    };
  }

  return {
    schedule,
    warnings: [], // Warnings are now built by the centralized evaluator
    metadata: {
      method: optimizerResult.method,
      cspFailed: optimizerResult.cspFailed,
      cspReason: optimizerResult.cspReason,
      stats: optimizerResult.stats
    }
  };
};

/**
 * Regenerate schedule with a modified assignment for one employee
 *
 * @param {Object} currentSchedule
 * @param {string} employeeId
 * @param {number} newMatrixRow
 * @param {number} newDayOffset
 * @param {Object} params
 * @returns {GenerationResult}
 */
export const regenerateWithModification = (
  currentSchedule,
  employeeId,
  newMatrixRow,
  newDayOffset,
  params
) => {
  const modifiedPrevious = { ...params.previousMonthSchedule };
  delete modifiedPrevious[employeeId];

  const { employees, ...restParams } = params;
  const otherEmployees = employees.filter(e => e.id !== employeeId);
  const targetEmployee = employees.find(e => e.id === employeeId);

  // Generate for other employees
  const result = generateMonthlySchedule({
    ...restParams,
    employees: otherEmployees,
    previousMonthSchedule: modifiedPrevious,
    optimizerOptions: { useCSP: false } // Use greedy for modifications
  });

  // Manually generate for target employee
  if (targetEmployee) {
    const daysInMonth = getDaysInMonth(params.year, params.month);
    const pattern = params.matrix[newMatrixRow] || params.matrix[0];

    let shifts = [];
    for (let day = 0; day < daysInMonth; day++) {
      const cycleDay = (newDayOffset + day) % pattern.length;
      shifts.push(pattern[cycleDay]);
    }

    shifts = applyExclusionConstraints(shifts, targetEmployee);

    const errors = validateSequenceWithConstraints(
      shifts,
      params.constraints,
      params.shiftTypes
    );

    const totalHours = calculateWorkerHours(shifts, params.shiftTypes);
    const monthlyContract = calculateMonthlyHours(
      targetEmployee.contractHours,
      params.year,
      params.month
    );

    result.schedule[employeeId] = {
      shifts,
      totalHours,
      contractHours: monthlyContract,
      hoursDiff: totalHours - monthlyContract,
      matrixRow: newMatrixRow,
      dayOffset: newDayOffset,
      continuityScore: null,
      source: 'manual',
      warnings: errors
    };

    if (errors.length > 0) {
      result.warnings.push({
        employee: `${targetEmployee.surname} ${targetEmployee.name}`,
        employeeId,
        errors
      });
    }
  }

  return result;
};

// Re-export for convenience
export { generateDefaultMatrix } from './optimizer';
