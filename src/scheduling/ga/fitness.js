/**
 * Genetic Algorithm Fitness Evaluation
 *
 * Evaluates schedule quality based on:
 * 1. Hard constraint violations (heavily penalized)
 * 2. Hours deviation from contract (soft constraint)
 * 3. Deviations from base matrix pattern (soft constraint)
 */

import { validateSequenceWithConstraints } from '../constraints.js';

// Fitness weights - lower total score is better
const WEIGHTS = {
  CONSTRAINT_VIOLATION: 10000,  // Per violation - makes constraints effectively "hard"
  COVERAGE_VIOLATION: 10000,     // Per missing shift in coverage
  HOURS_UNDER: 15,              // Per hour under contract (asymmetric - worse)
  HOURS_OVER: 8,                // Per hour over contract
  MATRIX_CHANGE: 3              // Per shift different from matrix
};

/**
 * Count constraint violations in an employee's shift sequence
 *
 * @param {Array<string>} shifts - Employee's shifts for the month
 * @param {Array<Object>} constraints - Constraint definitions
 * @param {Array<Object>} shiftTypes - Shift type definitions
 * @returns {number} Number of violations
 */
export const countConstraintViolations = (shifts, constraints, shiftTypes) => {
  const errors = validateSequenceWithConstraints(shifts, constraints, shiftTypes);
  return errors.length;
};

/**
 * Calculate hours deviation for an employee
 *
 * @param {Array<string>} shifts - Employee's shifts
 * @param {Object} employee - Employee data with contractHours
 * @param {Array<Object>} shiftTypes - Shift definitions with hours
 * @param {number} daysInMonth - Days in the month
 * @param {Object} weights - Optimization weights
 * @returns {{worked: number, expected: number, deviation: number, penalty: number}}
 */
export const calculateHoursDeviation = (shifts, employee, shiftTypes, daysInMonth, weights = WEIGHTS) => {
  // Calculate actual worked hours
  const worked = shifts.reduce((total, shiftId) => {
    const shiftType = shiftTypes.find(s => s.id === shiftId);
    return total + (shiftType?.hours || 0);
  }, 0);

  // Calculate expected monthly hours from weekly contract
  const weeksInMonth = daysInMonth / 7;
  const expected = employee.contractHours * weeksInMonth;

  const deviation = worked - expected;

  // Asymmetric penalty: being under hours is worse for employees
  let penalty;
  if (deviation < 0) {
    penalty = Math.abs(deviation) * (weights.HOURS_UNDER || WEIGHTS.HOURS_UNDER);
  } else {
    penalty = deviation * (weights.HOURS_OVER || WEIGHTS.HOURS_OVER);
  }

  return { worked, expected, deviation, penalty };
};

/**
 * Count coverage violations for a day
 *
 * Coverage is treated as an EXACT constraint: there must be exactly
 * rule.min shifts of the specified type(s). Both under-coverage and
 * over-coverage are penalized.
 *
 * @param {Object<string, Array<string>>} scheduleByEmployee - Schedule indexed by employee ID
 * @param {number} day - Day index
 * @param {Array<Object>} coverageRules - List of coverage rules
 * @returns {{violations: number, details: Array}}
 */
export const checkDayCoverage = (scheduleByEmployee, day, coverageRules) => {
  if (!coverageRules || !Array.isArray(coverageRules)) return { violations: 0, details: [] };

  // Count shifts for this day
  const counts = {};
  for (const shifts of Object.values(scheduleByEmployee)) {
    const shift = shifts[day];
    counts[shift] = (counts[shift] || 0) + 1;
  }

  let violations = 0;
  const details = [];

  for (const rule of coverageRules) {
    if (rule.min <= 0) continue;

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
 * Count deviations from the base matrix pattern
 *
 * @param {Array<string>} shifts - Employee's actual shifts
 * @param {Array<string>} matrixShifts - Expected shifts from matrix
 * @returns {number} Number of differences
 */
export const countMatrixDeviations = (shifts, matrixShifts) => {
  let deviations = 0;
  const len = Math.min(shifts.length, matrixShifts.length);

  for (let i = 0; i < len; i++) {
    if (shifts[i] !== matrixShifts[i]) {
      deviations++;
    }
  }

  return deviations;
};

/**
 * Evaluate complete fitness of a schedule
 *
 * @param {Object} chromosome - Schedule chromosome
 * @param {Object} chromosome.schedule - Map of employeeId -> shifts array
 * @param {Object} context - Evaluation context
 * @param {Array<Object>} context.employees
 * @param {Array<Object>} context.shiftTypes
 * @param {Array<Object>} context.constraints
 * @param {Array<Object>} context.coverageRules
 * @param {Object<string, Array<string>>} context.baselineShifts - Matrix-derived baseline
 * @param {number} context.daysInMonth
 * @param {Object} context.weights - Custom weights
 * @returns {Object} Fitness evaluation result
 */
export const evaluateFitness = (chromosome, context) => {
  const { employees, shiftTypes, constraints, coverageRules, baselineShifts, daysInMonth } = context;
  const weights = { ...WEIGHTS, ...(context.weights || {}) };

  let totalConstraintViolations = 0;
  let totalCoverageViolations = 0;
  let totalHoursPenalty = 0;
  let totalMatrixDeviations = 0;

  const employeeDetails = [];

  // Evaluate per-employee metrics
  for (const emp of employees) {
    const shifts = chromosome.schedule[emp.id];
    if (!shifts) continue;

    // Constraint violations
    const violations = countConstraintViolations(shifts, constraints, shiftTypes);
    totalConstraintViolations += violations;

    // Hours deviation
    const hours = calculateHoursDeviation(shifts, emp, shiftTypes, daysInMonth, weights);
    totalHoursPenalty += hours.penalty;

    // Matrix deviations
    const baseline = baselineShifts[emp.id] || [];
    const matrixDev = countMatrixDeviations(shifts, baseline);
    totalMatrixDeviations += matrixDev;

    employeeDetails.push({
      employeeId: emp.id,
      name: `${emp.surname} ${emp.name}`,
      violations,
      hoursWorked: hours.worked,
      hoursExpected: hours.expected,
      hoursDeviation: hours.deviation,
      matrixDeviations: matrixDev
    });
  }

  // Evaluate coverage for each day
  const coverageDetails = [];
  for (let day = 0; day < daysInMonth; day++) {
    const coverage = checkDayCoverage(chromosome.schedule, day, coverageRules);
    totalCoverageViolations += coverage.violations;
    if (coverage.violations > 0) {
      coverageDetails.push(...coverage.details);
    }
  }

  // Calculate total fitness score (lower is better)
  const constraintPenalty = totalConstraintViolations * weights.CONSTRAINT_VIOLATION;
  const coveragePenalty = totalCoverageViolations * weights.COVERAGE_VIOLATION;
  const matrixPenalty = totalMatrixDeviations * weights.MATRIX_CHANGE;

  const totalFitness = constraintPenalty + coveragePenalty + totalHoursPenalty + matrixPenalty;

  return {
    fitness: totalFitness,
    isValid: totalConstraintViolations === 0 && totalCoverageViolations === 0,
    components: {
      constraintViolations: totalConstraintViolations,
      constraintPenalty,
      coverageViolations: totalCoverageViolations,
      coveragePenalty,
      hoursPenalty: totalHoursPenalty,
      matrixDeviations: totalMatrixDeviations,
      matrixPenalty
    },
    employeeDetails,
    coverageDetails
  };
};

/**
 * Quick fitness check - just returns the score without details
 * Used during evolution for performance
 *
 * @param {Object} chromosome
 * @param {Object} context
 * @returns {number} Fitness score
 */
export const quickFitness = (chromosome, context) => {
  return evaluateFitness(chromosome, context).fitness;
};

export { WEIGHTS };
