/**
 * Genetic Algorithm Fitness Evaluation
 *
 * This module applies weights to validation results for GA optimization.
 * All actual validation logic is delegated to evaluator.js (single source of truth).
 */

import {
  validateSchedule,
  countConstraintViolations,
  calculateHoursDeviation,
  countMatrixDeviations,
  checkDayCoverage
} from '../evaluator.js';

// Fitness weights - lower total score is better
const WEIGHTS = {
  CONSTRAINT_VIOLATION: 10000,  // Per violation - makes constraints effectively "hard"
  COVERAGE_VIOLATION: 10000,    // Per missing shift in coverage
  EXCLUSION_VIOLATION: 10000,   // Per excluded shift assigned to employee
  HOURS_UNDER: 15,              // Per hour under contract (asymmetric - worse)
  HOURS_OVER: 8,                // Per hour over contract
  MATRIX_CHANGE: 3              // Per shift different from matrix
};

/**
 * Evaluate fitness of a schedule for GA optimization
 *
 * @param {Object} chromosome - { schedule: { empId: shifts[] } }
 * @param {Object} context - Evaluation context
 * @param {Array<Object>} context.employees
 * @param {Array<Object>} context.shiftTypes
 * @param {Array<Object>} context.constraints
 * @param {Array<Object>} context.coverageRules
 * @param {Object<string, Array<string>>} context.baselineShifts - Matrix-derived baseline
 * @param {number} context.daysInMonth
 * @param {Object} context.weights - Custom weights (optional)
 * @returns {Object} Fitness evaluation result
 */
export const evaluateFitness = (chromosome, context) => {
  const weights = { ...WEIGHTS, ...(context.weights || {}) };

  // Delegate validation to evaluator.js (single source of truth)
  const validation = validateSchedule(chromosome.schedule, {
    employees: context.employees,
    shiftTypes: context.shiftTypes,
    constraints: context.constraints,
    coverageRules: context.coverageRules,
    baselineShifts: context.baselineShifts,
    daysInMonth: context.daysInMonth,
    weights // Pass weights for hours penalty calculation
  });

  // Apply weights to calculate fitness score
  const constraintPenalty = validation.violations.constraint * weights.CONSTRAINT_VIOLATION;
  const coveragePenalty = validation.violations.coverage * weights.COVERAGE_VIOLATION;
  const exclusionPenalty = validation.violations.exclusion * weights.EXCLUSION_VIOLATION;
  const hoursPenalty = validation.metrics.hoursPenalty;
  const matrixPenalty = validation.metrics.matrixDeviations * weights.MATRIX_CHANGE;

  const totalFitness = constraintPenalty + coveragePenalty + exclusionPenalty + hoursPenalty + matrixPenalty;

  // Map byEmployee to employeeDetails format expected by existing code
  const employeeDetails = validation.byEmployee.map(emp => ({
    employeeId: emp.employeeId,
    name: emp.name,
    violations: emp.constraintViolations,
    exclusionViolations: emp.exclusionViolations,
    hoursWorked: emp.hoursWorked,
    hoursExpected: emp.hoursExpected,
    hoursDeviation: emp.hoursDeviation,
    matrixDeviations: emp.matrixDeviations
  }));

  return {
    fitness: totalFitness,
    isValid: validation.isValid,
    components: {
      constraintViolations: validation.violations.constraint,
      constraintPenalty,
      coverageViolations: validation.violations.coverage,
      coveragePenalty,
      exclusionViolations: validation.violations.exclusion,
      exclusionPenalty,
      hoursPenalty,
      matrixDeviations: validation.metrics.matrixDeviations,
      matrixPenalty
    },
    employeeDetails,
    coverageDetails: validation.coverageDetails
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

// Re-export core functions from evaluator.js for backwards compatibility
// These allow existing imports like `import { countConstraintViolations } from './ga/fitness.js'`
// to continue working, but the actual implementation is in evaluator.js
export {
  countConstraintViolations,
  calculateHoursDeviation,
  countMatrixDeviations,
  checkDayCoverage,
  WEIGHTS
};
