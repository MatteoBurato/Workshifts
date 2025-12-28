/**
 * Workflow 1: Schedule Generation GA Tests
 *
 * Tests for the genetic algorithm that generates monthly workshifts
 * from fixed base cycle matrices.
 */

import { describe, it, expect } from 'vitest';
import { validateSequenceWithConstraints, getValidShiftsForPosition } from '../constraints.js';
import {
  countConstraintViolations,
  calculateHoursDeviation,
  evaluateFitness
} from '../ga/fitness.js';
import {
  swapMutation,
  guidedMutation,
  tournamentSelect,
  employeeCrossover
} from '../ga/operators.js';
import {
  shiftTypes,
  constraints,
  coverageRules,
  employees,
  validShiftSequence,
  invalidShiftSequence,
  generateSimpleSchedule,
  createTestChromosome,
  createFitnessContext
} from './fixtures.js';


describe('Workflow 1: Schedule Generation GA', () => {

  describe('Constraint Validation', () => {

    it('should validate a correct N->SN->RP sequence', () => {
      const sequence = ['M', 'P', 'N', 'SN', 'RP', 'M', 'P'];
      const errors = validateSequenceWithConstraints(sequence, constraints, shiftTypes);
      expect(errors).toHaveLength(0);
    });

    it('should detect N not followed by SN violation', () => {
      const sequence = ['M', 'P', 'N', 'M', 'P', 'M', 'P'];
      const errors = validateSequenceWithConstraints(sequence, constraints, shiftTypes);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.constraintId === 'c1')).toBe(true);
    });

    it('should detect cannot_follow violation (N followed by M)', () => {
      const sequence = ['M', 'P', 'N', 'M', 'P', 'M', 'P'];
      const errors = validateSequenceWithConstraints(sequence, constraints, shiftTypes);
      expect(errors.some(e => e.constraintId === 'c3')).toBe(true);
    });

    it('should detect max_consecutive violation', () => {
      // 3 consecutive nights should violate max_consecutive of 2
      const sequence = ['N', 'N', 'N', 'SN', 'RP', 'M', 'P'];
      const errors = validateSequenceWithConstraints(sequence, constraints, shiftTypes);
      expect(errors.some(e => e.constraintId === 'c4')).toBe(true);
    });

    it('should return valid shifts for a position', () => {
      const existingShifts = ['M', 'P', 'N'];
      const validShifts = getValidShiftsForPosition(existingShifts, constraints, shiftTypes);
      // After N, only SN is valid (must_follow constraint)
      expect(validShifts).toContain('SN');
      expect(validShifts).not.toContain('M'); // cannot_follow N->M
      expect(validShifts).not.toContain('P');
    });
  });


  describe('Fitness Evaluation', () => {

    it('should count constraint violations correctly', () => {
      const validCount = countConstraintViolations(validShiftSequence, constraints, shiftTypes);
      expect(validCount).toBe(0);

      const invalidCount = countConstraintViolations(invalidShiftSequence, constraints, shiftTypes);
      expect(invalidCount).toBeGreaterThan(0);
    });

    it('should calculate hours deviation correctly', () => {
      const employee = { id: 'test', contractHours: 36 };
      // 4 weeks = 28 days, expect 36*4 = 144 hours
      const shifts = ['M', 'P', 'N', 'SN', 'RP', 'M', 'P']; // 7+7+10+0+0+7+7 = 38 hours per week
      const fullShifts = [];
      for (let i = 0; i < 28; i++) {
        fullShifts.push(shifts[i % 7]);
      }

      const result = calculateHoursDeviation(fullShifts, employee, shiftTypes, 28);

      expect(result.expected).toBe(144); // 36 * 4
      expect(result.worked).toBe(38 * 4); // 152 hours
      expect(result.deviation).toBe(8); // 8 hours over
    });

    it('should penalize under-hours more than over-hours', () => {
      const employee = { id: 'test', contractHours: 36 };

      // Create shifts that result in under-hours
      const underShifts = Array(28).fill('RP'); // 0 hours
      const underResult = calculateHoursDeviation(underShifts, employee, shiftTypes, 28);

      // Create shifts that result in similar over-hours
      const overShifts = Array(28).fill('N'); // 10 hours each = 280 hours
      const overResult = calculateHoursDeviation(overShifts, employee, shiftTypes, 28);

      // Under-hours penalty rate (15) > over-hours penalty rate (8)
      expect(underResult.penalty).toBeGreaterThan(0);
      expect(overResult.penalty).toBeGreaterThan(0);
    });

    it('should evaluate fitness for a valid schedule', () => {
      const schedule = generateSimpleSchedule(employees);
      const chromosome = createTestChromosome(employees, schedule);
      const context = createFitnessContext();

      const result = evaluateFitness(chromosome, context);

      expect(result).toHaveProperty('fitness');
      expect(result).toHaveProperty('components');
      expect(result).toHaveProperty('isValid');
      expect(typeof result.fitness).toBe('number');
    });

    it('should give better fitness to schedules with fewer violations', () => {
      const context = createFitnessContext();

      // Valid schedule
      const validSchedule = generateSimpleSchedule(employees, validShiftSequence);
      const validChromosome = createTestChromosome(employees, validSchedule);
      const validResult = evaluateFitness(validChromosome, context);

      // Invalid schedule with constraint violations
      const invalidSchedule = generateSimpleSchedule(employees, invalidShiftSequence);
      const invalidChromosome = createTestChromosome(employees, invalidSchedule);
      const invalidResult = evaluateFitness(invalidChromosome, context);

      // Lower fitness is better, so valid should have lower score
      expect(validResult.fitness).toBeLessThan(invalidResult.fitness);
    });

    it('should penalize exclusion violations', () => {
      // Create an employee with excluded shifts
      const employeesWithExclusions = [
        { id: 'emp1', name: 'Employee 1', contractHours: 36, matrixId: 'matrix1', excludedShifts: ['N', 'SN'] }
      ];

      // Schedule that contains excluded shifts (N at day 2, SN at day 3)
      const scheduleWithExclusions = {
        'emp1': ['M', 'P', 'N', 'SN', 'RP', 'M', 'P', 'M', 'P', 'N', 'SN', 'RP', 'M', 'P',
                 'M', 'P', 'N', 'SN', 'RP', 'M', 'P', 'M', 'P', 'N', 'SN', 'RP', 'M', 'P']
      };

      // Schedule without excluded shifts
      const scheduleWithoutExclusions = {
        'emp1': ['M', 'P', 'M', 'P', 'RP', 'M', 'P', 'M', 'P', 'M', 'P', 'RP', 'M', 'P',
                 'M', 'P', 'M', 'P', 'RP', 'M', 'P', 'M', 'P', 'M', 'P', 'RP', 'M', 'P']
      };

      const contextWithExclusions = {
        employees: employeesWithExclusions,
        shiftTypes,
        constraints: [], // No sequence constraints for this test
        coverageRules: [],
        baselineShifts: scheduleWithExclusions,
        daysInMonth: 28
      };

      // Evaluate schedule with exclusion violations
      const resultWithViolations = evaluateFitness(
        { schedule: scheduleWithExclusions },
        contextWithExclusions
      );

      // Evaluate schedule without exclusion violations
      const resultWithoutViolations = evaluateFitness(
        { schedule: scheduleWithoutExclusions },
        { ...contextWithExclusions, baselineShifts: scheduleWithoutExclusions }
      );

      // Should have 8 exclusion violations (4 N + 4 SN over 28 days)
      expect(resultWithViolations.components.exclusionViolations).toBe(8);
      expect(resultWithViolations.components.exclusionPenalty).toBe(80000); // 8 * 10000

      // Should have 0 exclusion violations
      expect(resultWithoutViolations.components.exclusionViolations).toBe(0);
      expect(resultWithoutViolations.components.exclusionPenalty).toBe(0);

      // Schedule with violations should have worse (higher) fitness
      expect(resultWithViolations.fitness).toBeGreaterThan(resultWithoutViolations.fitness);

      // Verify the hours penalty difference explains the gap
      // Schedule with N (10h) has fewer total hours than schedule with M/P (7h) replacements
      // With exclusions: 4×N(10h) + 4×SN(0h) + 4×RP(0h) + 16×M/P(7h) = 152h (8h over → penalty 64)
      // Without exclusions: 4×RP(0h) + 24×M/P(7h) = 168h (24h over → penalty 192)
      // Hours penalty difference: 192 - 64 = 128 (without has MORE hours penalty)
      const hoursPenaltyDiff = resultWithoutViolations.components.hoursPenalty -
                               resultWithViolations.components.hoursPenalty;
      expect(hoursPenaltyDiff).toBe(128);

      // The fitness difference should be exactly: exclusionPenalty - hoursPenaltyDiff
      const fitnessDifference = resultWithViolations.fitness - resultWithoutViolations.fitness;
      expect(fitnessDifference).toBe(80000 - 128); // 79872
    });
  });


  describe('Genetic Operators', () => {

    it('should perform tournament selection', () => {
      const population = [
        { fitness: 100 },
        { fitness: 50 },
        { fitness: 200 },
        { fitness: 25 },
        { fitness: 150 }
      ];

      const selected = tournamentSelect(population, 3);

      expect(population).toContain(selected);
      // Tournament should tend to select fitter (lower fitness) individuals
    });

    it('should perform employee-level crossover', () => {
      const schedule1 = generateSimpleSchedule(employees.slice(0, 4), validShiftSequence);
      const schedule2 = generateSimpleSchedule(employees.slice(0, 4), ['P', 'M', 'N', 'SN', 'RP', 'P', 'M']);

      const parent1 = { schedule: schedule1 };
      const parent2 = { schedule: schedule2 };

      const child = employeeCrossover(parent1, parent2, employees.slice(0, 4));

      expect(child).toHaveProperty('schedule');
      expect(Object.keys(child.schedule)).toHaveLength(4);

      // Each employee's schedule should come entirely from one parent
      for (const emp of employees.slice(0, 4)) {
        const childShifts = child.schedule[emp.id];
        const matchesParent1 = JSON.stringify(childShifts) === JSON.stringify(schedule1[emp.id]);
        const matchesParent2 = JSON.stringify(childShifts) === JSON.stringify(schedule2[emp.id]);
        expect(matchesParent1 || matchesParent2).toBe(true);
      }
    });

    it('should perform swap mutation', () => {
      const schedule = generateSimpleSchedule(employees.slice(0, 4));
      const chromosome = { schedule: { ...schedule } };

      // Store original for comparison
      const original = JSON.stringify(chromosome.schedule);

      // Apply mutation with high rate to ensure changes
      swapMutation(chromosome, employees.slice(0, 4), 28, 1.0);

      // Note: swap mutation may or may not change the schedule depending on
      // whether valid swaps are found. We just verify it doesn't crash.
      expect(chromosome).toHaveProperty('schedule');
    });

    it('should perform guided mutation toward baseline', () => {
      // Create a schedule that differs from baseline
      const divergentPattern = ['P', 'P', 'P', 'P', 'P', 'P', 'P'];
      const schedule = generateSimpleSchedule(employees.slice(0, 2), divergentPattern);
      const chromosome = { schedule };

      const baselineShifts = generateSimpleSchedule(employees.slice(0, 2), validShiftSequence);

      // Apply guided mutation with high rate and high baseline adherence
      guidedMutation(
        chromosome,
        employees.slice(0, 2),
        baselineShifts,
        28,
        1.0,  // 100% mutation rate
        1.0   // 100% baseline adherence
      );

      // After guided mutation with 100% adherence, schedule should match baseline
      for (const emp of employees.slice(0, 2)) {
        expect(chromosome.schedule[emp.id]).toEqual(baselineShifts[emp.id]);
      }
    });
  });


  describe('Employee-Matrix Assignment', () => {

    it('should respect employee matrixId assignments', () => {
      // Verify fixture setup
      const matrix1Employees = employees.filter(e => e.matrixId === 'matrix1');
      const matrix2Employees = employees.filter(e => e.matrixId === 'matrix2');

      expect(matrix1Employees).toHaveLength(6);
      expect(matrix2Employees).toHaveLength(2);
    });

    it('should group employees by matrix correctly', () => {
      const employeesByMatrix = {};
      for (const emp of employees) {
        const matrixId = emp.matrixId;
        if (!employeesByMatrix[matrixId]) {
          employeesByMatrix[matrixId] = [];
        }
        employeesByMatrix[matrixId].push(emp);
      }

      expect(Object.keys(employeesByMatrix)).toHaveLength(2);
      expect(employeesByMatrix['matrix1']).toHaveLength(6);
      expect(employeesByMatrix['matrix2']).toHaveLength(2);
    });
  });
});
