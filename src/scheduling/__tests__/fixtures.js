/**
 * Test fixtures for scheduling unit tests
 */

// Standard shift types used in Italian healthcare
export const shiftTypes = [
  { id: 'M', name: 'Mattina', hours: 7, color: '#22c55e' },
  { id: 'P', name: 'Pomeriggio', hours: 7, color: '#3b82f6' },
  { id: 'N', name: 'Notte', hours: 10, color: '#8b5cf6' },
  { id: 'SN', name: 'Smonto Notte', hours: 0, color: '#a855f7' },
  { id: 'RP', name: 'Riposo', hours: 0, color: '#6b7280' }
];

// Standard constraints
export const constraints = [
  {
    id: 'c1',
    type: 'must_follow',
    shiftA: 'N',
    shiftB: 'SN',
    enabled: true
  },
  {
    id: 'c2',
    type: 'must_follow',
    shiftA: 'SN',
    shiftB: 'RP',
    enabled: true
  },
  {
    id: 'c3',
    type: 'cannot_follow',
    shiftA: 'N',
    shiftB: 'M',
    enabled: true
  },
  {
    id: 'c4',
    type: 'max_consecutive',
    shift: 'N',
    days: 2,
    enabled: true
  }
];

// Coverage rules (uses shiftIds, not shiftTypes)
export const coverageRules = [
  { id: 'r1', name: 'Morning', shiftIds: ['M'], min: 2, enabled: true },
  { id: 'r2', name: 'Afternoon', shiftIds: ['P'], min: 2, enabled: true },
  { id: 'r3', name: 'Night', shiftIds: ['N'], min: 1, enabled: true }
];

// Sample employees (6 for matrix 1, 2 for matrix 2)
export const employees = [
  { id: 'emp1', name: 'Employee 1', contractHours: 36, matrixId: 'matrix1' },
  { id: 'emp2', name: 'Employee 2', contractHours: 36, matrixId: 'matrix1' },
  { id: 'emp3', name: 'Employee 3', contractHours: 36, matrixId: 'matrix1' },
  { id: 'emp4', name: 'Employee 4', contractHours: 36, matrixId: 'matrix1' },
  { id: 'emp5', name: 'Employee 5', contractHours: 36, matrixId: 'matrix1' },
  { id: 'emp6', name: 'Employee 6', contractHours: 36, matrixId: 'matrix1' },
  { id: 'emp7', name: 'Employee 7', contractHours: 36, matrixId: 'matrix2' },
  { id: 'emp8', name: 'Employee 8', contractHours: 36, matrixId: 'matrix2' }
];

// 6x7 matrix for first 6 employees
export const matrix6x7 = [
  ['M', 'P', 'N', 'SN', 'RP', 'M', 'P'],
  ['P', 'N', 'SN', 'RP', 'M', 'P', 'P'],
  ['N', 'SN', 'RP', 'M', 'P', 'N', 'SN'],
  ['SN', 'RP', 'M', 'P', 'N', 'SN', 'RP'],
  ['RP', 'M', 'P', 'N', 'SN', 'RP', 'M'],
  ['M', 'P', 'P', 'N', 'SN', 'RP', 'M']
];

// 2x7 matrix for last 2 employees
export const matrix2x7 = [
  ['M', 'P', 'N', 'SN', 'RP', 'M', 'P'],
  ['P', 'N', 'SN', 'RP', 'M', 'P', 'M']
];

// Combined matrices structure
export const allMatrices = [
  { id: 'matrix1', name: 'Matrix 1', rows: matrix6x7 },
  { id: 'matrix2', name: 'Matrix 2', rows: matrix2x7 }
];

// Matrix map for quick lookup
export const matrixMap = {
  matrix1: matrix6x7,
  matrix2: matrix2x7
};

// Valid shift sequence (follows N->SN->RP pattern)
export const validShiftSequence = ['M', 'P', 'N', 'SN', 'RP', 'M', 'P'];

// Invalid shift sequence (N followed by M, violates cannot_follow)
export const invalidShiftSequence = ['M', 'P', 'N', 'M', 'P', 'M', 'P'];

// Generate a simple 28-day schedule for testing
export const generateSimpleSchedule = (employees, pattern = validShiftSequence) => {
  const schedule = {};
  for (const emp of employees) {
    schedule[emp.id] = [];
    for (let day = 0; day < 28; day++) {
      schedule[emp.id].push(pattern[day % pattern.length]);
    }
  }
  return schedule;
};

// Create a chromosome for GA testing
export const createTestChromosome = (employees, schedule) => ({
  schedule
});

// Default test context for fitness evaluation
export const createFitnessContext = (overrides = {}) => ({
  employees,
  shiftTypes,
  constraints,
  coverageRules,
  baselineShifts: generateSimpleSchedule(employees),
  daysInMonth: 28,
  ...overrides
});

// Default context for matrix generation
export const createMatrixContext = (overrides = {}) => ({
  shiftTypes,
  constraints,
  coverageRules,
  employees,
  year: 2024,
  month: 1,
  allMatrices,
  matrixMap,
  ...overrides
});
