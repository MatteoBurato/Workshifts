# Turni OSS - Advanced Shift Scheduler

**Turni OSS** is a specialized web application designed to automate the complex task of scheduling work shifts for healthcare cooperatives, nurses, and OSS (Operatori Socio Sanitari). It replaces manual spreadsheet management with a powerful **Constraint Satisfaction Problem (CSP)** solver. This app is in Italian, as it is primarily targeted at Italian healthcare facilities.

## ✨ Key Features

### 🏢 Facility & Configuration
- **Customizable Structure**: Define facility parameters, cycle lengths (e.g., 7 days), and staffing requirements per shift.
- **Shift Types**: Configure custom shift types (Morning, Afternoon, Night, Long Night, etc.) with specific hours, colors, and coverage rules.
- **Requirements**: Set minimum staffing levels for every shift type on a daily basis.

### 👥 Employee Management
- **Roster Management**: Manage staff details, contract hours, and specific constraints (e.g., "No Nights").
- **Workload Balancing**: The optimizer actively tries to balance worked hours against contractual hours (Soft Constraint).

### 🧩 Matrix Editor & Generator
- **Visual Editor**: Interactive grid to define the base cyclic roster (pattern).
- **Optimal Generation**: **(New)** Genetic Algorithm that generates a valid cyclic matrix from scratch, optimizing for both internal consistency and its ability to generate valid monthly schedules.
- **Import/Export**: Support for Excel/CSV import and manual adjustments.

### ⚙️ Constraints Engine
The application supports a wide range of hard constraints:
- **Sequences**: Must Follow / Cannot Follow (e.g., `Night` cannot be followed by `Morning`).
- **Consecutive Days**: Max $N$ consecutive days on a specific shift.
- **Gaps**: Minimum days off between specific shifts.
- **Cyclic Logic**: Constraints are respected even when wrapping around the end of the matrix cycle.

### 🚀 High-Performance Scheduling
- **Genetic Algorithms**: Uses specialized GAs for both Matrix and Schedule optimization.
- **Web Workers**: All heavy computation runs in background threads to keep the UI responsive.
- **Real-time Feedback**: Visualization of fitness improvement and stagnation during optimization.

## 🛠️ Technical Architecture

The project is built with **React 18** and **Vite**.

### Directory Structure
```
src/
├── components/        # React UI Components
│   ├── MatrixEditor.jsx    # Roster pattern editor
│   ├── LoadingOverlay.jsx  # Progress visualization
│   └── ...
├── scheduling/        # Core Logic Module
│   ├── ga/            # Genetic Algorithm Engine
│   │   ├── geneticAlgorithm.js # Schedule GA
│   │   ├── fitness.js      # Shared fitness logic
│   │   └── operators.js    # Mutation/Crossover logic
│   ├── generator.js   # Monthly schedule orchestrator
│   ├── matrixGenerator.js # Cyclic matrix optimizer (GA)
│   ├── optimizer.js   # High-level optimization API
│   └── worker.js      # Web Worker entry point
└── App.jsx            # Main application state
```

### Algorithmic Logic

The application solves two distinct but related optimization problems.

#### 1. Schedule Optimization (Inner Loop)
**Goal:** Produce the optimal monthly schedule for a specific month, given a fixed Matrix.

*   **Algorithm:** Genetic Algorithm (GA).
*   **Initialization:** 
    *   **Greedy Baseline:** First, employees are assigned to matrix rows (offsets) using a "Snake" pattern (Row 0 -> Row 1...) to ensure continuity with the previous month. This creates a "Baseline Schedule".
    *   **Population:** The initial population consists of the Baseline Schedule + variations created by perturbing it.
*   **Fitness Function:** Minimizes a weighted sum of penalties:
    1.  **Hard Constraints:** High penalty (10,000) for sequence violations (e.g., N->M).
    2.  **Coverage:** High penalty (10,000) for missing required staffing numbers.
    3.  **Hours Balance:** Penalty for deviating from contract hours (asymmetric: under-hours is worse).
    4.  **Matrix Deviation:** Small penalty (3) for changing a shift from the original Matrix pattern.
*   **Operators:**
    *   **Guided Mutation:** A specific operator that probabilistically reverts changes back to the "Baseline" (Matrix) shift, ensuring the solution stays true to the cyclic pattern where possible.
    *   **Swap Mutation:** Swaps shifts between employees to fix coverage without altering total hours.

#### 2. Matrix Optimization (Outer Loop)
**Goal:** Find the optimal cyclic shift pattern (Matrix) that naturally produces valid schedules.

*   **Algorithm:** Genetic Algorithm (GA).
*   **Initialization:** Random assignment of shifts to the matrix grid.
*   **Fitness Function:**
    *   **Static Check:** Validates rows for internal sequence constraints (e.g., no 7 consecutive nights).
    *   **Simulation (Proxy):** Instead of running the full Schedule GA (too slow), it generates the **Greedy Baseline Schedule** (Snake pattern application) for the target month and evaluates its fitness.
    *   **Rationale:** A "perfect" matrix is one where the raw application of the pattern (Baseline) results in zero constraint or coverage violations. If the Baseline is good, the Schedule Optimizer has very little work to do.
*   **Stagnation:** The process terminates early if fitness does not improve for `STAGNATION_LIMIT` (default 100) generations.

## 🔒 Private Presets

The application supports a file-based preset system for sensitive data that should not be committed to version control.

1.  Export your configuration from the app.
2.  Save the JSON file in `public/presets/`.
3.  Add the filename to `PRESET_FILES` in `src/constants/index.js`.
4.  (The `public/presets/` folder is `.gitignored` by default, except for examples).

## 🚀 Getting Started

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

## 📄 License
MIT License - Free for personal and commercial use.
