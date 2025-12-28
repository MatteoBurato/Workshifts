/**
 * Genetic Algorithm for Schedule Optimization
 *
 * Evolves a population of schedules to find optimal assignments
 * that minimize constraint violations and optimize soft objectives.
 */

import { evaluateFitness } from './fitness.js';
import { tournamentSelect, createOffspring, cloneChromosome } from './operators.js';

/**
 * Default GA parameters
 */
export const DEFAULT_SCHEDULE_GA_CONFIG = {
  POPULATION_SIZE: 500,
  MAX_GENERATIONS: 10000,
  TOURNAMENT_SIZE: 5,
  CROSSOVER_RATE: 0.8,
  MUTATION_RATE: 0.08,
  ELITE_COUNT: 20,
  STAGNATION_LIMIT: 1000,
  TARGET_FITNESS: 0,
  TIMEOUT_MS: 3000000
};

/**
 * Create initial population
 *
 * @param {Object} baselineSchedule
 * @param {number} populationSize
 * @param {Object} context
 * @returns {Array<Object>} Initial population of chromosomes
 */
const initializePopulation = (baselineSchedule, populationSize, context) => {
  const { employees, shiftTypes, daysInMonth } = context;
  const population = [];

  // First individual is the exact baseline (greedy solution)
  population.push({
    schedule: JSON.parse(JSON.stringify(baselineSchedule))
  });

  // Rest are variations of the baseline
  const shiftIds = shiftTypes.map(s => s.id);

  for (let i = 1; i < populationSize; i++) {
    const schedule = {};

    for (const emp of employees) {
      const baseShifts = baselineSchedule[emp.id];
      const newShifts = [...baseShifts];

      // Get valid shifts for this employee
      let validShifts = shiftIds;
      if (emp.excludedShifts && Array.isArray(emp.excludedShifts)) {
        validShifts = shiftIds.filter(s => !emp.excludedShifts.includes(s));
      }

      // Apply random perturbations (more perturbation for later individuals)
      const perturbRate = 0.02 + (i / populationSize) * 0.15;

      for (let day = 0; day < daysInMonth; day++) {
        if (Math.random() < perturbRate) {
          newShifts[day] = validShifts[Math.floor(Math.random() * validShifts.length)];
        }
      }

      schedule[emp.id] = newShifts;
    }

    population.push({ schedule });
  }

  return population;
};

/**
 * Evaluate fitness for entire population
 *
 * @param {Array<Object>} population
 * @param {Object} context
 */
const evaluatePopulation = (population, context) => {
  for (const chromosome of population) {
    const evaluation = evaluateFitness(chromosome, context);
    chromosome.fitness = evaluation.fitness;
    chromosome.evaluation = evaluation;
  }

  // Sort by fitness (ascending - lower is better)
  population.sort((a, b) => a.fitness - b.fitness);
};

/**
 * Run the genetic algorithm
 *
 * @param {Object} params
 * @param {number} params.daysInMonth
 * @param {Array<Object>} params.employees
 * @param {Array<Object>} params.shiftTypes
 * @param {Object} params.baselineShifts - Pre-generated baseline schedule by employee ID
 * @param {Array<Object>} params.constraints
 * @param {Array<Object>} params.coverageRules
 * @param {Object} params.options - GA options
 * @param {Function} params.onProgress - Progress callback
 * @returns {Object} Result with best schedule
 */
export const runGeneticAlgorithm = (params) => {
  const {
    daysInMonth,
    employees,
    shiftTypes,
    baselineShifts,  // Now received directly from caller
    constraints,
    coverageRules,
    options = {},
    onProgress
  } = params;

  // Normalize options to lowercase for internal usage, merged with uppercase defaults
  const opts = {
    populationSize: options.populationSize || DEFAULT_SCHEDULE_GA_CONFIG.POPULATION_SIZE,
    maxGenerations: options.maxGenerations || DEFAULT_SCHEDULE_GA_CONFIG.MAX_GENERATIONS,
    tournamentSize: options.tournamentSize || DEFAULT_SCHEDULE_GA_CONFIG.TOURNAMENT_SIZE,
    crossoverRate: options.crossoverRate || DEFAULT_SCHEDULE_GA_CONFIG.CROSSOVER_RATE,
    mutationRate: options.mutationRate || DEFAULT_SCHEDULE_GA_CONFIG.MUTATION_RATE,
    eliteCount: options.eliteCount || DEFAULT_SCHEDULE_GA_CONFIG.ELITE_COUNT,
    stagnationLimit: options.stagnationLimit || DEFAULT_SCHEDULE_GA_CONFIG.STAGNATION_LIMIT,
    targetFitness: options.targetFitness || DEFAULT_SCHEDULE_GA_CONFIG.TARGET_FITNESS,
    timeoutMs: options.timeoutMs || options.gaTimeoutMs || DEFAULT_SCHEDULE_GA_CONFIG.TIMEOUT_MS,
    baselineAdherence: options.baselineAdherence,
    weights: options.weights
  };

  console.log('[GA] Merged options:', {
    maxGenerations: opts.maxGenerations,
    stagnationLimit: opts.stagnationLimit,
    populationSize: opts.populationSize,
    timeoutMs: opts.timeoutMs
  });
  const startTime = Date.now();

  // Context for fitness evaluation
  const context = {
    employees,
    shiftTypes,
    constraints,
    coverageRules,
    baselineShifts,
    daysInMonth,
    weights: opts.weights
  };

  // Initialize population
  let population = initializePopulation(baselineShifts, opts.populationSize, context);

  // Evaluate initial population
  evaluatePopulation(population, context);

  let bestFitness = population[0].fitness;
  let bestChromosome = cloneChromosome(population[0]);
  bestChromosome.evaluation = population[0].evaluation;
  let stagnationCount = 0;

  // Evolution loop
  for (let gen = 0; gen < opts.maxGenerations; gen++) {
    // Check timeout
    if (Date.now() - startTime > opts.timeoutMs) {
      console.log('[GA] Terminated: timeout at gen', gen);
      break;
    }

    // Check stagnation
    if (stagnationCount >= opts.stagnationLimit) {
      console.log('[GA] Terminated: stagnation at gen', gen, 'stagnationCount:', stagnationCount);
      break;
    }

    // Check if target fitness achieved
    if (bestFitness <= opts.targetFitness) {
      console.log('[GA] Terminated: target fitness achieved at gen', gen);
      break;
    }

    // Create new generation
    const newPopulation = [];

    // Elitism - keep best individuals
    for (let i = 0; i < opts.eliteCount && i < population.length; i++) {
      newPopulation.push(cloneChromosome(population[i]));
    }

    // Create offspring
    while (newPopulation.length < opts.populationSize) {
      if (Math.random() < opts.crossoverRate) {
        // Crossover
        const parent1 = tournamentSelect(population, opts.tournamentSize);
        const parent2 = tournamentSelect(population, opts.tournamentSize);

        const child = createOffspring(parent1, parent2, context, {
          mutationRate: opts.mutationRate,
          usedGuidedMutation: true,
          baselineAdherence: opts.baselineAdherence
        });

        newPopulation.push(child);
      } else {
        // Clone with mutation
        const parent = tournamentSelect(population, opts.tournamentSize);
        const child = cloneChromosome(parent);

        // Apply mutation
        createOffspring(child, child, context, {
          mutationRate: opts.mutationRate * 2,
          usedGuidedMutation: true,
          baselineAdherence: opts.baselineAdherence
        });

        newPopulation.push(child);
      }
    }

    population = newPopulation;

    // Evaluate new generation
    evaluatePopulation(population, context);

    // Track improvement
    if (population[0].fitness < bestFitness) {
      bestFitness = population[0].fitness;
      bestChromosome = cloneChromosome(population[0]);
      bestChromosome.evaluation = population[0].evaluation;
      stagnationCount = 0;
    } else {
      stagnationCount++;
    }

    // Report progress
    if (onProgress && gen % 5 === 0) {
      onProgress({
        generation: gen,
        maxGenerations: opts.maxGenerations,
        bestFitness: bestFitness,
        avgFitness: population.reduce((sum, c) => sum + c.fitness, 0) / population.length,
        isValid: bestChromosome.evaluation?.isValid || false,
        constraintViolations: bestChromosome.evaluation?.components?.constraintViolations || 0,
        coverageViolations: bestChromosome.evaluation?.components?.coverageViolations || 0,
        hoursDeviation: bestChromosome.evaluation?.components?.hoursPenalty || 0,
        matrixChanges: bestChromosome.evaluation?.components?.matrixDeviations || 0,
        stagnation: stagnationCount,
        timeMs: Date.now() - startTime
      });
    }
  }

  // Final progress report
  if (onProgress) {
    onProgress({
      generation: opts.maxGenerations,
      maxGenerations: opts.maxGenerations,
      bestFitness: bestFitness,
      avgFitness: population.reduce((sum, c) => sum + c.fitness, 0) / population.length,
      isValid: bestChromosome.evaluation?.isValid || false,
      constraintViolations: bestChromosome.evaluation?.components?.constraintViolations || 0,
      coverageViolations: bestChromosome.evaluation?.components?.coverageViolations || 0,
      hoursDeviation: bestChromosome.evaluation?.components?.hoursPenalty || 0,
      matrixChanges: bestChromosome.evaluation?.components?.matrixDeviations || 0,
      stagnation: stagnationCount,
      timeMs: Date.now() - startTime,
      complete: true
    });
  }

  return {
    success: true,
    schedule: bestChromosome.schedule,
    fitness: bestFitness,
    evaluation: bestChromosome.evaluation,
    generations: Math.min(opts.maxGenerations, stagnationCount > 0 ? opts.maxGenerations - opts.stagnationLimit + stagnationCount : opts.maxGenerations),
    timeMs: Date.now() - startTime,
    method: 'ga'
  };
};