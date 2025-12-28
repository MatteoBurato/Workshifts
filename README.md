# Turni OSS - Advanced Shift Scheduler

**Turni OSS** is a specialized web application designed to automate the complex task of scheduling work shifts for healthcare cooperatives, nurses, and OSS (Operatori Socio Sanitari). It replaces manual spreadsheet management with a powerful **Genetic Algorithm (GA)** optimizer. This app is in Italian, as it is primarily targeted at Italian healthcare facilities.

## Key Features

### Facility & Configuration
- **Customizable Structure**: Define facility parameters, cycle lengths (e.g., 7 days), and staffing requirements per shift.
- **Shift Types**: Configure custom shift types (Morning, Afternoon, Night, Long Night, etc.) with specific hours, colors, and coverage rules.
- **Requirements**: Set minimum staffing levels for every shift type on a daily basis.

### Employee Management
- **Roster Management**: Manage staff details, contract hours, and specific constraints (e.g., "No Nights").
- **Multi-Matrix Support**: Assign employees to different cyclic matrices (e.g., full-time vs part-time patterns).
- **Workload Balancing**: The optimizer actively tries to balance worked hours against contractual hours.

### Matrix Editor & Generator
- **Visual Editor**: Interactive grid to define base cyclic rosters (patterns).
- **Multi-Matrix System**: Support for multiple matrices with per-employee assignment.
- **Optimal Generation**: Genetic Algorithm that generates valid cyclic matrices, optimizing for both internal consistency and monthly schedule validity.
- **Import/Export**: Support for Excel/CSV import and manual adjustments.

### Constraints Engine
The application supports a wide range of hard constraints:
- **Sequences**: Must Follow / Cannot Follow (e.g., `Night` cannot be followed by `Morning`).
- **Consecutive Days**: Max N consecutive days on a specific shift.
- **Gaps**: Minimum days off between specific shifts.
- **Cyclic Logic**: Constraints are respected even when wrapping around the end of the matrix cycle.

### High-Performance Scheduling
- **Genetic Algorithms**: Uses specialized GAs for both Matrix and Schedule optimization.
- **Web Workers**: All heavy computation runs in background threads to keep the UI responsive.
- **Real-time Feedback**: Visualization of fitness improvement and stagnation during optimization.

## Technical Architecture

The project is built with **React 18** and **Vite**.

### Directory Structure
```
src/
├── components/           # React UI Components
│   ├── MatrixEditor.jsx      # Roster pattern editor
│   ├── LoadingOverlay.jsx    # Progress visualization
│   └── ...
├── scheduling/           # Core Scheduling Module
│   ├── index.js              # Public API exports
│   ├── generator.js          # Monthly schedule orchestrator
│   ├── optimizer.js          # Greedy + GA optimization engine
│   ├── matrixGenerator.js    # Matrix optimization (GA)
│   ├── constraints.js        # Constraint validation logic
│   ├── evaluator.js          # Post-generation validation
│   ├── worker.js             # Web Worker entry point
│   └── ga/                   # Genetic Algorithm module
│       ├── index.js              # GA public API
│       ├── geneticAlgorithm.js   # Schedule evolution loop
│       ├── fitness.js            # Fitness evaluation
│       └── operators.js          # Selection, crossover, mutation
├── utils/                # Utility functions
└── App.jsx               # Main application state
```

### Scheduling Pipeline

The scheduling system uses a **two-tier optimization** approach:

```
generateMonthlySchedule()
    │
    ▼
optimizeSchedule()
    │
    ├─► [useGA=true] solveWithGA()
    │       │
    │       ├─► solveWithGreedy()  ← Generates baseline
    │       │       • Global phase synchronization
    │       │       • Matrix unraveling (snake pattern)
    │       │       • Continuity scoring
    │       │
    │       └─► runGeneticAlgorithm()
    │               • Population initialized from baseline
    │               • Evolutionary optimization
    │               • Returns optimized schedule
    │
    └─► [useGA=false or fallback] solveWithGreedy()
            └─► Returns fast heuristic schedule

    │
    ▼
evaluateSchedule()  ← Independent validation
```

### Algorithm Details

#### 1. Greedy Solver (`solveWithGreedy`)

The greedy solver is the **single source of truth** for matrix-to-schedule unraveling:

**Global Phase Synchronization** (Two-Pass Algorithm):
1. **Pass 1**: Calculate preliminary row assignments for each employee
2. **Global Vote**: Employees vote for their optimal starting column (phase)
3. **Consensus**: Select dominant phase if sufficient agreement exists
4. **Pass 2**: Re-assign all employees aligned to the global phase

**Matrix Unraveling** (Snake Pattern):
- Treats the matrix as a flattened continuous sequence
- Each employee gets coordinates: `(matrixRow, dayOffset)`
- Generates shifts: `pattern[(startIndex + day + DOW) % patternLength]`

**Continuity Scoring**:
- Matches against last 28 days of previous month
- Computes score 0-1 for row/offset combinations
- Prefers assignments that minimize schedule disruption

#### 2. Schedule Optimization (`runGeneticAlgorithm`)

**Goal:** Optimize the monthly schedule starting from the greedy baseline.

**Initialization:**
- First individual: exact greedy baseline
- Remaining population: perturbed variations

**Fitness Function** (lower is better):
| Component | Weight | Description |
|-----------|--------|-------------|
| Constraint Violations | 10,000 | Per sequence violation (hard) |
| Coverage Violations | 10,000 | Per missing required staff (hard) |
| Hours Under | 15 | Per hour below contract |
| Hours Over | 8 | Per hour above contract |
| Matrix Deviation | 3 | Per shift changed from baseline |

**Operators:**
- **Tournament Selection**: Size 5, picks best from random subset
- **Crossover**: Single-point, uniform, and employee-level variants
- **Guided Mutation**: Probabilistically reverts to baseline (70% adherence)
- **Swap Mutation**: Exchanges shifts between employees for coverage

**Termination:**
- Max generations reached (default: 10,000)
- Target fitness achieved (0 = perfect)
- Stagnation limit (1,000 generations without improvement)
- Timeout (default: 3,000,000ms)

#### 3. Matrix Optimization (`generateOptimalMatrix`)

**Goal:** Find cyclic shift patterns that naturally produce valid schedules.

**Two Modes:**
1. **Single Matrix**: Optimize one matrix while others remain fixed
2. **Joint**: Evolve all matrices together as interconnected genes

**Fitness Evaluation:**
1. Validate rows for internal constraint violations
2. Generate baseline schedule using `solveWithGreedy`
3. Evaluate baseline fitness (coverage, hours, constraints)

**Rationale:** A "perfect" matrix produces zero violations when unraveled. If the baseline is already valid, the Schedule GA has minimal work.

### Constraint Types

| Type | Description | Example |
|------|-------------|---------|
| `must_follow` | Shift A must immediately follow Shift B | `Rest` must follow `Night` |
| `cannot_follow` | Shift A cannot immediately follow Shift B | `Morning` cannot follow `Night` |
| `must_precede` | Shift A must come before Shift B | |
| `cannot_precede` | Shift A cannot come before Shift B | |
| `max_consecutive` | Maximum N consecutive days of Shift | Max 5 consecutive `Night` |
| `max_consecutive_without` | Maximum N days without Shift | Max 7 days without `Rest` |
| `min_gap` | Minimum N days between Shift occurrences | Min 2 days between `Night` |

### Fitness Landscape

**Hard Constraints** (must satisfy):
- Sequence constraint violations
- Coverage requirements

**Soft Constraints** (optimize):
- Hours balance (asymmetric: under-hours penalized more)
- Matrix pattern fidelity

**Validity:** A schedule is valid when `constraintViolations === 0 && coverageViolations === 0`

## Private Presets

The application supports a file-based preset system for sensitive data that should not be committed to version control.

1. Export your configuration from the app.
2. Save the JSON file in `public/presets/`.
3. Add the filename to `PRESET_FILES` in `src/constants/index.js`.
4. (The `public/presets/` folder is `.gitignored` by default, except for examples).

## Getting Started

### Prerequisites
- Node.js (LTS recommended)

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Building for Production

```bash
# Build the application
npm run build

# Preview the build
npm run preview
```

## License
MIT License - Free for personal and commercial use.
