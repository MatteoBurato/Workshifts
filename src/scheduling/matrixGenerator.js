/**
 * Matrix Generator (Genetic Algorithm)
 *
 * Generates optimal cyclic shift matrices using a Genetic Algorithm.
 *
 * Two modes:
 * 1. Single Matrix: Optimize one matrix while holding others constant
 * 2. Joint: Evolve all matrices together as one individual
 *
 * In both modes, fitness is evaluated using ALL matrices and ALL employees
 * to ensure global optimization.
 */

import { validateSequenceWithConstraints, getValidShiftsForCyclicPosition } from './constraints.js';
import { evaluateFitness } from './ga/fitness.js';
import { solveWithGreedy } from './optimizer.js';
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
 * Helper: Get allowed shifts for a matrix based on assigned employees
 */
const getAllowedShifts = (employees, matrixId, shiftTypes, isDefaultMatrix = false) => {
  const allShiftIds = shiftTypes.map(s => s.id);
  const matrixEmployees = employees.filter(e => 
    e.matrixId === matrixId || (!e.matrixId && isDefaultMatrix)
  );
  
  if (matrixEmployees.length === 0) return allShiftIds;

  let allowed = new Set(allShiftIds);
  for (const emp of matrixEmployees) {
    if (emp.excludedShifts?.length > 0) {
      for (const excluded of emp.excludedShifts) {
        allowed.delete(excluded);
      }
    }
  }
  return Array.from(allowed);
};

/**
 * Helper: Get next position in flattened snake matrix
 */
const getNextPosition = (r, c, rows, cols) => {
  let nextC = c + 1;
  let nextR = r;
  if (nextC >= cols) {
    nextC = 0;
    nextR = r + 1;
    if (nextR >= rows) {
      nextR = 0;
    }
  }
  return [nextR, nextC];
};

/**
 * Generate a random shift
 */
const randomShift = (shiftTypes) => {
  const idx = Math.floor(Math.random() * shiftTypes.length);
  return shiftTypes[idx].id;
};

/**
 * Create a single random matrix
 */
const createSingleMatrix = (rows, cols, shiftTypes) => {
  const matrix = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push(randomShift(shiftTypes));
    }
    matrix.push(row);
  }
  return matrix;
};

/**
 * Create a random individual for single matrix optimization
 */
const createIndividual = (rows, cols, allowedShiftTypes) => {
  return {
    matrix: createSingleMatrix(rows, cols, allowedShiftTypes),
    fitness: Infinity
  };
};

/**
 * Create a random individual for joint multi-matrix optimization
 */
const createMultiMatrixIndividual = (matrixConfigs, allowedShiftTypesMap) => {
  const matrices = {};
  for (const config of matrixConfigs) {
    const allowed = allowedShiftTypesMap[config.id] || [];
    matrices[config.id] = createSingleMatrix(config.rowCount, config.colCount, allowed);
  }
  return { matrices, fitness: Infinity };
};

/**
 * Smart Initialization: Single Matrix
 * Fills the matrix column-by-column, attempting to satisfy *remaining* coverage
 * after accounting for fixed matrices.
 */
const createSmartIndividual = (rows, cols, allowedShiftTypes, context) => {
  const { coverageRules, shiftTypes, allMatrices, targetMatrixId, employees } = context;
  const matrix = Array(rows).fill(null).map(() => Array(cols).fill(null));
  
  // Map rows of THIS matrix to employees (for exclusions)
  const targetMatrixEmps = employees.filter(e => e.matrixId === targetMatrixId);
  // If no specific assignment, we might assume generic employees or no exclusions for unassigned rows
  
  const otherMatrices = allMatrices.filter(m => m.id !== targetMatrixId);

  for (let c = 0; c < cols; c++) {
    // 1. Calculate what is already covered by OTHER fixed matrices in this column
    const currentCoverage = {};
    for (const m of otherMatrices) {
      if (!m.rows) continue;
      for (const row of m.rows) {
        const shift = row[c];
        if (shift) currentCoverage[shift] = (currentCoverage[shift] || 0) + 1;
      }
    }

    // 2. Determine UNMET requirements
    const neededShifts = [];
    for (const rule of coverageRules) {
      if (!rule.enabled) continue;
      
      let count = 0;
      for (const sId of rule.shiftIds) {
        count += (currentCoverage[sId] || 0);
      }
      
      const missing = Math.max(0, rule.min - count);
      for (let k = 0; k < missing; k++) {
        // Pick random valid shift from the rule
        neededShifts.push(rule.shiftIds[Math.floor(Math.random() * rule.shiftIds.length)]);
      }
    }

    // 3. Prepare slots for this column in the target matrix
    const slots = [];
    for (let r = 0; r < rows; r++) {
      const emp = targetMatrixEmps[r]; // Map row index to employee if possible
      slots.push({
        r,
        excluded: emp?.excludedShifts || []
      });
    }
    
    // Shuffle slots
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }

    const assignedIndices = new Set();

    // 4. Fill needed shifts
    for (const shiftId of neededShifts) {
      const slotIndex = slots.findIndex((s, idx) => 
        !assignedIndices.has(idx) && !s.excluded.includes(shiftId)
      );

      if (slotIndex !== -1) {
        const slot = slots[slotIndex];
        matrix[slot.r][c] = shiftId;
        assignedIndices.add(slotIndex);
      }
    }

    // 5. Fill remaining with random allowed
    const allowedIds = allowedShiftTypes.map(s => s.id);
    for (let i = 0; i < slots.length; i++) {
      if (!assignedIndices.has(i)) {
        const slot = slots[i];
        // Filter allowed shifts by exclusion
        const validForSlot = allowedIds.filter(id => !slot.excluded.includes(id));
        if (validForSlot.length > 0) {
          matrix[slot.r][c] = validForSlot[Math.floor(Math.random() * validForSlot.length)];
        } else {
          // Fallback if strict constraints leave no options (shouldn't happen with proper config)
          matrix[slot.r][c] = allowedIds[0]; 
        }
      }
    }
  }

  return { matrix, fitness: Infinity };
};

/**
 * Smart Initialization: Multi Matrix
 * Fills ALL matrices column-by-column to satisfy global coverage.
 */
const createSmartMultiMatrixIndividual = (matrixConfigs, allowedShiftTypesMap, context) => {
  const { coverageRules, employees, shiftTypes } = context;
  const matrices = {};
  
  // Initialize empty structures
  const matrixEmpsMap = {};
  for (const config of matrixConfigs) {
    matrices[config.id] = Array(config.rowCount).fill(null).map(() => Array(config.colCount).fill(null));
    matrixEmpsMap[config.id] = employees.filter(e => e.matrixId === config.id);
  }

  const colCount = matrixConfigs[0].colCount;

  for (let c = 0; c < colCount; c++) {
    // 1. Gather all slots across all matrices for this column
    const allSlots = [];
    for (const config of matrixConfigs) {
      for (let r = 0; r < config.rowCount; r++) {
        const emp = matrixEmpsMap[config.id][r];
        allSlots.push({
          matrixId: config.id,
          r,
          excluded: emp?.excludedShifts || []
        });
      }
    }

    // Shuffle slots
    for (let i = allSlots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allSlots[i], allSlots[j]] = [allSlots[j], allSlots[i]];
    }

    // 2. Identify all required shifts
    const requiredShifts = [];
    for (const rule of coverageRules) {
      if (!rule.enabled) continue;
      for (let k = 0; k < rule.min; k++) {
        requiredShifts.push(rule.shiftIds[Math.floor(Math.random() * rule.shiftIds.length)]);
      }
    }

    const assignedIndices = new Set();

    // 3. Assign required shifts
    for (const shiftId of requiredShifts) {
      // Find a suitable slot
      const slotIndex = allSlots.findIndex((s, idx) => 
        !assignedIndices.has(idx) && 
        !s.excluded.includes(shiftId) &&
        // Also check if matrix allows this shift type globally
        (allowedShiftTypesMap[s.matrixId] || []).some(as => as.id === shiftId)
      );

      if (slotIndex !== -1) {
        const slot = allSlots[slotIndex];
        matrices[slot.matrixId][slot.r][c] = shiftId;
        assignedIndices.add(slotIndex);
      }
    }

    // 4. Fill remaining slots
    for (let i = 0; i < allSlots.length; i++) {
      if (!assignedIndices.has(i)) {
        const slot = allSlots[i];
        const allowedForMatrix = (allowedShiftTypesMap[slot.matrixId] || shiftTypes).map(s => s.id);
        const validForSlot = allowedForMatrix.filter(id => !slot.excluded.includes(id));
        
        if (validForSlot.length > 0) {
          matrices[slot.matrixId][slot.r][c] = validForSlot[Math.floor(Math.random() * validForSlot.length)];
        } else {
          matrices[slot.matrixId][slot.r][c] = allowedForMatrix[0] || shiftTypes[0].id;
        }
      }
    }
  }

  return { matrices, fitness: Infinity };
};

/**
 * Calculate fitness of a single matrix in the context of ALL matrices
 * ... (omitted JSDoc for brevity)
 */
const calculateSingleMatrixFitness = (targetMatrix, targetMatrixId, context) => {
  const {
    shiftTypes, constraints, coverageRules, employees,
    year, month, allMatrices, matrixMap: baseMatrixMap
  } = context;

  let score = 0;
  const snake = targetMatrix.flat();
  const colCount = targetMatrix[0]?.length || 7;
  const extendedSnake = [...snake, ...snake.slice(0, colCount)];
  const errors = validateSequenceWithConstraints(extendedSnake, constraints, shiftTypes);
  score += errors.length * 10000;

  const updatedMatrices = allMatrices.map(m => {
    if (m.id === targetMatrixId) {
      return { ...m, rows: targetMatrix };
    }
    return m;
  });

  const matrixMap = {};
  for (const m of updatedMatrices) {
    matrixMap[m.id] = m.rows;
  }

  const defaultMatrix = updatedMatrices[0]?.rows || targetMatrix;
  const daysInMonth = getDaysInMonth(year, month);

  const greedyResult = solveWithGreedy({
    year,
    month,
    daysInMonth,
    employees,
    shiftTypes,
    matrices: updatedMatrices,
    matrixMap,
    defaultMatrix,
    previousMonthSchedule: null,
    cycleLength: defaultMatrix[0]?.length || 7
  });

  const baselineSchedule = {};
  for (const empId of Object.keys(greedyResult.schedule)) {
    baselineSchedule[empId] = greedyResult.schedule[empId].shifts;
  }

  const evaluationContext = {
    employees,
    shiftTypes,
    constraints,
    coverageRules,
    baselineShifts: baselineSchedule,
    daysInMonth
  };

  const evalResult = evaluateFitness({ schedule: baselineSchedule }, evaluationContext);
  score += evalResult.fitness;

  return score;
};

const calculateMultiMatrixFitness = (matrices, context) => {
  const { shiftTypes, constraints, coverageRules, employees, year, month, matrixConfigs } = context;

  let score = 0;
  for (const matrix of Object.values(matrices)) {
    const snake = matrix.flat();
    const colCount = matrix[0]?.length || 7;
    const extendedSnake = [...snake, ...snake.slice(0, colCount)];
    const errors = validateSequenceWithConstraints(extendedSnake, constraints, shiftTypes);
    score += errors.length * 10000;
  }

  const matricesArray = matrixConfigs.map(config => ({
    id: config.id,
    name: config.name,
    rows: matrices[config.id]
  }));

  const matrixMap = { ...matrices };
  const defaultMatrix = matricesArray[0]?.rows || Object.values(matrices)[0];
  const daysInMonth = getDaysInMonth(year, month);

  const greedyResult = solveWithGreedy({
    year,
    month,
    daysInMonth,
    employees,
    shiftTypes,
    matrices: matricesArray,
    matrixMap,
    defaultMatrix,
    previousMonthSchedule: null,
    cycleLength: defaultMatrix[0]?.length || 7
  });

  const baselineSchedule = {};
  for (const empId of Object.keys(greedyResult.schedule)) {
    baselineSchedule[empId] = greedyResult.schedule[empId].shifts;
  }

  const evaluationContext = {
    employees,
    shiftTypes,
    constraints,
    coverageRules,
    baselineShifts: baselineSchedule,
    daysInMonth
  };

  const evalResult = evaluateFitness({ schedule: baselineSchedule }, evaluationContext);
  score += evalResult.fitness;

  return score;
};

const crossover = (p1, p2) => {
  const rows = p1.matrix.length;
  const childMatrix = [];
  for (let r = 0; r < rows; r++) {
    childMatrix.push(Math.random() < 0.5 ? [...p1.matrix[r]] : [...p2.matrix[r]]);
  }
  return { matrix: childMatrix, fitness: Infinity };
};

const crossoverMultiMatrix = (p1, p2) => {
  const child = { matrices: {}, fitness: Infinity };
  for (const matrixId of Object.keys(p1.matrices)) {
    const m1 = p1.matrices[matrixId];
    const m2 = p2.matrices[matrixId];
    const rows = m1.length;
    child.matrices[matrixId] = [];
    for (let r = 0; r < rows; r++) {
      child.matrices[matrixId].push(
        Math.random() < 0.5 ? [...m1[r]] : [...m2[r]]
      );
    }
  }
  return child;
};

const mutate = (ind, shiftTypes, rate, constraints = [], allowedShiftTypes = null) => {
  const rows = ind.matrix.length;
  const cols = ind.matrix[0].length;
  const availableShifts = allowedShiftTypes || shiftTypes;

  const mustFollowMap = {};
  for (const c of constraints) {
    if (c.enabled && c.type === 'must_follow') {
      mustFollowMap[c.shiftA] = c.shiftB;
    }
  }

  // 1. Cell Mutation
  for (let r = 0; r < rows; r++) {
    if (Math.random() < rate) {
      const mutationCount = Math.random() < 0.5 ? 1 : 2;

      for (let i = 0; i < mutationCount; i++) {
        const c = Math.floor(Math.random() * cols);
        const original = ind.matrix[r][c];
        
          // Exploration vs Exploitation
          // 2% chance to ignore sequence constraints to escape local optima
          const checkConstraints = Math.random() > 0.02;

        const validShifts = (checkConstraints && constraints.length > 0)
          ? getValidShiftsForCyclicPosition(ind.matrix[r], c, constraints, availableShifts)
          : null;

        let candidate;
        if (validShifts && validShifts.length > 0) {
          candidate = validShifts[Math.floor(Math.random() * validShifts.length)];
        } else {
          candidate = randomShift(availableShifts);
        }
        
        ind.matrix[r][c] = candidate;
        
        // Smart Follower Insertion (N -> SN)
        if (mustFollowMap[candidate]) {
           const follower = mustFollowMap[candidate];
           if (availableShifts.some(s => s.id === follower)) {
             const [nextR, nextC] = getNextPosition(r, c, rows, cols);
             ind.matrix[nextR][nextC] = follower;
           }
        }
        
        // Smart Follower Deletion (N -> M, cleanup SN)
        if (mustFollowMap[original] && candidate !== original) {
           const oldFollower = mustFollowMap[original];
           const [nextR, nextC] = getNextPosition(r, c, rows, cols);
           
           if (ind.matrix[nextR][nextC] === oldFollower) {
              if (!mustFollowMap[candidate]) {
                  // Only replace if new candidate doesn't enforce its own follower
                  // (If it does, Insertion block handled it)
                  ind.matrix[nextR][nextC] = randomShift(availableShifts); 
              }
           }
        }
      }
    }
  }

  // 2. Swap Mutation with Block Logic
  const totalCells = rows * cols;
  const swapCount = Math.ceil(totalCells * rate * 0.5);

  for (let i = 0; i < swapCount; i++) {
    const r1 = Math.floor(Math.random() * rows);
    const c1 = Math.floor(Math.random() * cols);
    const r2 = Math.floor(Math.random() * rows);
    const c2 = Math.floor(Math.random() * cols);

    const shift1 = ind.matrix[r1][c1];
    const shift2 = ind.matrix[r2][c2];

    const hasFollower1 = !!mustFollowMap[shift1];
    const hasFollower2 = !!mustFollowMap[shift2];

    if (hasFollower1 || hasFollower2) {
      // Block Swap Logic
      // If we swap a shift with a follower, we try to swap the follower too
      // to preserve the sequence at the new location
      
      const [nextR1, nextC1] = getNextPosition(r1, c1, rows, cols);
      const [nextR2, nextC2] = getNextPosition(r2, c2, rows, cols);
      
      const nextShift1 = ind.matrix[nextR1][nextC1];
      const nextShift2 = ind.matrix[nextR2][nextC2];

      // Perform Block Swap: (r1,c1)+(nextR1,nextC1) <-> (r2,c2)+(nextR2,nextC2)
      ind.matrix[r1][c1] = shift2;
      ind.matrix[nextR1][nextC1] = nextShift2;
      
      ind.matrix[r2][c2] = shift1;
      ind.matrix[nextR2][nextC2] = nextShift1;
      
    } else {
      // Normal Swap
      ind.matrix[r1][c1] = shift2;
      ind.matrix[r2][c2] = shift1;
    }
  }

  // 3. Row Rotation Mutation
  for (let r = 0; r < rows; r++) {
    if (Math.random() < rate * 0.5) {
      const shiftAmount = Math.floor(Math.random() * (cols - 1)) + 1;
      const row = ind.matrix[r];
      ind.matrix[r] = [...row.slice(shiftAmount), ...row.slice(0, shiftAmount)];
    }
  }
};

const mutateMultiMatrix = (ind, shiftTypes, rate, constraints = [], allowedShiftTypesMap = {}) => {
  const mustFollowMap = {};
  for (const c of constraints) {
    if (c.enabled && c.type === 'must_follow') {
      mustFollowMap[c.shiftA] = c.shiftB;
    }
  }

  // 1. Per-matrix cell mutation
  for (const [matrixId, matrix] of Object.entries(ind.matrices)) {
    const rows = matrix.length;
    const cols = matrix[0]?.length;
    if (!cols) continue;
    
    const availableShifts = allowedShiftTypesMap[matrixId] || shiftTypes;

    for (let r = 0; r < rows; r++) {
      if (Math.random() < rate) {
        const mutationCount = Math.random() < 0.5 ? 1 : 2;

        for (let i = 0; i < mutationCount; i++) {
          const c = Math.floor(Math.random() * cols);
          const original = matrix[r][c];

            // Exploration vs Exploitation
          // 2% chance to ignore sequence constraints to escape local optima
          const checkConstraints = Math.random() > 0.02;

          const validShifts = (checkConstraints && constraints.length > 0)
            ? getValidShiftsForCyclicPosition(matrix[r], c, constraints, availableShifts)
            : null;

          let candidate;
          if (validShifts && validShifts.length > 0) {
            candidate = validShifts[Math.floor(Math.random() * validShifts.length)];
          } else {
            candidate = randomShift(availableShifts);
          }
          
          matrix[r][c] = candidate;
          
          // Smart Follower Insertion
          if (mustFollowMap[candidate]) {
             const follower = mustFollowMap[candidate];
             if (availableShifts.some(s => s.id === follower)) {
               const [nextR, nextC] = getNextPosition(r, c, rows, cols);
               matrix[nextR][nextC] = follower;
             }
          }

          // Smart Follower Deletion
          if (mustFollowMap[original] && candidate !== original) {
             const oldFollower = mustFollowMap[original];
             const [nextR, nextC] = getNextPosition(r, c, rows, cols);
             
             if (matrix[nextR][nextC] === oldFollower) {
                if (!mustFollowMap[candidate]) {
                    matrix[nextR][nextC] = randomShift(availableShifts); 
                }
             }
          }
        }
      }
    }
  }

  // 2. Cross-matrix Swap Mutation
  const matrixIds = Object.keys(ind.matrices);
  if (matrixIds.length === 0) return;

  const totalCells = matrixIds.reduce((sum, id) => {
    const m = ind.matrices[id];
    return sum + (m.length * (m[0]?.length || 0));
  }, 0);

  const swapCount = Math.ceil(totalCells * rate * 0.5);

  for (let i = 0; i < swapCount; i++) {
    const m1 = matrixIds[Math.floor(Math.random() * matrixIds.length)];
    const mat1 = ind.matrices[m1];
    if (!mat1.length || !mat1[0]?.length) continue;
    const r1 = Math.floor(Math.random() * mat1.length);
    const c1 = Math.floor(Math.random() * mat1[0].length);
    const m1AllowedIds = (allowedShiftTypesMap[m1] || shiftTypes).map(s => s.id);

    const m2 = matrixIds[Math.floor(Math.random() * matrixIds.length)];
    const mat2 = ind.matrices[m2];
    if (!mat2.length || !mat2[0]?.length) continue;
    const r2 = Math.floor(Math.random() * mat2.length);
    const c2 = Math.floor(Math.random() * mat2[0].length);
    const m2AllowedIds = (allowedShiftTypesMap[m2] || shiftTypes).map(s => s.id);

    const shift1 = mat1[r1][c1];
    const shift2 = mat2[r2][c2];

    const hasFollower1 = !!mustFollowMap[shift1];
    const hasFollower2 = !!mustFollowMap[shift2];

    if ((hasFollower1 || hasFollower2) && mat1.length === mat2.length && mat1[0].length === mat2[0].length) {
       // Only block swap if dimensions match (simpler logic for now)
       const [nextR1, nextC1] = getNextPosition(r1, c1, mat1.length, mat1[0].length);
       const [nextR2, nextC2] = getNextPosition(r2, c2, mat2.length, mat2[0].length);
       
       const nextShift1 = mat1[nextR1][nextC1];
       const nextShift2 = mat2[nextR2][nextC2];
       
       // Check allowed for BOTH cells in the block
       const s1AllowedInM2 = m2AllowedIds.includes(shift1) && m2AllowedIds.includes(nextShift1);
       const s2AllowedInM1 = m1AllowedIds.includes(shift2) && m1AllowedIds.includes(nextShift2);
       
       if (s1AllowedInM2 && s2AllowedInM1) {
          mat1[r1][c1] = shift2;
          mat1[nextR1][nextC1] = nextShift2;
          
          mat2[r2][c2] = shift1;
          mat2[nextR2][nextC2] = nextShift1;
       }
    } else {
        // Normal swap
        if (m1AllowedIds.includes(shift2) && m2AllowedIds.includes(shift1)) {
          mat1[r1][c1] = shift2;
          mat2[r2][c2] = shift1;
        }
    }
  }

  // 3. Row Rotation Mutation
  for (const matrix of Object.values(ind.matrices)) {
    const rows = matrix.length;
    const cols = matrix[0]?.length;
    if (!cols) continue;

    for (let r = 0; r < rows; r++) {
      if (Math.random() < rate * 0.5) {
        const shiftAmount = Math.floor(Math.random() * (cols - 1)) + 1;
        const row = matrix[r];
        matrix[r] = [...row.slice(shiftAmount), ...row.slice(0, shiftAmount)];
      }
    }
  }

  // 4. Row Shuffle Mutation
  if (Math.random() < rate) {
    const m1 = matrixIds[Math.floor(Math.random() * matrixIds.length)];
    const m2 = matrixIds[Math.floor(Math.random() * matrixIds.length)];
    const mat1 = ind.matrices[m1];
    const mat2 = ind.matrices[m2];

    if (mat1.length > 0 && mat2.length > 0) {
      const r1 = Math.floor(Math.random() * mat1.length);
      const r2 = Math.floor(Math.random() * mat2.length);

      const m1AllowedIds = (allowedShiftTypesMap[m1] || shiftTypes).map(s => s.id);
      const m2AllowedIds = (allowedShiftTypesMap[m2] || shiftTypes).map(s => s.id);
      
      const row1Compatible = mat1[r1].every(s => m2AllowedIds.includes(s));
      const row2Compatible = mat2[r2].every(s => m1AllowedIds.includes(s));

      if (mat1[r1].length === mat2[r2].length && row1Compatible && row2Compatible) {
        const tempRow = mat1[r1];
        mat1[r1] = mat2[r2];
        mat2[r2] = tempRow;
      }
    }
  }
};

// ... generateOptimalMatrix and generateOptimalMatricesJointly ...
export const generateOptimalMatrix = ({
  targetMatrixId,
  allMatrices,
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

  const config = {
    ...DEFAULT_GA_CONFIG,
    ...options
  };

  const targetMatrix = allMatrices.find(m => m.id === targetMatrixId);
  const numRows = rowCount || targetMatrix?.rows?.length || (employees ? employees.length : 8);
  const numCols = columnCount || targetMatrix?.rows?.[0]?.length || 7;

  const isDefault = (targetMatrixId === allMatrices[0].id);
  const allowedIds = getAllowedShifts(employees || [], targetMatrixId, shiftTypes, isDefault);
  const allowedShiftTypes = shiftTypes.filter(s => allowedIds.includes(s.id));

  const matrixMap = {};
  for (const m of allMatrices) {
    matrixMap[m.id] = m.rows;
  }

  const context = {
    shiftTypes,
    constraints,
    coverageRules,
    employees: employees || [],
    year,
    month,
    allMatrices,
    matrixMap,
    targetMatrixId
  };

  let population = [];

  if (config.useCurrentAsSeed && targetMatrix && targetMatrix.rows && targetMatrix.rows.length === numRows && targetMatrix.rows[0].length === numCols) {
    const seedInd = {
      matrix: targetMatrix.rows.map(row => [...row]), 
      fitness: Infinity
    };
    seedInd.fitness = calculateSingleMatrixFitness(seedInd.matrix, targetMatrixId, context);
    population.push(seedInd);
  }

  while (population.length < config.POPULATION_SIZE) {
    const ind = createSmartIndividual(numRows, numCols, allowedShiftTypes, context);
    ind.fitness = calculateSingleMatrixFitness(ind.matrix, targetMatrixId, context);
    population.push(ind);
  }

  population.sort((a, b) => a.fitness - b.fitness);
  let best = population[0];
  let stagnationCount = 0;

  let generation = 0;
  while (generation < config.MAX_GENERATIONS) {
    if (Date.now() - startTime > config.TIMEOUT_MS) {
      console.log('[MatrixGA] Terminated: timeout at gen', generation);
      break;
    }

    if (best.fitness === 0) {
      console.log('[MatrixGA] Terminated: target fitness achieved at gen', generation);
      break;
    }

    if (stagnationCount >= config.STAGNATION_LIMIT) {
      console.log('[MatrixGA] Terminated: stagnation at gen', generation);
      break;
    }

    const newPop = [];

    for (let i = 0; i < config.ELITE_COUNT; i++) {
      newPop.push(population[i]);
    }

    while (newPop.length < config.POPULATION_SIZE) {
      const p1 = population[Math.floor(Math.random() * (config.POPULATION_SIZE / 2))];
      const p2 = population[Math.floor(Math.random() * (config.POPULATION_SIZE / 2))];

      const child = crossover(p1, p2);
      mutate(child, shiftTypes, config.MUTATION_RATE, constraints, allowedShiftTypes);
      child.fitness = calculateSingleMatrixFitness(child.matrix, targetMatrixId, context);
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

export const generateOptimalMatricesJointly = ({
  allMatrices,
  shiftTypes,
  constraints,
  coverageRules,
  columnCount = 7,
  employees,
  year = new Date().getFullYear(),
  month = new Date().getMonth(),
  options = {},
  onProgress
}) => {
  const startTime = Date.now();

  const config = {
    ...DEFAULT_GA_CONFIG,
    ...options
  };

  const matrixConfigs = allMatrices.map(m => ({
    id: m.id,
    name: m.name,
    rowCount: m.rows?.length || (employees ? employees.length : 8),
    colCount: m.rows?.[0]?.length || columnCount
  }));

  const context = {
    shiftTypes,
    constraints,
    coverageRules,
    employees: employees || [],
    year,
    month,
    matrixConfigs
  };

  const allowedShiftTypesMap = {};
  for (const m of allMatrices) {
    const isDefault = (m.id === allMatrices[0].id);
    const allowedIds = getAllowedShifts(employees || [], m.id, shiftTypes, isDefault);
    allowedShiftTypesMap[m.id] = shiftTypes.filter(s => allowedIds.includes(s.id));
  }

  let population = [];

  if (config.useCurrentAsSeed) {
    const seedMatrices = {};
    let validSeed = true;

    for (const m of allMatrices) {
      if (!m.rows) {
        validSeed = false;
        break;
      }
      seedMatrices[m.id] = m.rows.map(row => [...row]); 
    }

    if (validSeed) {
      const seedInd = { matrices: seedMatrices, fitness: Infinity };
      seedInd.fitness = calculateMultiMatrixFitness(seedInd.matrices, context);
      population.push(seedInd);
    }
  }

  while (population.length < config.POPULATION_SIZE) {
    const ind = createSmartMultiMatrixIndividual(matrixConfigs, allowedShiftTypesMap, context);
    ind.fitness = calculateMultiMatrixFitness(ind.matrices, context);
    population.push(ind);
  }

  population.sort((a, b) => a.fitness - b.fitness);
  let best = population[0];
  let stagnationCount = 0;

  let generation = 0;
  while (generation < config.MAX_GENERATIONS) {
    if (Date.now() - startTime > config.TIMEOUT_MS) {
      console.log('[MatrixGA-Joint] Terminated: timeout at gen', generation);
      break;
    }

    if (best.fitness === 0) {
      console.log('[MatrixGA-Joint] Terminated: target fitness achieved at gen', generation);
      break;
    }

    if (stagnationCount >= config.STAGNATION_LIMIT) {
      console.log('[MatrixGA-Joint] Terminated: stagnation at gen', generation);
      break;
    }

    const newPop = [];

    for (let i = 0; i < config.ELITE_COUNT; i++) {
      newPop.push(population[i]);
    }

    while (newPop.length < config.POPULATION_SIZE) {
      const p1 = population[Math.floor(Math.random() * (config.POPULATION_SIZE / 2))];
      const p2 = population[Math.floor(Math.random() * (config.POPULATION_SIZE / 2))];

      const child = crossoverMultiMatrix(p1, p2);
      mutateMultiMatrix(child, shiftTypes, config.MUTATION_RATE, constraints, allowedShiftTypesMap);
      child.fitness = calculateMultiMatrixFitness(child.matrices, context);
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
        message: `Generazione ${generation}: Migliore Fitness ${Math.round(best.fitness)}`,
        matricesCount: matrixConfigs.length
      });
    }
  }

  return best.matrices;
};