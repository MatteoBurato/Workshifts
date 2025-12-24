/**
 * Constraint validation for shift sequences
 *
 * This module handles validation of shift sequences against configurable constraints.
 * Supports 7 constraint types for controlling shift patterns.
 */

/**
 * @typedef {Object} Constraint
 * @property {string} id - Unique constraint identifier
 * @property {string} type - Constraint type (must_follow, cannot_follow, etc.)
 * @property {boolean} enabled - Whether constraint is active
 * @property {string} [shiftA] - First shift in pair constraints
 * @property {string} [shiftB] - Second shift in pair constraints
 * @property {string} [shift] - Single shift for consecutive constraints
 * @property {number} [days] - Number of days for gap/consecutive constraints
 */

/**
 * @typedef {Object} ConstraintError
 * @property {number} day - Day index where violation occurred
 * @property {string} message - Human-readable error message
 * @property {string} constraintId - ID of violated constraint
 */

/**
 * Check if a shift matches a target shift ID
 * Handles exact matches and prefix matches for shift variants
 *
 * @param {string} shift - Shift to check
 * @param {string} targetId - Target shift ID to match against
 * @returns {boolean} True if shift matches target
 */
const shiftMatches = (shift, targetId) => {
  if (!shift || !targetId) return false;
  // Exact match first, then prefix match for variants
  return shift === targetId || shift.startsWith(targetId + '_');
};

/**
 * Validate a sequence of shifts against all enabled constraints
 *
 * @param {Array<string>} shifts - Array of shift IDs for the period
 * @param {Array<Constraint>} constraints - Array of constraint definitions
 * @param {Array<Object>} shiftTypes - Array of valid shift type definitions
 * @returns {Array<ConstraintError>} Array of constraint violations
 */
export const validateSequenceWithConstraints = (shifts, constraints, shiftTypes) => {
  const errors = [];
  const activeConstraints = constraints.filter(c => c.enabled);
  const validShiftIds = shiftTypes.map(s => s.id);

  for (const constraint of activeConstraints) {
    switch (constraint.type) {
      case 'must_follow':
        // shiftA must be immediately followed by shiftB
        if (validShiftIds.includes(constraint.shiftA) && validShiftIds.includes(constraint.shiftB)) {
          for (let i = 0; i < shifts.length - 1; i++) {
            const current = shifts[i];
            const next = shifts[i + 1];
            if (shiftMatches(current, constraint.shiftA) && !shiftMatches(next, constraint.shiftB)) {
              errors.push({
                day: i,
                message: `${constraint.shiftA} deve essere seguito da ${constraint.shiftB} (giorno ${i + 1})`,
                constraintId: constraint.id
              });
            }
          }
        }
        break;

      case 'cannot_follow':
        // shiftA cannot be immediately followed by shiftB
        if (validShiftIds.includes(constraint.shiftA) && validShiftIds.includes(constraint.shiftB)) {
          for (let i = 0; i < shifts.length - 1; i++) {
            const current = shifts[i];
            const next = shifts[i + 1];
            if (shiftMatches(current, constraint.shiftA) && shiftMatches(next, constraint.shiftB)) {
              errors.push({
                day: i + 1,
                message: `${constraint.shiftA} non può essere seguito da ${constraint.shiftB} (giorno ${i + 2})`,
                constraintId: constraint.id
              });
            }
          }
        }
        break;

      case 'must_precede':
        // shiftB must be immediately preceded by shiftA
        if (validShiftIds.includes(constraint.shiftA) && validShiftIds.includes(constraint.shiftB)) {
          for (let i = 1; i < shifts.length; i++) {
            const current = shifts[i];
            const prev = shifts[i - 1];
            if (shiftMatches(current, constraint.shiftB) && !shiftMatches(prev, constraint.shiftA)) {
              errors.push({
                day: i,
                message: `${constraint.shiftB} deve essere preceduto da ${constraint.shiftA} (giorno ${i + 1})`,
                constraintId: constraint.id
              });
            }
          }
        }
        break;

      case 'cannot_precede':
        // shiftB cannot be immediately preceded by shiftA
        if (validShiftIds.includes(constraint.shiftA) && validShiftIds.includes(constraint.shiftB)) {
          for (let i = 1; i < shifts.length; i++) {
            const current = shifts[i];
            const prev = shifts[i - 1];
            if (shiftMatches(current, constraint.shiftB) && shiftMatches(prev, constraint.shiftA)) {
              errors.push({
                day: i,
                message: `${constraint.shiftB} non può essere preceduto da ${constraint.shiftA} (giorno ${i + 1})`,
                constraintId: constraint.id
              });
            }
          }
        }
        break;

      case 'max_consecutive_without':
        // Maximum N consecutive days without the specified shift
        if (validShiftIds.includes(constraint.shift)) {
          let consecutive = 0;
          for (let i = 0; i < shifts.length; i++) {
            const current = shifts[i];
            if (!shiftMatches(current, constraint.shift)) {
              consecutive++;
              if (consecutive > constraint.days) {
                errors.push({
                  day: i,
                  message: `Più di ${constraint.days} giorni consecutivi senza ${constraint.shift} (giorno ${i + 1})`,
                  constraintId: constraint.id
                });
              }
            } else {
              consecutive = 0;
            }
          }
        }
        break;

      case 'max_consecutive':
        // Shift cannot repeat more than N times consecutively
        if (validShiftIds.includes(constraint.shift)) {
          let consecutive = 0;
          for (let i = 0; i < shifts.length; i++) {
            const current = shifts[i];
            if (shiftMatches(current, constraint.shift)) {
              consecutive++;
              if (consecutive > constraint.days) {
                errors.push({
                  day: i,
                  message: `${constraint.shift} ripetuto più di ${constraint.days} volte consecutive (giorno ${i + 1})`,
                  constraintId: constraint.id
                });
              }
            } else {
              consecutive = 0;
            }
          }
        }
        break;

      case 'min_gap':
        // At least N days must pass between shiftA and shiftB
        if (validShiftIds.includes(constraint.shiftA) && validShiftIds.includes(constraint.shiftB)) {
          for (let i = 0; i < shifts.length; i++) {
            const current = shifts[i];
            if (shiftMatches(current, constraint.shiftA)) {
              // Check next N days for shiftB
              for (let j = 1; j <= constraint.days && i + j < shifts.length; j++) {
                const future = shifts[i + j];
                if (shiftMatches(future, constraint.shiftB)) {
                  errors.push({
                    day: i + j,
                    message: `Meno di ${constraint.days} giorni tra ${constraint.shiftA} e ${constraint.shiftB} (giorno ${i + j + 1})`,
                    constraintId: constraint.id
                  });
                }
              }
            }
          }
        }
        break;
    }
  }

  return errors;
};

/**
 * Check if assigning a specific shift would violate any constraints
 * Used for proactive constraint checking during schedule generation
 *
 * @param {Array<string>} existingShifts - Shifts already assigned (before the new one)
 * @param {string} newShift - The shift being considered for assignment
 * @param {Array<Constraint>} constraints - Active constraints
 * @param {Array<Object>} shiftTypes - Valid shift types
 * @returns {boolean} True if assignment would be valid
 */
export const wouldViolateConstraints = (existingShifts, newShift, constraints, shiftTypes) => {
  const testSequence = [...existingShifts, newShift];
  const errors = validateSequenceWithConstraints(testSequence, constraints, shiftTypes);
  // Only check errors that involve the newly added shift (last position)
  return errors.some(e => e.day === testSequence.length - 1 || e.day === testSequence.length - 2);
};

/**
 * Get valid shifts for a position given existing assignments and constraints
 *
 * @param {Array<string>} existingShifts - Shifts already assigned
 * @param {Array<Constraint>} constraints - Active constraints
 * @param {Array<Object>} shiftTypes - Available shift types
 * @returns {Array<string>} List of valid shift IDs for the next position
 */
export const getValidShiftsForPosition = (existingShifts, constraints, shiftTypes) => {
  return shiftTypes
    .map(st => st.id)
    .filter(shiftId => !wouldViolateConstraints(existingShifts, shiftId, constraints, shiftTypes));
};
