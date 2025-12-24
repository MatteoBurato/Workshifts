/**
 * Scheduling Module - Public API
 *
 * This module provides all scheduling-related functionality for Turni OSS.
 *
 * Main features:
 * - GA-based schedule optimization with constraint satisfaction
 * - Greedy fallback for quick generation
 * - Constraint validation
 * - Hours calculation
 *
 * Usage:
 * ```javascript
 * import { generateMonthlySchedule, generateDefaultMatrix } from './scheduling';
 *
 * const result = generateMonthlySchedule({
 *   year: 2025,
 *   month: 0,
 *   employees: [...],
 *   shiftTypes: [...],
 *   matrix: generateDefaultMatrix(),
 *   requirements: { M: 2, P: 2, N: 1 },
 *   constraints: [...],
 *   previousMonthSchedule: null,
 *   optimizerOptions: {
 *     useGA: true,            // Use Genetic Algorithm (default: true)
 *     greedyFallback: true,   // Fall back to greedy if GA fails (default: true)
 *     gaTimeoutMs: 60000,     // GA timeout in ms (default: 60000)
 *     gaPopulationSize: 50    // GA population size
 *   }
 * });
 *
 * console.log(result.schedule);       // The generated schedule
 * console.log(result.warnings);       // Any constraint violations or coverage issues
 * console.log(result.metadata.method); // 'ga' or 'greedy'
 * ```
 */

// Generator - main schedule generation
export {
  generateMonthlySchedule,
  regenerateWithModification,
  generateDefaultMatrix
} from './generator';

export { generateOptimalMatrix, DEFAULT_GA_CONFIG } from './matrixGenerator';

// Constraints - validation functions
export {
  validateSequenceWithConstraints,
  wouldViolateConstraints,
  getValidShiftsForPosition
} from './constraints';

// Evaluator - centralized constraint evaluation
export { evaluateSchedule } from './evaluator';

// Optimizer - assignment algorithms
export {
  // Main optimization API
  optimizeSchedule,
  solveWithGA,
  solveWithGreedy,

  // Greedy utilities
  findOptimalMatrixAssignment,
  calculateContinuityScore,
  calculateWorkerHours,
  analyzeAssignmentQuality
} from './optimizer';

// GA fitness weights - default values for optimization
export { WEIGHTS, DEFAULT_SCHEDULE_GA_CONFIG } from './ga/index';

// CSP module (removed)

