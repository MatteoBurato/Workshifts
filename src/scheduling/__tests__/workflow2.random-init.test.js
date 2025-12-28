
import { describe, it, expect } from 'vitest';
import { generateOptimalMatricesJointly } from '../matrixGenerator.js';
import { validateSequenceWithConstraints } from '../constraints.js';

describe('Workflow 2: Random Initialization Challenge', () => {

  const fullShiftTypes = [
    { id: 'M', name: 'Mattina', hours: 7 },
    { id: 'P', name: 'Pomeriggio', hours: 7 },
    { id: 'N', name: 'Notte', hours: 10 },
    { id: 'SN', name: 'Smonto Notte', hours: 0 },
    { id: 'RP', name: 'Riposo', hours: 0 }
  ];

  const nightConstraints = [
    { id: 'n_sn', type: 'must_follow', shiftA: 'N', shiftB: 'SN', enabled: true },
    { id: 'no_m_sn', type: 'cannot_follow', shiftA: 'M', shiftB: 'SN', enabled: true },
    { id: 'no_p_sn', type: 'cannot_follow', shiftA: 'P', shiftB: 'SN', enabled: true },
    { id: 'no_rp_sn', type: 'cannot_follow', shiftA: 'RP', shiftB: 'SN', enabled: true },
    { id: 'rest_req', type: 'max_consecutive_without', shift: 'RP', days: 5, enabled: true }
  ];

  const fullCoverage = [
    { id: 'morning', name: 'Morning', shiftIds: ['M'], min: 1, enabled: true },
    { id: 'afternoon', name: 'Afternoon', shiftIds: ['P'], min: 1, enabled: true },
    { id: 'night', name: 'Night', shiftIds: ['N'], min: 1, enabled: true },
    { id: 'post_night', name: 'Post Night', shiftIds: ['SN'], min: 1, enabled: true }
  ];

  const sixEmployees = [
    { id: 'emp1', name: 'Employee 1', contractHours: 36, matrixId: 'mat1' },
    { id: 'emp2', name: 'Employee 2', contractHours: 36, matrixId: 'mat1' },
    { id: 'emp3', name: 'Employee 3', contractHours: 36, matrixId: 'mat1' },
    { id: 'emp4', name: 'Employee 4', contractHours: 36, matrixId: 'mat1' },
    { id: 'emp5', name: 'Employee 5', contractHours: 36, matrixId: 'mat2', excludedShifts: ['N', 'SN'] },
    { id: 'emp6', name: 'Employee 6', contractHours: 36, matrixId: 'mat2', excludedShifts: ['N', 'SN'] }
  ];

  // Dummy initial matrices (random/bad state)
  const randomMatrices = [
    {
      id: 'mat1',
      name: 'Night Rotation Matrix',
      rows: [
        ['M', 'M', 'M', 'M', 'M', 'M', 'M'],
        ['M', 'M', 'M', 'M', 'M', 'M', 'M'],
        ['M', 'M', 'M', 'M', 'M', 'M', 'M'],
        ['M', 'M', 'M', 'M', 'M', 'M', 'M']
      ]
    },
    {
      id: 'mat2',
      name: 'Day Shift Matrix',
      rows: [
        ['N', 'N', 'N', 'N', 'N', 'N', 'N'],
        ['N', 'N', 'N', 'N', 'N', 'N', 'N']
      ]
    }
  ];

  it('should find a valid solution from random initialization', () => {
    let finalFitness = null;

    const matrices = generateOptimalMatricesJointly({
      allMatrices: randomMatrices,
      shiftTypes: fullShiftTypes,
      constraints: nightConstraints,
      coverageRules: fullCoverage,
      columnCount: 7,
      employees: sixEmployees,
      year: 2024,
      month: 0,
      options: {
        useCurrentAsSeed: false, // Force random initialization
        POPULATION_SIZE: 500,    // Large population
        MAX_GENERATIONS: 2000,   // Many generations
        ELITE_COUNT: 50,
        MUTATION_RATE: 0.2,      // Higher mutation
        STAGNATION_LIMIT: 1000,
        TIMEOUT_MS: 60000        // 60 seconds
      },
      onProgress: (p) => { finalFitness = p.bestFitness; }
    });

    console.log('Final fitness (Random Init):', finalFitness);
    console.log('Matrix 1:', matrices['mat1']);
    console.log('Matrix 2:', matrices['mat2']);

    // Check strict requirements
    const mat2Shifts = matrices['mat2'].flat();
    const nightShiftsInMat2 = mat2Shifts.filter(s => s === 'N' || s === 'SN').length;
    console.log('Night shifts in matrix 2:', nightShiftsInMat2);

    // Validate N->SN sequences in Matrix 1
    const flattenedMat1 = matrices['mat1'].flat();
    const extendedSnake = [...flattenedMat1, ...flattenedMat1.slice(0, 7)];
    const sequenceErrors = validateSequenceWithConstraints(extendedSnake, nightConstraints, fullShiftTypes);
    console.log('Sequence errors in Matrix 1:', sequenceErrors.length);

    // Expectation: The GA should find a solution with NO major violations
    // This typically requires fitness < 10000 (no exclusion violations)
    expect(nightShiftsInMat2).toBe(0);
    expect(sequenceErrors.length).toBe(0);
    expect(finalFitness).toBeLessThan(10000);
  }, 60000);
});
