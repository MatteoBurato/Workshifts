/**
 * Genetic Algorithm Operators
 *
 * Implements selection, crossover, and mutation operators
 * for schedule optimization.
 */

/**
 * Tournament selection - select best individual from random subset
 *
 * @param {Array<Object>} population - Array of evaluated chromosomes
 * @param {number} tournamentSize - Number of individuals in tournament
 * @returns {Object} Selected chromosome
 */
export const tournamentSelect = (population, tournamentSize = 5) => {
  const tournament = [];

  for (let i = 0; i < tournamentSize; i++) {
    const idx = Math.floor(Math.random() * population.length);
    tournament.push(population[idx]);
  }

  // Return the one with best (lowest) fitness
  return tournament.reduce((best, curr) =>
    curr.fitness < best.fitness ? curr : best
  );
};

/**
 * Single-point crossover - swap all days after crossover point
 *
 * @param {Object} parent1 - First parent chromosome
 * @param {Object} parent2 - Second parent chromosome
 * @param {Array<Object>} employees - Employee list for iteration
 * @param {number} daysInMonth - Number of days
 * @returns {Object} Child chromosome
 */
export const singlePointCrossover = (parent1, parent2, employees, daysInMonth) => {
  // Random crossover point (day)
  const crossPoint = Math.floor(Math.random() * daysInMonth);

  const childSchedule = {};

  for (const emp of employees) {
    const p1Shifts = parent1.schedule[emp.id];
    const p2Shifts = parent2.schedule[emp.id];

    if (!p1Shifts || !p2Shifts) continue;

    // Take days 0..crossPoint from parent1, rest from parent2
    const childShifts = [
      ...p1Shifts.slice(0, crossPoint),
      ...p2Shifts.slice(crossPoint)
    ];

    childSchedule[emp.id] = childShifts;
  }

  return { schedule: childSchedule };
};

/**
 * Uniform crossover - for each gene, randomly pick from either parent
 *
 * @param {Object} parent1 - First parent chromosome
 * @param {Object} parent2 - Second parent chromosome
 * @param {Array<Object>} employees - Employee list
 * @param {number} daysInMonth - Number of days
 * @returns {Object} Child chromosome
 */
export const uniformCrossover = (parent1, parent2, employees, daysInMonth) => {
  const childSchedule = {};

  for (const emp of employees) {
    const p1Shifts = parent1.schedule[emp.id];
    const p2Shifts = parent2.schedule[emp.id];

    if (!p1Shifts || !p2Shifts) continue;

    const childShifts = [];
    for (let day = 0; day < daysInMonth; day++) {
      // Randomly pick from either parent
      childShifts.push(Math.random() < 0.5 ? p1Shifts[day] : p2Shifts[day]);
    }

    childSchedule[emp.id] = childShifts;
  }

  return { schedule: childSchedule };
};

/**
 * Employee-level crossover - swap entire employee schedules
 * Better preserves individual constraint satisfaction
 *
 * @param {Object} parent1
 * @param {Object} parent2
 * @param {Array<Object>} employees
 * @returns {Object} Child chromosome
 */
export const employeeCrossover = (parent1, parent2, employees) => {
  const childSchedule = {};

  for (const emp of employees) {
    // Randomly pick entire schedule from either parent
    const source = Math.random() < 0.5 ? parent1 : parent2;
    childSchedule[emp.id] = [...source.schedule[emp.id]];
  }

  return { schedule: childSchedule };
};

/**
 * Swap mutation - swap shifts between two employees on the same day
 * This preserves coverage requirements but must respect employee exclusions
 *
 * @param {Object} chromosome - Chromosome to mutate (modified in place)
 * @param {Array<Object>} employees - Employee list
 * @param {number} daysInMonth - Number of days
 * @param {number} mutationRate - Probability of mutation per gene
 */
export const swapMutation = (chromosome, employees, daysInMonth, mutationRate = 0.05) => {
  for (let day = 0; day < daysInMonth; day++) {
    if (Math.random() > mutationRate) continue;

    // Pick two random employees
    const idx1 = Math.floor(Math.random() * employees.length);
    let idx2 = Math.floor(Math.random() * employees.length);
    while (idx2 === idx1 && employees.length > 1) {
      idx2 = Math.floor(Math.random() * employees.length);
    }

    const emp1 = employees[idx1];
    const emp2 = employees[idx2];

    const shifts1 = chromosome.schedule[emp1.id];
    const shifts2 = chromosome.schedule[emp2.id];

    if (shifts1 && shifts2) {
      const s1 = shifts1[day];
      const s2 = shifts2[day];

      if (s1 === s2) continue;

      // Check if emp1 can do s2 and emp2 can do s1
      const emp1CanDo = !emp1.excludedShifts || !emp1.excludedShifts.includes(s2);
      const emp2CanDo = !emp2.excludedShifts || !emp2.excludedShifts.includes(s1);

      if (emp1CanDo && emp2CanDo) {
        shifts1[day] = s2;
        shifts2[day] = s1;
      }
    }
  }
};

/**
 * Point mutation - change a single shift to another valid option
 *
 * @param {Object} chromosome - Chromosome to mutate (modified in place)
 * @param {Array<Object>} employees - Employee list
 * @param {Array<Object>} shiftTypes - Available shift types
 * @param {number} daysInMonth - Number of days
 * @param {number} mutationRate - Probability of mutation per gene
 */
export const pointMutation = (chromosome, employees, shiftTypes, daysInMonth, mutationRate = 0.02) => {
  const shiftIds = shiftTypes.map(s => s.id);

  for (const emp of employees) {
    const shifts = chromosome.schedule[emp.id];
    if (!shifts) continue;

    // Get valid shifts for this employee
    let validShifts = shiftIds;
    if (emp.excludedShifts && Array.isArray(emp.excludedShifts)) {
      validShifts = shiftIds.filter(s => !emp.excludedShifts.includes(s));
    }

    for (let day = 0; day < daysInMonth; day++) {
      if (Math.random() > mutationRate) continue;

      // Pick a random different shift
      const currentShift = shifts[day];
      const otherShifts = validShifts.filter(s => s !== currentShift);

      if (otherShifts.length > 0) {
        shifts[day] = otherShifts[Math.floor(Math.random() * otherShifts.length)];
      }
    }
  }
};

/**
 * Guided mutation - prefer changes that move toward matrix pattern
 *
 * @param {Object} chromosome
 * @param {Array<Object>} employees
 * @param {Object<string, Array<string>>} baselineShifts - Matrix-derived baseline
 * @param {number} daysInMonth
 * @param {number} mutationRate
 */
export const guidedMutation = (chromosome, employees, baselineShifts, daysInMonth, mutationRate = 0.03, baselineAdherence = 0.7) => {
  for (const emp of employees) {
    const shifts = chromosome.schedule[emp.id];
    const baseline = baselineShifts[emp.id];

    if (!shifts || !baseline) continue;

    for (let day = 0; day < daysInMonth; day++) {
      if (Math.random() > mutationRate) continue;

      // If current differs from baseline, prefer moving toward baseline
      if (shifts[day] !== baseline[day]) {
        // Use parametrized probability (default 70%) to revert to baseline
        if (Math.random() < baselineAdherence) {
          shifts[day] = baseline[day];
        }
      }
    }
  }
};

/**
 * Clone a chromosome (deep copy of schedule)
 *
 * @param {Object} chromosome
 * @returns {Object} Cloned chromosome
 */
export const cloneChromosome = (chromosome) => {
  const newSchedule = {};
  for (const [empId, shifts] of Object.entries(chromosome.schedule)) {
    newSchedule[empId] = [...shifts];
  }
  return { schedule: newSchedule };
};

/**
 * Create offspring from two parents
 *
 * @param {Object} parent1
 * @param {Object} parent2
 * @param {Object} context
 * @param {Object} options
 * @returns {Object} Child chromosome
 */
export const createOffspring = (parent1, parent2, context, options = {}) => {
  const { employees, shiftTypes, baselineShifts, daysInMonth } = context;
  const {
    crossoverType = 'employee',
    mutationRate = 0.05,
    usedGuidedMutation = true,
    baselineAdherence = 0.7
  } = options;

  // Crossover
  let child;
  switch (crossoverType) {
    case 'single':
      child = singlePointCrossover(parent1, parent2, employees, daysInMonth);
      break;
    case 'uniform':
      child = uniformCrossover(parent1, parent2, employees, daysInMonth);
      break;
    case 'employee':
    default:
      child = employeeCrossover(parent1, parent2, employees);
      break;
  }

  // Apply mutations
  swapMutation(child, employees, daysInMonth, mutationRate);

  if (usedGuidedMutation && baselineShifts) {
    guidedMutation(child, employees, baselineShifts, daysInMonth, mutationRate * 0.5, baselineAdherence);
  } else {
    pointMutation(child, employees, shiftTypes, daysInMonth, mutationRate * 0.3);
  }

  return child;
};
