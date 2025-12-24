/**
 * Centralized Schedule Evaluator
 *
 * This module provides independent constraint validation for any generated schedule.
 * It checks sequence constraints, coverage rules, and employee exclusions.
 */

import { validateSequenceWithConstraints } from './constraints';

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
 * @typedef {Object} EvaluationResult
 * @property {Array<ScheduleWarning>} warnings - All detected violations
 * @property {Object} summary - Aggregated statistics
 */

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
 * Validate coverage requirements for all days
 *
 * @param {Object} schedule - Schedule by employee ID
 * @param {number} daysInMonth
 * @param {Array} coverageRules
 * @param {Array} shiftTypes
 * @returns {Array<ScheduleWarning>}
 */
const validateCoverage = (schedule, daysInMonth, coverageRules, shiftTypes) => {
  if (!coverageRules || !Array.isArray(coverageRules)) return [];

  const warnings = [];

  for (let day = 0; day < daysInMonth; day++) {
    // Count shifts for this day
    const dailyCounts = {};
    shiftTypes.forEach(st => { dailyCounts[st.id] = 0; });

    Object.values(schedule).forEach(empSchedule => {
      const shift = empSchedule.shifts?.[day];
      if (!shift) return;

      // Find matching base shift type
      const baseShift = shiftTypes.find(s => shiftMatches(shift, s.id));
      if (baseShift) {
        dailyCounts[baseShift.id] = (dailyCounts[baseShift.id] || 0) + 1;
      }
    });

    // Check each coverage rule
    coverageRules.forEach(rule => {
      if (rule.min <= 0) return;

      let actual = 0;
      for (const shiftId of rule.shiftIds) {
        actual += (dailyCounts[shiftId] || 0);
      }

      const shiftsStr = rule.shiftIds.join(' o ');

      if (actual < rule.min) {
        const missing = rule.min - actual;
        warnings.push({
          type: 'coverage',
          severity: 'error',
          day: day + 1,
          employeeId: null,
          employeeName: null,
          constraintId: rule.id,
          message: `Giorno ${day + 1}: mancano ${missing} coperture per ${shiftsStr} (richiesti: ${rule.min}, presenti: ${actual})`
        });
      } else if (actual > rule.min) {
        const excess = actual - rule.min;
        warnings.push({
          type: 'coverage',
          severity: 'error',
          day: day + 1,
          employeeId: null,
          employeeName: null,
          constraintId: rule.id,
          message: `Giorno ${day + 1}: ${excess} coperture in eccesso per ${shiftsStr} (richiesti: ${rule.min}, presenti: ${actual})`
        });
      }
    });
  }

  return warnings;
};

/**
 * Validate employee exclusions (shifts they're not allowed to work)
 *
 * @param {Object} schedule - Schedule by employee ID
 * @param {Array} employees
 * @param {number} daysInMonth
 * @returns {Array<ScheduleWarning>}
 */
const validateExclusions = (schedule, employees, daysInMonth) => {
  const warnings = [];

  for (const emp of employees) {
    if (!emp.excludedShifts || emp.excludedShifts.length === 0) continue;

    const empSchedule = schedule[emp.id];
    if (!empSchedule?.shifts) continue;

    const empName = `${emp.surname} ${emp.name}`;

    for (let day = 0; day < daysInMonth; day++) {
      const shift = empSchedule.shifts[day];
      if (!shift) continue;

      // Check if shift matches any excluded shift
      const isExcluded = emp.excludedShifts.some(excluded => shiftMatches(shift, excluded));

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
    }
  }

  return warnings;
};

/**
 * Validate sequence constraints for all employees
 *
 * @param {Object} schedule - Schedule by employee ID
 * @param {Array} employees
 * @param {Array} constraints
 * @param {Array} shiftTypes
 * @returns {Array<ScheduleWarning>}
 */
const validateSequences = (schedule, employees, constraints, shiftTypes) => {
  const warnings = [];

  for (const emp of employees) {
    const empSchedule = schedule[emp.id];
    if (!empSchedule?.shifts) continue;

    const empName = `${emp.surname} ${emp.name}`;

    // Use existing validation function
    const errors = validateSequenceWithConstraints(empSchedule.shifts, constraints, shiftTypes);

    // Transform to unified warning format
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
  }

  return warnings;
};

/**
 * Evaluate a generated schedule for all constraint violations
 *
 * @param {Object} params
 * @param {Object} params.schedule - The generated schedule { [employeeId]: { shifts: string[], ... } }
 * @param {Array} params.employees - Employee list with id, name, surname, excludedShifts
 * @param {Array} params.shiftTypes - Shift type definitions
 * @param {Array} params.constraints - Constraint definitions
 * @param {Array} params.coverageRules - Coverage rule definitions
 * @param {number} params.daysInMonth - Number of days in the month
 * @returns {EvaluationResult}
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

  // Collect all warnings
  const sequenceWarnings = validateSequences(schedule, employees, constraints, shiftTypes);
  const coverageWarnings = validateCoverage(schedule, daysInMonth, coverageRules, shiftTypes);
  const exclusionWarnings = validateExclusions(schedule, employees, daysInMonth);

  const allWarnings = [...sequenceWarnings, ...coverageWarnings, ...exclusionWarnings];

  // Sort warnings by day, then by type
  allWarnings.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    const typeOrder = { exclusion: 0, constraint: 1, coverage: 2 };
    return (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0);
  });

  return {
    warnings: allWarnings,
    summary: {
      totalWarnings: allWarnings.length,
      constraintViolations: sequenceWarnings.length,
      coverageViolations: coverageWarnings.length,
      exclusionViolations: exclusionWarnings.length,
      isValid: allWarnings.length === 0
    }
  };
};
