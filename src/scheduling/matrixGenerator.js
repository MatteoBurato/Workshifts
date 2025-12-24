/**
 * Matrix Generator (Genetic Algorithm)
 * 
 * Generates an optimal cyclic shift matrix using a Genetic Algorithm.
 * Replaces the legacy CSP implementation.
 */

import { validateSequenceWithConstraints } from './constraints.js';
import { evaluateFitness } from './ga/fitness.js';
import { generateBaselineSchedule } from './ga/geneticAlgorithm.js';
import { getDaysInMonth } from '../utils/dates.js';

/**
 * GA Parameters
 */
export const DEFAULT_GA_CONFIG = {
  POPULATION_SIZE: 1000,
  MAX_GENERATIONS: 50000,
  ELITE_COUNT: 50,
  MUTATION_RATE: 0.08,
  TIMEOUT_MS: 3000000,
  STAGNATION_LIMIT: 1000
};

/**
 * Generate a random shift
 */
const randomShift = (shiftTypes) => {
  const idx = Math.floor(Math.random() * shiftTypes.length);
  return shiftTypes[idx].id;
};

/**
 * Create a random individual (Matrix)
 */
const createIndividual = (rows, cols, shiftTypes) => {
  const matrix = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push(randomShift(shiftTypes));
    }
    matrix.push(row);
  }
  return {
    matrix,
    fitness: Infinity
  };
};

/**
 * Calculate fitness of a matrix
 * Lower is better
 */
const calculateFitness = (matrix, context) => {
  const { shiftTypes, constraints, coverageRules, employees, year, month } = context;
  let score = 0;
  
  // 1. Row Constraints (Hard - heavily penalized)
  // We check each row for internal consistency and cyclic wrapping
  for (const row of matrix) {
    // Extend row to check cyclic constraints (e.g., max 5 consecutive days)
    // We extend by 7 days to cover most gap/consecutive constraints
    const extendedRow = [...row, ...row.slice(0, 7)];
    const errors = validateSequenceWithConstraints(extendedRow, constraints, shiftTypes);
    
    // Only count errors that start within the original row or involve the wrap
    score += errors.length * 1000;
  }
  
  // 2. Evaluate as Monthly Schedule Baseline (Nested Evaluation)
  // This captures employee-specific constraints (e.g. No Nights) and hours balance
  const daysInMonth = getDaysInMonth(year, month);
  const baselineSchedule = generateBaselineSchedule({
    employees,
    matrix,
    daysInMonth,
    year,
    month
  });

  const evaluationContext = {
    employees,
    shiftTypes,
    constraints,
    coverageRules,
    baselineShifts: baselineSchedule, // Comparing to itself as baseline means 0 matrix deviations
    daysInMonth
  };

  const evalResult = evaluateFitness({ schedule: baselineSchedule }, evaluationContext);
  
  // Add the schedule evaluation score (including hours and coverage)
  score += evalResult.fitness;
  
  return score;
};

/**
 * Crossover two matrices
 */
const crossover = (p1, p2) => {
  const rows = p1.matrix.length;
  const childMatrix = [];
  
  // Row-based crossover
  for (let r = 0; r < rows; r++) {
    childMatrix.push(Math.random() < 0.5 ? [...p1.matrix[r]] : [...p2.matrix[r]]);
  }
  
  return { matrix: childMatrix, fitness: Infinity };
};

/**
 * Mutate a matrix
 * NOTE: Unlike Schedule Optimization, this uses purely random mutation.
 * There is no "baseline" to revert to, as we are evolving the baseline itself.
 */
const mutate = (ind, shiftTypes, rate) => {
  const rows = ind.matrix.length;
  const cols = ind.matrix[0].length;
  
  for (let r = 0; r < rows; r++) {
    if (Math.random() < rate) {
      // 50% chance to mutate a single cell, 50% to shuffle a row
      if (Math.random() < 0.5) {
        const c = Math.floor(Math.random() * cols);
        ind.matrix[r][c] = randomShift(shiftTypes);
      } else {
        // Randomly change a few shifts in the row
        for (let i = 0; i < 2; i++) {
          const c = Math.floor(Math.random() * cols);
          ind.matrix[r][c] = randomShift(shiftTypes);
        }
      }
    }
  }
};

/**
 * Generate optimal matrix using GA
 */
export const generateOptimalMatrix = ({
  shiftTypes,
  constraints,
  coverageRules,
  columnCount = 7,
  employees,
  year = new Date().getFullYear(),
  month = new Date().getMonth(),
  rowCount = null,
  options = {},
  onProgress
}) => {
  const startTime = Date.now();

  // Merge defaults with options
  const config = {
    ...DEFAULT_GA_CONFIG,
    ...options
  };

  // Use employee count if available, otherwise estimate
  const numRows = rowCount || (employees ? employees.length : Math.max(columnCount, 8));

  const context = {
    shiftTypes,
    constraints,
    coverageRules,
    employees: employees || [],
    year,
    month
  };

  // Initialize population
  let population = [];
  for (let i = 0; i < config.POPULATION_SIZE; i++) {
    const ind = createIndividual(numRows, columnCount, shiftTypes);
    ind.fitness = calculateFitness(ind.matrix, context);
    population.push(ind);
  }
  
  population.sort((a, b) => a.fitness - b.fitness);
  let best = population[0];
  let stagnationCount = 0;
  
  // Evolution loop
  let generation = 0;
  while (generation < config.MAX_GENERATIONS) {
    if (Date.now() - startTime > config.TIMEOUT_MS) {
      console.log('[MatrixGA] Terminated: timeout at gen', generation);
      break;
    }
    
    if (best.fitness === 0) {
      console.log('[MatrixGA] Terminated: target fitness achieved at gen', generation);
      break; // Perfect score
    }
    
    if (stagnationCount >= config.STAGNATION_LIMIT) {
      console.log('[MatrixGA] Terminated: stagnation at gen', generation, 'stagnationCount:', stagnationCount);
      break;
    }
    
    const newPop = [];
    
    // Elitism
    for (let i = 0; i < config.ELITE_COUNT; i++) {
      newPop.push(population[i]);
    }
    
    // Offspring
    while (newPop.length < config.POPULATION_SIZE) {
      const p1 = population[Math.floor(Math.random() * (config.POPULATION_SIZE / 2))]; // Top 50% selection
      const p2 = population[Math.floor(Math.random() * (config.POPULATION_SIZE / 2))];
      
      const child = crossover(p1, p2);
      mutate(child, shiftTypes, config.MUTATION_RATE);
      child.fitness = calculateFitness(child.matrix, context);
      newPop.push(child);
    }
    
    population = newPop.sort((a, b) => a.fitness - b.fitness);
    
    if (population[0].fitness < best.fitness) {
      best = population[0];
      stagnationCount = 0;
    } else {
      stagnationCount++;
    }
    
    generation++;
    
    if (onProgress && generation % 5 === 0) {
      onProgress({
        generation,
        maxGenerations: config.MAX_GENERATIONS,
        bestFitness: best.fitness,
        stagnation: stagnationCount,
        message: `Generazione ${generation}: Migliore Fitness ${Math.round(best.fitness)}`
      });
    }
  }
  
  return best.matrix;
};