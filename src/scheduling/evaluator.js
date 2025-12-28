/**
 * Centralized Schedule Evaluator
 *
 * This module is the SINGLE SOURCE OF TRUTH for all schedule validation.
 * It provides:
 * - Core validation functions for counting violations
 * - validateSchedule() for programmatic access to validation results
 * - evaluateSchedule() for UI-friendly warnings with human-readable messages
 *
 * The GA fitness.js module delegates to this for validation and applies weights.
 */

import { validateSequenceWithConstraints } from './constraints.js';

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * @typedef {Object} ScheduleWarning
 * @property {string} type - 'constraint' | 'coverage' | 'exclusion'
 * @property {string} severity - 'error'
 * @property {number} day - Day number (1-indexed)
 * @property {string|null} employeeId - Employee ID (null for coverage warnings)
 * @property {string|null} employeeName - Employee full name
 * @property {string} constraintId - ID of the violated constraint/rule
 * @property {string} message - Human-readable message
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - True if no hard constraint violations
 * @property {Object} violations - Counts of each violation type
 * @property {Object} metrics - Soft metrics (hours, matrix deviations)
 * @property {Array} byEmployee - Per-employee breakdown
 * @property {Array} coverageDetails - Day-by-day coverage details
 */

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a shift matches a target shift ID (handles variants like M_1, M_2)
 *
 * @param {string} shift - Shift to check
 * @param {string} targetId - Target shift ID
 * @returns {boolean}
 */
const shiftMatches = (shift, targetId) => {
  if (!shift || !targetId) return false;
  return shift === targetId || shift.startsWith(targetId + '_');
};

/**
 * Normalize schedule to consistent format: { empId: shifts[] }
 *
 * @param {Object} schedule - Schedule in either format
 * @returns {Object} Normalized schedule
 */
const normalizeSchedule = (schedule) => {
  const normalized = {};
  for (const [empId, data] of Object.entries(schedule)) {
    if (Array.isArray(data)) {
      normalized[empId] = data;
    } else if (data?.shifts) {
      normalized[empId] = data.shifts;
    } else {
      normalized[empId] = [];
    }
  }
  return normalized;
};

// ============================================
// CORE VALIDATION FUNCTIONS
// ============================================

/**
 * Count constraint violations in a shift sequence
 *
 * @param {Array<string>} shifts - Employee's shifts for the period
 * @param {Array<Object>} constraints - Constraint definitions
 * @param {Array<Object>} shiftTypes - Shift type definitions
 * @returns {number} Number of violations
 */
export const countConstraintViolations = (shifts, constraints, shiftTypes) => {
  const errors = validateSequenceWithConstraints(shifts, constraints, shiftTypes);
  return errors.length;
};

/**
 * Get detailed constraint errors (for generating warnings)
 *
 * @param {Array<string>} shifts - Employee's shifts
 * @param {Array<Object>} constraints - Constraint definitions
 * @param {Array<Object>} shiftTypes - Shift type definitions
 * @returns {Array<{day: number, constraintId: string, message: string}>}
 */
export const getConstraintErrors = (shifts, constraints, shiftTypes) => {
  return validateSequenceWithConstraints(shifts, constraints, shiftTypes);
};

/**
 * Count exclusion violations (shifts employee shouldn't work)
 *
 * @param {Array<string>} shifts - Employee's shifts
 * @param {Array<string>} excludedShifts - Shifts this employee cannot work
 * @returns {number} Number of violations
 */
export const countExclusionViolations = (shifts, excludedShifts) => {
  if (!excludedShifts?.length || !shifts?.length) return 0;
  return shifts.filter(shift => {
    // Handle shift variants (M_1 matches M)
    return excludedShifts.some(excluded => shiftMatches(shift, excluded));
  }).length;
};

/**
 * Check coverage for a single day (EXACT constraint - penalizes under AND over)
 *
 * @param {Object<string, Array<string>>} scheduleByEmployee - { empId: shifts[] }
 * @param {number} day - Day index (0-based)
 * @param {Array<Object>} coverageRules - Coverage rule definitions
 * @returns {{violations: number, details: Array}}
 */
export const checkDayCoverage = (scheduleByEmployee, day, coverageRules) => {
  if (!coverageRules || !Array.isArray(coverageRules)) {
    return { violations: 0, details: [] };
  }

  // Count shifts for this day
  const counts = {};
  for (const shifts of Object.values(scheduleByEmployee)) {
    const shift = shifts[day];
    if (!shift) continue;
    counts[shift] = (counts[shift] || 0) + 1;
  }

  let violations = 0;
  const details = [];

  for (const rule of coverageRules) {
    if (rule.enabled === false || rule.min <= 0) continue;

    // Sum counts for all allowed shifts in this rule
    let actual = 0;
    for (const shiftId of rule.shiftIds) {
      actual += (counts[shiftId] || 0);
    }

    // Exact constraint: penalize both under-coverage and over-coverage
    if (actual !== rule.min) {
      const deviation = Math.abs(rule.min - actual);
      violations += deviation;
      details.push({
        day,
        ruleId: rule.id,
        shiftIds: rule.shiftIds,
        required: rule.min,
        actual,
        deviation,
        type: actual < rule.min ? 'under' : 'over'
      });
    }
  }

  return { violations, details };
};

/**
 * Calculate hours deviation for an employee
 *
 * @param {Array<string>} shifts - Employee's shifts
 * @param {Object} employee - Employee data with contractHours
 * @param {Array<Object>} shiftTypes - Shift definitions with hours
 * @param {number} daysInMonth - Days in the period
 * @param {Object} weights - Optional penalty weights
 * @returns {{worked: number, expected: number, deviation: number, penalty: number}}
 */
export const calculateHoursDeviation = (shifts, employee, shiftTypes, daysInMonth, weights = {}) => {
  // Calculate actual worked hours
  const worked = shifts.reduce((total, shiftId) => {
    const shiftType = shiftTypes.find(s => s.id === shiftId || shiftMatches(shiftId, s.id));
    return total + (shiftType?.hours || 0);
  }, 0);

  // Calculate expected monthly hours from weekly contract
  const weeksInMonth = daysInMonth / 7;
  const expected = employee.contractHours * weeksInMonth;
  const deviation = worked - expected;

  // Asymmetric penalty: being under hours is worse for employees
  const HOURS_UNDER = weights.HOURS_UNDER ?? 15;
  const HOURS_OVER = weights.HOURS_OVER ?? 8;

  let penalty;
  if (deviation < 0) {
    penalty = Math.abs(deviation) * HOURS_UNDER;
  } else {
    penalty = deviation * HOURS_OVER;
  }

  return { worked, expected, deviation, penalty };
};

/**
 * Count deviations from the base matrix pattern
 *
 * @param {Array<string>} shifts - Employee's actual shifts
 * @param {Array<string>} baselineShifts - Expected shifts from matrix
 * @returns {number} Number of differences
 */
export const countMatrixDeviations = (shifts, baselineShifts) => {
  if (!shifts || !baselineShifts) return 0;

  let deviations = 0;
  const len = Math.min(shifts.length, baselineShifts.length);

  for (let i = 0; i < len; i++) {
    if (shifts[i] !== baselineShifts[i]) {
      deviations++;
    }
  }

  return deviations;
};

// ============================================
// UNIFIED VALIDATION
// ============================================

/**
 * Validate entire schedule and return structured result
 *
 * This is the main entry point for programmatic validation.
 * Returns raw counts and metrics (no weights applied to totals).
 *
 * @param {Object} schedule - { employeeId: shifts[] } OR { employeeId: { shifts: [] } }
 * @param {Object} context - Validation context
 * @param {Array<Object>} context.employees - Employee list
 * @param {Array<Object>} context.shiftTypes - Shift type definitions
 * @param {Array<Object>} context.constraints - Constraint definitions
 * @param {Array<Object>} context.coverageRules - Coverage rule definitions
 * @param {Object<string, Array<string>>} context.baselineShifts - Matrix-derived baseline (optional)
 * @param {number} context.daysInMonth - Number of days in the period
 * @param {Object} context.weights - Optional penalty weights for hours calculation
 * @returns {ValidationResult}
 */
export const validateSchedule = (schedule, context) => {
  const {
    employees = [],
    shiftTypes = [],
    constraints = [],
    coverageRules = [],
    baselineShifts = {},
    daysInMonth = 28,
    weights = {}
  } = context;

  // Normalize schedule to consistent format
  const normalizedSchedule = normalizeSchedule(schedule);

  const result = {
    isValid: true,
    violations: {
      constraint: 0,
      coverage: 0,
      exclusion: 0
    },
    metrics: {
      hoursDeviation: 0,
      hoursPenalty: 0,
      matrixDeviations: 0
    },
    byEmployee: [],
    coverageDetails: []
  };

  // Per-employee validation
  for (const emp of employees) {
    const shifts = normalizedSchedule[emp.id];
    if (!shifts || shifts.length === 0) continue;

    const constraintViolations = countConstraintViolations(shifts, constraints, shiftTypes);
    const exclusionViolations = countExclusionViolations(shifts, emp.excludedShifts);
    const hoursResult = calculateHoursDeviation(shifts, emp, shiftTypes, daysInMonth, weights);
    const matrixDevs = baselineShifts[emp.id]
      ? countMatrixDeviations(shifts, baselineShifts[emp.id])
      : 0;

    const empResult = {
      employeeId: emp.id,
      name: `${emp.surname || ''} ${emp.name || ''}`.trim() || emp.id,
      constraintViolations,
      exclusionViolations,
      hoursWorked: hoursResult.worked,
      hoursExpected: hoursResult.expected,
      hoursDeviation: hoursResult.deviation,
      hoursPenalty: hoursResult.penalty,
      matrixDeviations: matrixDevs
    };

    result.violations.constraint += constraintViolations;
    result.violations.exclusion += exclusionViolations;
    result.metrics.hoursDeviation += Math.abs(hoursResult.deviation);
    result.metrics.hoursPenalty += hoursResult.penalty;
    result.metrics.matrixDeviations += matrixDevs;
    result.byEmployee.push(empResult);
  }

  // Coverage validation
  for (let day = 0; day < daysInMonth; day++) {
    const coverage = checkDayCoverage(normalizedSchedule, day, coverageRules);
    result.violations.coverage += coverage.violations;
    if (coverage.violations > 0) {
      result.coverageDetails.push(...coverage.details);
    }
  }

  // Determine validity (hard constraints only)
  result.isValid = (
    result.violations.constraint === 0 &&
    result.violations.coverage === 0 &&
    result.violations.exclusion === 0
  );

  return result;
};

// ============================================
// UI-FRIENDLY EVALUATION (for human-readable warnings)
// ============================================

/**
 * Evaluate a generated schedule and return human-readable warnings
 *
 * This function is for UI consumption - it produces warnings with messages.
 * For programmatic access to violation counts, use validateSchedule().
 *
 * @param {Object} params
 * @param {Object} params.schedule - { [employeeId]: { shifts: string[], ... } }
 * @param {Array} params.employees - Employee list with id, name, surname, excludedShifts
 * @param {Array} params.shiftTypes - Shift type definitions
 * @param {Array} params.constraints - Constraint definitions
 * @param {Array} params.coverageRules - Coverage rule definitions
 * @param {number} params.daysInMonth - Number of days in the month
 * @returns {{warnings: Array<ScheduleWarning>, summary: Object}}
 */
export const evaluateSchedule = ({
  schedule,
  employees,
  shiftTypes,
  constraints,
  coverageRules,
  daysInMonth
}) => {
  if (!schedule || Object.keys(schedule).length === 0) {
    return { warnings: [], summary: { totalWarnings: 0, isValid: true } };
  }

  // Get structured validation results
  const validation = validateSchedule(schedule, {
    employees,
    shiftTypes,
    constraints,
    coverageRules,
    daysInMonth
  });

  const warnings = [];
  const normalizedSchedule = normalizeSchedule(schedule);

  // Format constraint violations as warnings
  for (const emp of employees) {
    const shifts = normalizedSchedule[emp.id];
    if (!shifts) continue;

    const empName = `${emp.surname || ''} ${emp.name || ''}`.trim() || emp.id;

    // Constraint warnings (get detailed errors for messages)
    const errors = getConstraintErrors(shifts, constraints, shiftTypes);
    for (const error of errors) {
      warnings.push({
        type: 'constraint',
        severity: 'error',
        day: error.day + 1, // Convert to 1-indexed
        employeeId: emp.id,
        employeeName: empName,
        constraintId: error.constraintId,
        message: `${empName}: ${error.message}`
      });
    }

    // Exclusion warnings
    const excludedShifts = emp.excludedShifts || [];
    if (excludedShifts.length > 0) {
      shifts.forEach((shift, day) => {
        const isExcluded = excludedShifts.some(excluded => shiftMatches(shift, excluded));
        if (isExcluded) {
          warnings.push({
            type: 'exclusion',
            severity: 'error',
            day: day + 1,
            employeeId: emp.id,
            employeeName: empName,
            constraintId: `exclusion_${emp.id}_${shift}`,
            message: `${empName}: turno ${shift} non consentito (giorno ${day + 1})`
          });
        }
      });
    }
  }

  // Coverage warnings
  for (const detail of validation.coverageDetails) {
    const shiftsStr = detail.shiftIds.join(' o ');
    const message = detail.type === 'under'
      ? `Giorno ${detail.day + 1}: mancano ${detail.deviation} coperture per ${shiftsStr} (richiesti: ${detail.required}, presenti: ${detail.actual})`
      : `Giorno ${detail.day + 1}: ${detail.deviation} coperture in eccesso per ${shiftsStr} (richiesti: ${detail.required}, presenti: ${detail.actual})`;

    warnings.push({
      type: 'coverage',
      severity: 'error',
      day: detail.day + 1,
      employeeId: null,
      employeeName: null,
      constraintId: detail.ruleId,
      message
    });
  }

  // Sort warnings by day, then by type
  warnings.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    const typeOrder = { exclusion: 0, constraint: 1, coverage: 2 };
    return (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0);
  });

  return {
    warnings,
    summary: {
      totalWarnings: warnings.length,
      constraintViolations: validation.violations.constraint,
      coverageViolations: validation.violations.coverage,
      exclusionViolations: validation.violations.exclusion,
      isValid: validation.isValid
    }
  };
};
