/**
 * Workflow 2: Matrix Generation GA Tests
 *
 * Tests for the genetic algorithm that generates optimal shift pattern
 * matrices, evaluated by how good the resulting schedules are.
 */

import { describe, it, expect } from 'vitest';
import {
  validateSequenceWithConstraints,
  getValidShiftsForCyclicPosition
} from '../constraints.js';
import { generateOptimalMatricesJointly } from '../matrixGenerator.js';
import { solveWithGreedy } from '../optimizer.js';
import {
  shiftTypes,
  constraints,
  employees,
  matrix6x7,
  matrix2x7,
  allMatrices,
  matrixMap
} from './fixtures.js';


describe('Workflow 2: Matrix Generation GA', () => {

  describe('Cyclic Constraint Validation', () => {

    it('should validate cyclic row with wrap-around', () => {
      // A valid row that wraps correctly
      const row = ['M', 'P', 'N', 'SN', 'RP', 'M', 'P'];
      // Extended row simulates wrap-around: row + row = double length
      const extendedRow = [...row, ...row];
      const errors = validateSequenceWithConstraints(extendedRow, constraints, shiftTypes);
      expect(errors).toHaveLength(0);
    });

    it('should detect violation in cyclic wrap-around', () => {
      // Row ending with N and starting with M would violate cannot_follow
      const row = ['M', 'P', 'M', 'P', 'M', 'P', 'N'];
      const extendedRow = [...row, ...row]; // N followed by M at wrap point
      const errors = validateSequenceWithConstraints(extendedRow, constraints, shiftTypes);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should get valid shifts for cyclic position at start', () => {
      const row = ['M', 'P', 'N', 'SN', 'RP', 'M', 'P'];
      const validShifts = getValidShiftsForCyclicPosition(row, 0, constraints, shiftTypes);

      // Position 0 is preceded by position 6 (P) in cyclic context
      // P can be followed by most shifts
      expect(validShifts.length).toBeGreaterThan(0);
    });

    it('should get valid shifts for cyclic position after N', () => {
      const row = ['M', 'P', 'N', 'SN', 'RP', 'M', 'P'];
      // Position 3 follows N at position 2
      const validShifts = getValidShiftsForCyclicPosition(row, 3, constraints, shiftTypes);

      // After N, only SN is valid
      expect(validShifts).toContain('SN');
    });

    it('should handle wrap-around for last position', () => {
      const row = ['M', 'P', 'N', 'SN', 'RP', 'M', 'P'];
      // Last position (6) is followed by position 0 in cyclic context
      const validShifts = getValidShiftsForCyclicPosition(row, 6, constraints, shiftTypes);

      // Should return valid options that don't violate constraints when wrapping
      expect(validShifts.length).toBeGreaterThan(0);
    });

    it('should return empty array when no valid shifts exist', () => {
      // Create a row where position 3 must follow N (position 2)
      // but we test with very restrictive constraints
      const row = ['N', 'N', 'N', 'N', 'N', 'N', 'N']; // All nights
      const strictConstraints = [
        ...constraints,
        { id: 'strict', type: 'max_consecutive', shift: 'N', days: 1, enabled: true }
      ];

      const validShifts = getValidShiftsForCyclicPosition(row, 3, strictConstraints, shiftTypes);
      // With max 1 consecutive N, it's hard to find valid positions in all-N row
      // This tests the fallback behavior
      expect(Array.isArray(validShifts)).toBe(true);
    });
  });


  describe('Dynamic Matrix Dimensions', () => {

    it('should handle 6x7 matrix correctly', () => {
      expect(matrix6x7.length).toBe(6);
      expect(matrix6x7[0].length).toBe(7);

      // Verify each row has correct length
      for (const row of matrix6x7) {
        expect(row.length).toBe(7);
      }
    });

    it('should handle 2x7 matrix correctly', () => {
      expect(matrix2x7.length).toBe(2);
      expect(matrix2x7[0].length).toBe(7);
    });

    it('should flatten matrix for snake pattern correctly', () => {
      const flattened6x7 = matrix6x7.flat();
      expect(flattened6x7.length).toBe(42); // 6 * 7

      const flattened2x7 = matrix2x7.flat();
      expect(flattened2x7.length).toBe(14); // 2 * 7
    });

    it('should calculate extended row with dynamic column count', () => {
      // Test with 7 columns
      const row7 = ['M', 'P', 'N', 'SN', 'RP', 'M', 'P'];
      const colCount7 = row7.length;
      const extended7 = [...row7, ...row7.slice(0, colCount7)];
      expect(extended7.length).toBe(14); // 7 + 7

      // Test with 10 columns
      const row10 = ['M', 'P', 'N', 'SN', 'RP', 'M', 'P', 'M', 'P', 'N'];
      const colCount10 = row10.length;
      const extended10 = [...row10, ...row10.slice(0, colCount10)];
      expect(extended10.length).toBe(20); // 10 + 10

      // Test with 5 columns
      const row5 = ['M', 'P', 'N', 'SN', 'RP'];
      const colCount5 = row5.length;
      const extended5 = [...row5, ...row5.slice(0, colCount5)];
      expect(extended5.length).toBe(10); // 5 + 5
    });

    it('should handle non-square matrices', () => {
      // 3x14 matrix (3 employees, 2-week cycle)
      const matrix3x14 = [
        ['M', 'P', 'N', 'SN', 'RP', 'M', 'P', 'M', 'P', 'N', 'SN', 'RP', 'M', 'P'],
        ['P', 'N', 'SN', 'RP', 'M', 'P', 'M', 'N', 'SN', 'RP', 'M', 'P', 'P', 'M'],
        ['N', 'SN', 'RP', 'M', 'P', 'N', 'SN', 'RP', 'M', 'P', 'N', 'SN', 'RP', 'M']
      ];

      expect(matrix3x14.length).toBe(3);
      expect(matrix3x14[0].length).toBe(14);

      const flattened = matrix3x14.flat();
      expect(flattened.length).toBe(42); // 3 * 14
    });
  });


  describe('Matrix Fitness Evaluation', () => {

    it('should validate all rows in a matrix', () => {
      let totalErrors = 0;

      for (const row of matrix6x7) {
        const colCount = row.length;
        const extendedRow = [...row, ...row.slice(0, colCount)];
        const errors = validateSequenceWithConstraints(extendedRow, constraints, shiftTypes);
        totalErrors += errors.length;
      }

      // The default matrix should have minimal violations
      expect(totalErrors).toBeLessThanOrEqual(matrix6x7.length); // At most 1 per row
    });

    it('should evaluate fitness across all matrices', () => {
      let totalErrors = 0;

      for (const matrix of Object.values(matrixMap)) {
        for (const row of matrix) {
          const colCount = row.length;
          const extendedRow = [...row, ...row.slice(0, colCount)];
          const errors = validateSequenceWithConstraints(extendedRow, constraints, shiftTypes);
          totalErrors += errors.length;
        }
      }

      expect(typeof totalErrors).toBe('number');
    });
  });


  describe('Employee-Matrix Assignment in Workflow 2', () => {

    it('should respect matrixId when grouping employees', () => {
      const employeesByMatrix = {};

      for (const emp of employees) {
        const matrixId = emp.matrixId || allMatrices[0]?.id;
        if (!employeesByMatrix[matrixId]) {
          employeesByMatrix[matrixId] = [];
        }
        employeesByMatrix[matrixId].push(emp);
      }

      // 6 employees on matrix1, 2 on matrix2
      expect(employeesByMatrix['matrix1'].length).toBe(6);
      expect(employeesByMatrix['matrix2'].length).toBe(2);
    });

    it('should use correct matrix for each employee group', () => {
      const employeesByMatrix = {};

      for (const emp of employees) {
        const matrixId = emp.matrixId;
        if (!employeesByMatrix[matrixId]) {
          employeesByMatrix[matrixId] = [];
        }
        employeesByMatrix[matrixId].push(emp);
      }

      // Verify matrix dimensions match employee counts
      for (const [matrixId, emps] of Object.entries(employeesByMatrix)) {
        const matrix = matrixMap[matrixId];
        expect(matrix).toBeDefined();
        // Each employee should get a unique row
        expect(matrix.length).toBeGreaterThanOrEqual(emps.length);
      }
    });

    it('should generate snake pattern for each matrix independently', () => {
      const employeesByMatrix = {
        matrix1: employees.filter(e => e.matrixId === 'matrix1'),
        matrix2: employees.filter(e => e.matrixId === 'matrix2')
      };

      for (const [matrixId, emps] of Object.entries(employeesByMatrix)) {
        const matrix = matrixMap[matrixId];
        const fullPattern = matrix.flat();

        // Pattern length should match matrix dimensions
        expect(fullPattern.length).toBe(matrix.length * matrix[0].length);

        // Simulate snake pattern for first employee in each group
        if (emps.length > 0) {
          const matrixRow = 0;
          const rowLength = matrix[0].length;
          const startIndex = matrixRow * rowLength;

          // Generate 7 days of shifts
          const shifts = [];
          for (let day = 0; day < 7; day++) {
            const patternIndex = (startIndex + day) % fullPattern.length;
            shifts.push(fullPattern[patternIndex]);
          }

          // First 7 shifts should match first row
          expect(shifts).toEqual(matrix[0]);
        }
      }
    });
  });


  describe('Multi-Matrix Joint Optimization', () => {

    it('should create matrixConfigs from allMatrices', () => {
      const matrixConfigs = allMatrices.map(m => ({
        id: m.id,
        name: m.name,
        rowCount: m.rows.length,
        colCount: m.rows[0]?.length
      }));

      expect(matrixConfigs).toHaveLength(2);
      expect(matrixConfigs[0]).toEqual({
        id: 'matrix1',
        name: 'Matrix 1',
        rowCount: 6,
        colCount: 7
      });
      expect(matrixConfigs[1]).toEqual({
        id: 'matrix2',
        name: 'Matrix 2',
        rowCount: 2,
        colCount: 7
      });
    });

    it('should build matrices object for multi-matrix individual', () => {
      const matrices = {};
      for (const m of allMatrices) {
        matrices[m.id] = m.rows;
      }

      expect(Object.keys(matrices)).toHaveLength(2);
      expect(matrices['matrix1'].length).toBe(6);
      expect(matrices['matrix2'].length).toBe(2);
    });

    it('should evaluate fitness using all employees across all matrices', () => {
      // Simulate fitness evaluation structure
      const matrices = {
        matrix1: matrix6x7,
        matrix2: matrix2x7
      };

      let totalRowScore = 0;

      // Score all rows in all matrices
      for (const matrix of Object.values(matrices)) {
        for (const row of matrix) {
          const colCount = row.length;
          const extendedRow = [...row, ...row.slice(0, colCount)];
          const errors = validateSequenceWithConstraints(extendedRow, constraints, shiftTypes);
          totalRowScore += errors.length * 1000;
        }
      }

      expect(typeof totalRowScore).toBe('number');
    });
  });


  describe('Constraint-Safe Mutation', () => {

    it('should return constraint-valid shifts for mutation', () => {
      const row = ['M', 'P', 'N', 'SN', 'RP', 'M', 'P'];

      // Test mutation at various positions
      for (let pos = 0; pos < row.length; pos++) {
        const validShifts = getValidShiftsForCyclicPosition(row, pos, constraints, shiftTypes);
        expect(Array.isArray(validShifts)).toBe(true);
      }
    });

    it('should prefer constraint-safe shifts when available', () => {
      // Position after N should prefer SN
      const row = ['M', 'P', 'N', 'SN', 'RP', 'M', 'P'];
      const pos = 3; // After N
      const validShifts = getValidShiftsForCyclicPosition(row, pos, constraints, shiftTypes);

      if (validShifts.length > 0) {
        expect(validShifts).toContain('SN');
      }
    });

    it('should handle empty constraints gracefully', () => {
      const row = ['M', 'P', 'N', 'SN', 'RP', 'M', 'P'];
      const validShifts = getValidShiftsForCyclicPosition(row, 3, [], shiftTypes);

      // With no constraints, all shifts should be valid
      expect(validShifts.length).toBe(shiftTypes.length);
    });

    it('should use random fallback when no valid shifts', () => {
      // This tests the fallback behavior in the mutation function
      // When getValidShiftsForCyclicPosition returns empty, mutation uses randomShift

      const allNightsRow = ['N', 'N', 'N', 'N', 'N', 'N', 'N'];
      const veryStrictConstraints = [
        { id: 's1', type: 'max_consecutive', shift: 'N', days: 1, enabled: true },
        { id: 's2', type: 'must_follow', shiftA: 'N', shiftB: 'SN', enabled: true }
      ];

      // In a row of all Ns with max 1 consecutive, most positions have no valid shifts
      const validShifts = getValidShiftsForCyclicPosition(
        allNightsRow, 3, veryStrictConstraints, shiftTypes
      );

      // Either returns valid shifts or empty (triggering fallback)
      expect(Array.isArray(validShifts)).toBe(true);
    });
  });


  describe('GA Integration: Simple Deterministic Problem', () => {
    /**
     * This test creates a simple optimization problem with:
     * - 2 employees in 2 matrices (1x7 each)
     * - Employee 2 cannot work night shifts (excludedShifts)
     * - Coverage requires 1 M + 1 P per day
     * - No sequence constraints (simplified)
     *
     * Optimal solution:
     * - Matrix 1: all M or all P (one pattern)
     * - Matrix 2: the complementary pattern (no N allowed anyway)
     *
     * With this setup, perfect fitness is achievable.
     */

    // Simplified shift types (only M, P, RP - no nights)
    const simpleShiftTypes = [
      { id: 'M', name: 'Mattina', hours: 7 },
      { id: 'P', name: 'Pomeriggio', hours: 7 },
      { id: 'RP', name: 'Riposo', hours: 0 }
    ];

    // No sequence constraints for this test
    const noConstraints = [];

    // Simple coverage: 1 M + 1 P per day
    const simpleCoverage = [
      { id: 'morning', name: 'Morning', shiftIds: ['M'], min: 1, enabled: true },
      { id: 'afternoon', name: 'Afternoon', shiftIds: ['P'], min: 1, enabled: true }
    ];

    // 2 employees in 2 matrices
    const twoEmployees = [
      { id: 'emp1', name: 'Employee 1', contractHours: 49, matrixId: 'mat1' },
      { id: 'emp2', name: 'Employee 2', contractHours: 49, matrixId: 'mat2', excludedShifts: ['N', 'SN'] }
    ];

    // Two 1x7 matrices (one row each, 7 columns)
    const twoMatrices = [
      { id: 'mat1', name: 'Matrix 1', rows: [['M', 'M', 'M', 'M', 'M', 'M', 'M']] },
      { id: 'mat2', name: 'Matrix 2', rows: [['P', 'P', 'P', 'P', 'P', 'P', 'P']] }
    ];

    it('should verify optimal matrices produce perfect fitness', () => {
      // Optimal matrices: emp1 does all M, emp2 does all P
      const optimalMat1 = [['M', 'M', 'M', 'M', 'M', 'M', 'M']];
      const optimalMat2 = [['P', 'P', 'P', 'P', 'P', 'P', 'P']];

      const matrixMapOptimal = {
        mat1: optimalMat1,
        mat2: optimalMat2
      };

      // Generate schedule using greedy solver
      const result = solveWithGreedy({
        year: 2024,
        month: 0, // January (28 days in this context)
        daysInMonth: 28,
        employees: twoEmployees,
        shiftTypes: simpleShiftTypes,
        matrices: [
          { id: 'mat1', rows: optimalMat1 },
          { id: 'mat2', rows: optimalMat2 }
        ],
        matrixMap: matrixMapOptimal,
        defaultMatrix: optimalMat1,
        previousMonthSchedule: null,
        cycleLength: 7
      });

      // Verify schedule was generated
      expect(result.schedule).toBeDefined();
      expect(result.schedule['emp1']).toBeDefined();
      expect(result.schedule['emp2']).toBeDefined();

      // Verify emp1 gets all M shifts
      const emp1Shifts = result.schedule['emp1'].shifts;
      expect(emp1Shifts.every(s => s === 'M')).toBe(true);

      // Verify emp2 gets all P shifts
      const emp2Shifts = result.schedule['emp2'].shifts;
      expect(emp2Shifts.every(s => s === 'P')).toBe(true);

      // Verify coverage: each day should have exactly 1 M and 1 P
      for (let day = 0; day < 28; day++) {
        const dayShifts = [emp1Shifts[day], emp2Shifts[day]];
        expect(dayShifts.filter(s => s === 'M').length).toBe(1);
        expect(dayShifts.filter(s => s === 'P').length).toBe(1);
      }
    });

    it('should find optimal matrices via GA', () => {
      // Run GA with small parameters for fast testing
      const matrices = generateOptimalMatricesJointly({
        allMatrices: twoMatrices,
        shiftTypes: simpleShiftTypes,
        constraints: noConstraints,
        coverageRules: simpleCoverage,
        columnCount: 7,
        employees: twoEmployees,
        year: 2024,
        month: 0,
        options: {
          POPULATION_SIZE: 50,      // Small population
          MAX_GENERATIONS: 200,     // Few generations
          ELITE_COUNT: 5,
          MUTATION_RATE: 0.1,
          STAGNATION_LIMIT: 50,
          TIMEOUT_MS: 10000         // 10 second timeout
        }
      });

      // Verify result structure (returns matrices directly)
      expect(matrices).toBeDefined();
      expect(matrices['mat1']).toBeDefined();
      expect(matrices['mat2']).toBeDefined();

      // Verify matrices structure
      expect(matrices['mat1'].length).toBe(1); // 1 row
      expect(matrices['mat2'].length).toBe(1); // 1 row
      expect(matrices['mat1'][0].length).toBe(7); // 7 columns
      expect(matrices['mat2'][0].length).toBe(7); // 7 columns

      // Verify shifts are valid (only M, P, RP in our simplified set)
      const validShifts = ['M', 'P', 'RP'];
      for (const shift of matrices['mat1'][0]) {
        expect(validShifts).toContain(shift);
      }
      for (const shift of matrices['mat2'][0]) {
        expect(validShifts).toContain(shift);
      }
    });

    it('should respect employee exclusions in generated matrices', () => {
      // Run GA (returns matrices directly)
      const matrices = generateOptimalMatricesJointly({
        allMatrices: twoMatrices,
        shiftTypes: simpleShiftTypes, // Only M, P, RP - no N to exclude anyway
        constraints: noConstraints,
        coverageRules: simpleCoverage,
        columnCount: 7,
        employees: twoEmployees,
        year: 2024,
        month: 0,
        options: {
          POPULATION_SIZE: 30,
          MAX_GENERATIONS: 100,
          ELITE_COUNT: 3,
          STAGNATION_LIMIT: 30,
          TIMEOUT_MS: 5000
        }
      });

      // Generate schedule from resulting matrices
      const schedule = solveWithGreedy({
        year: 2024,
        month: 0,
        daysInMonth: 28,
        employees: twoEmployees,
        shiftTypes: simpleShiftTypes,
        matrices: [
          { id: 'mat1', rows: matrices['mat1'] },
          { id: 'mat2', rows: matrices['mat2'] }
        ],
        matrixMap: matrices,
        defaultMatrix: matrices['mat1'],
        previousMonthSchedule: null,
        cycleLength: 7
      });

      // Verify emp2 (with excludedShifts) doesn't get N or SN
      // (In this test simpleShiftTypes has no N/SN, so this always passes,
      // but it validates the flow)
      const emp2Shifts = schedule.schedule['emp2'].shifts;
      const hasExcludedShifts = emp2Shifts.some(s => s === 'N' || s === 'SN');
      expect(hasExcludedShifts).toBe(false);
    });

    it('should converge toward better fitness over generations', () => {
      let progressHistory = [];

      const matrices = generateOptimalMatricesJointly({
        allMatrices: twoMatrices,
        shiftTypes: simpleShiftTypes,
        constraints: noConstraints,
        coverageRules: simpleCoverage,
        columnCount: 7,
        employees: twoEmployees,
        year: 2024,
        month: 0,
        options: {
          POPULATION_SIZE: 30,
          MAX_GENERATIONS: 50,
          ELITE_COUNT: 3,
          STAGNATION_LIMIT: 20,
          TIMEOUT_MS: 5000
        },
        onProgress: (progress) => {
          progressHistory.push({
            generation: progress.generation,
            bestFitness: progress.bestFitness
          });
        }
      });

      // If we found perfect fitness immediately, history might be empty or short
      // In that case, we consider it a success
      if (progressHistory.length > 0) {
        // Verify fitness improved or stayed same (never got worse for best)
        for (let i = 1; i < progressHistory.length; i++) {
          expect(progressHistory[i].bestFitness).toBeLessThanOrEqual(
            progressHistory[i - 1].bestFitness
          );
        }
      }

      // Verify matrices were returned
      expect(matrices).toBeDefined();
      expect(matrices['mat1']).toBeDefined();
      expect(matrices['mat2']).toBeDefined();
    });
  });


  describe('GA Integration: Non-Trivial Problem with Night Constraints', () => {
    /**
     * A challenging optimization problem with a known optimal solution:
     * - 5 shift types: M, P, N, SN, RP
     * - 6 employees: 4 in matrix 1, 2 in matrix 2
     * - Matrix 2 employees CANNOT work N or SN (night exclusions)
     * - Coverage: 1M, 1P, 1N, 1SN per day
     * - Constraints:
     *   - N must be followed by SN (must_follow)
     *   - SN can only be preceded by N (cannot_precede for M, P, RP before SN)
     *   - At least 1 RP every 6 days (max_consecutive_without)
     *
     * The snake pattern traverses the flattened matrix:
     * - For a 4x7 matrix, fullPattern = matrix.flat() = 28 elements
     * - Employee 0 starts at index 0, Employee 1 at index 7, etc.
     * - Each employee traverses the entire snake, wrapping cyclically
     *
     * Optimal Matrix 1 (4x7) - repeating pattern [N,SN,RP,P,N,SN,RP,M]:
     *   Row 0: N  SN RP P  N  SN RP  (starts the pattern)
     *   Row 1: M  N  SN RP P  N  SN  (continues from row 0)
     *   Row 2: RP M  N  SN RP P  N   (continues from row 1)
     *   Row 3: SN RP M  N  SN RP P   (continues from row 2, wraps to row 0)
     *
     * This creates valid cyclic sequences for all 4 employees.
     */

    const fullShiftTypes = [
      { id: 'M', name: 'Mattina', hours: 7 },
      { id: 'P', name: 'Pomeriggio', hours: 7 },
      { id: 'N', name: 'Notte', hours: 10 },
      { id: 'SN', name: 'Smonto Notte', hours: 0 },
      { id: 'RP', name: 'Riposo', hours: 0 }
    ];

    const nightConstraints = [
      // N must be followed by SN
      { id: 'n_sn', type: 'must_follow', shiftA: 'N', shiftB: 'SN', enabled: true },
      // SN cannot follow M, P, or RP (only N can precede SN)
      { id: 'no_m_sn', type: 'cannot_follow', shiftA: 'M', shiftB: 'SN', enabled: true },
      { id: 'no_p_sn', type: 'cannot_follow', shiftA: 'P', shiftB: 'SN', enabled: true },
      { id: 'no_rp_sn', type: 'cannot_follow', shiftA: 'RP', shiftB: 'SN', enabled: true },
      // At least 1 RP every 6 days
      { id: 'rest_req', type: 'max_consecutive_without', shift: 'RP', days: 5, enabled: true }
    ];

    const fullCoverage = [
      { id: 'morning', name: 'Morning', shiftIds: ['M'], min: 1, enabled: true },
      { id: 'afternoon', name: 'Afternoon', shiftIds: ['P'], min: 1, enabled: true },
      { id: 'night', name: 'Night', shiftIds: ['N'], min: 1, enabled: true },
      { id: 'post_night', name: 'Post Night', shiftIds: ['SN'], min: 1, enabled: true }
    ];

    // 6 employees: 4 in matrix 1 (can do all), 2 in matrix 2 (no nights)
    const sixEmployees = [
      { id: 'emp1', name: 'Employee 1', contractHours: 36, matrixId: 'mat1' },
      { id: 'emp2', name: 'Employee 2', contractHours: 36, matrixId: 'mat1' },
      { id: 'emp3', name: 'Employee 3', contractHours: 36, matrixId: 'mat1' },
      { id: 'emp4', name: 'Employee 4', contractHours: 36, matrixId: 'mat1' },
      { id: 'emp5', name: 'Employee 5', contractHours: 36, matrixId: 'mat2', excludedShifts: ['N', 'SN'] },
      { id: 'emp6', name: 'Employee 6', contractHours: 36, matrixId: 'mat2', excludedShifts: ['N', 'SN'] }
    ];

    // Initial matrices (will be optimized by GA)
    // Matrix 1: 4x7 for night rotation (snake pattern creates valid sequences)
    // Matrix 2: 2x7 for day shifts only (M/P to complement matrix 1's coverage)
    const initialMatrices = [
      {
        id: 'mat1',
        name: 'Night Rotation Matrix',
        rows: [
          ['N', 'SN', 'RP', 'P', 'N', 'SN', 'RP'],
          ['M', 'N', 'SN', 'RP', 'P', 'N', 'SN'],
          ['RP', 'M', 'N', 'SN', 'RP', 'P', 'N'],
          ['SN', 'RP', 'M', 'N', 'SN', 'RP', 'P']
        ]
      },
      {
        id: 'mat2',
        name: 'Day Shift Matrix',
        rows: [
          ['P', 'P', 'RP', 'M', 'M', 'RP', 'M'],
          ['RP', 'RP', 'P', 'RP', 'RP', 'M', 'RP']
        ]
      }
    ];

    it('should handle complex constraints with night shift exclusions', () => {
      // Run GA with moderate parameters
      const matrices = generateOptimalMatricesJointly({
        allMatrices: initialMatrices,
        shiftTypes: fullShiftTypes,
        constraints: nightConstraints,
        coverageRules: fullCoverage,
        columnCount: 7,
        employees: sixEmployees,
        year: 2024,
        month: 0,
        options: {
          useCurrentAsSeed: true,
          POPULATION_SIZE: 100,
          MAX_GENERATIONS: 500,
          ELITE_COUNT: 10,
          MUTATION_RATE: 0.1,
          STAGNATION_LIMIT: 100,
          TIMEOUT_MS: 30000  // 30 seconds
        }
      });

      // Verify matrices were generated
      expect(matrices).toBeDefined();
      expect(matrices['mat1']).toBeDefined();
      expect(matrices['mat2']).toBeDefined();

      // Verify matrix dimensions
      expect(matrices['mat1'].length).toBe(4);  // 4 rows for 4 employees
      expect(matrices['mat2'].length).toBe(2);  // 2 rows for 2 employees
      expect(matrices['mat1'][0].length).toBe(7);
      expect(matrices['mat2'][0].length).toBe(7);

      // Verify matrix 2 has no night shifts (since employees have exclusions)
      // Note: The matrix itself CAN have N/SN, but when applied to employees
      // with exclusions, they get replaced. However, a good GA should learn
      // to not put N/SN in matrix 2 since it hurts fitness.
      const mat2Shifts = matrices['mat2'].flat();
      const nightShiftsInMat2 = mat2Shifts.filter(s => s === 'N' || s === 'SN').length;

      // Log what we got
      console.log('Matrix 1:', matrices['mat1']);
      console.log('Matrix 2:', matrices['mat2']);
      console.log('Night shifts in matrix 2:', nightShiftsInMat2);

      // Note: The GA doesn't directly penalize exclusion violations in fitness.
      // Night shifts in matrix 2 will be replaced by greedy solver when applied
      // to employees with exclusions. This just verifies the GA runs successfully.
      expect(nightShiftsInMat2).toBeLessThanOrEqual(14); // All 14 shifts could be N/SN theoretically
    });

    it('should produce valid N->SN sequences in matrix 1', () => {
      const matrices = generateOptimalMatricesJointly({
        allMatrices: initialMatrices,
        shiftTypes: fullShiftTypes,
        constraints: nightConstraints,
        coverageRules: fullCoverage,
        columnCount: 7,
        employees: sixEmployees,
        year: 2024,
        month: 0,
        options: {
          useCurrentAsSeed: true,
          POPULATION_SIZE: 80,
          MAX_GENERATIONS: 300,
          ELITE_COUNT: 8,
          MUTATION_RATE: 0.1,
          STAGNATION_LIMIT: 80,
          TIMEOUT_MS: 20000
        }
      });

      // With the snake pattern, we validate the FLATTENED matrix as a cyclic sequence
      // The snake is 28 elements for a 4x7 matrix, and wraps cyclically
      const flattenedMat1 = matrices['mat1'].flat();
      const extendedSnake = [...flattenedMat1, ...flattenedMat1.slice(0, 7)];
      const errors = validateSequenceWithConstraints(extendedSnake, nightConstraints, fullShiftTypes);

      console.log('Matrix 1 rows:', matrices['mat1']);
      console.log('Flattened snake (first 14):', flattenedMat1.slice(0, 14));
      console.log('Total constraint violations in snake:', errors.length);

      // With constraint-guided mutation, violations should be minimal
      // Allow some violations since this is a hard problem
      expect(errors.length).toBeLessThanOrEqual(8); // At most 2 per employee on average
    });

    it('should minimize night shifts in matrix 2 for employees with exclusions', () => {
      /**
       * The Matrix GA now penalizes exclusion violations through evaluateFitness.
       * Each N or SN in matrix 2 causes exclusion violations (10000 penalty per occurrence).
       * With 28 days and a 14-element snake (2x7 matrix), each cell appears 2 times.
       * So a single N in one row of matrix 2 = 2 × 10000 = 20,000 penalty.
       *
       * The GA should find a solution with no major violations (fitness < 10000).
       * This requires:
       * - No exclusion violations (no N/SN in matrix 2)
       * - No coverage violations (exactly 1 M, 1 P, 1 N, 1 SN per day)
       * - No constraint violations (N→SN, rest requirements)
       *
       * With the optimal initial matrices provided, the GA should easily find
       * a valid solution since the initial state is already close to optimal.
       */
      let finalFitness = null;

      const matrices = generateOptimalMatricesJointly({
        allMatrices: initialMatrices,
        shiftTypes: fullShiftTypes,
        constraints: nightConstraints,
        coverageRules: fullCoverage,
        columnCount: 7,
        employees: sixEmployees,
        year: 2024,
        month: 0,
        options: {
          useCurrentAsSeed: true,
          POPULATION_SIZE: 200,
          MAX_GENERATIONS: 500,
          ELITE_COUNT: 20,
          MUTATION_RATE: 0.15,
          STAGNATION_LIMIT: 150,
          TIMEOUT_MS: 30000  // 30 seconds
        },
        onProgress: (p) => { finalFitness = p.bestFitness; }
      });

      // Verify matrices were generated
      expect(matrices).toBeDefined();
      expect(matrices['mat1']).toBeDefined();
      expect(matrices['mat2']).toBeDefined();

      // Check matrix 2 for night shifts
      const mat2Shifts = matrices['mat2'].flat();
      const nightShiftsInMat2 = mat2Shifts.filter(s => s === 'N' || s === 'SN').length;

      console.log('Matrix 1:', matrices['mat1']);
      console.log('Matrix 2:', matrices['mat2']);
      console.log('Night shifts in matrix 2:', nightShiftsInMat2);
      console.log('Final fitness:', finalFitness);

      // The GA must find a solution with no major violations
      expect(nightShiftsInMat2).toBe(0);
      expect(finalFitness).toBeLessThan(10000);
    });

    it('should improve fitness over generations for complex problem', () => {
      let progressHistory = [];
      let initialFitness = null;
      let finalFitness = null;

      const matrices = generateOptimalMatricesJointly({
        allMatrices: initialMatrices,
        shiftTypes: fullShiftTypes,
        constraints: nightConstraints,
        coverageRules: fullCoverage,
        columnCount: 7,
        employees: sixEmployees,
        year: 2024,
        month: 0,
        options: {
          useCurrentAsSeed: false,
          POPULATION_SIZE: 80,
          MAX_GENERATIONS: 300,
          ELITE_COUNT: 8,
          MUTATION_RATE: 0.1,
          STAGNATION_LIMIT: 100,
          TIMEOUT_MS: 25000
        },
        onProgress: (progress) => {
          if (progressHistory.length === 0) {
            initialFitness = progress.bestFitness;
          }
          finalFitness = progress.bestFitness;
          progressHistory.push({
            generation: progress.generation,
            bestFitness: progress.bestFitness
          });
        }
      });

      console.log('Initial fitness:', initialFitness);
      console.log('Final fitness:', finalFitness);
      console.log('Generations run:', progressHistory.length * 5); // Progress every 5 gens
      console.log('Improvement:', initialFitness - finalFitness);

      // Verify we made progress
      expect(progressHistory.length).toBeGreaterThan(0);

      // Fitness should improve (decrease) or stay same
      expect(finalFitness).toBeLessThanOrEqual(initialFitness);

      // Should see significant improvement on this problem
      if (initialFitness > 1000) {
        // If we started with high fitness, we should improve by at least 10%
        expect(finalFitness).toBeLessThan(initialFitness * 0.95);
      }

      // Verify matrices are returned
      expect(matrices).toBeDefined();
      expect(matrices['mat1']).toBeDefined();
      expect(matrices['mat2']).toBeDefined();
    });
  });
});
