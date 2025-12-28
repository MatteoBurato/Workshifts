/**
 * Turni OSS - Main Application Component
 *
 * This is the composition layer that brings together all modules:
 * - Scheduling logic from ./scheduling
 * - UI components from ./components
 * - Constants and utilities
 *
 * The application state is managed here and passed down to components.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Calendar, Settings, Users, Grid, ChevronLeft, ChevronRight, Lock, LogOut } from 'lucide-react';

// Access code from environment variables (VITE_ prefix is required)
const ACCESS_CODE = import.meta.env.VITE_ACCESS_CODE;

// Constants
import {
  DEFAULT_SHIFT_TYPES,
  DEFAULT_CONSTRAINTS,
  DEFAULT_FACILITY,
  PRESET_FILES,
  MONTHS
} from './constants';

// Utilities
import { generateId, exportToExcel, getDaysInMonth } from './utils';

// Scheduling
import { generateMonthlySchedule, generateDefaultMatrix, evaluateSchedule, calculateWorkerHours } from './scheduling';

// Components
import {
  TabButton,
  ShiftBadge,
  PresetBar,
  FacilityConfig,
  EmployeesPanel,
  MatrixEditor,
  ScheduleViewer,
  LoadingOverlay
} from './components';

/**
 * Main Application Component
 */
export default function TurniOSSApp() {
  // Authorization state
  const [isAuthorized, setIsAuthorized] = useState(() => {
    return localStorage.getItem('turni_authorized') === 'true';
  });
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(false);

  // Navigation state
  const [activeTab, setActiveTab] = useState('config');

  // Date state
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());

  // Loading state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGreedyMode, setIsGreedyMode] = useState(false);
  const [generationStats, setGenerationStats] = useState(null);
  const [generationError, setGenerationError] = useState(null);

  // Configuration state
  const [facility, setFacility] = useState(DEFAULT_FACILITY);
  const [shiftTypes, setShiftTypes] = useState(DEFAULT_SHIFT_TYPES);
  const [constraints, setConstraints] = useState(DEFAULT_CONSTRAINTS);
  const [employees, setEmployees] = useState([]);
  // Multiple matrices: each has { id, name, rows }
  const [matrices, setMatrices] = useState([]);

  // Schedule state
  const [previousMonthSchedule, setPreviousMonthSchedule] = useState(null);
  const [generatedSchedule, setGeneratedSchedule] = useState(null);
  const [warnings, setWarnings] = useState([]);
  
  // Worker reference for cancellation
  const workerRef = React.useRef(null);

  // Preset state
  const [filePresets, setFilePresets] = useState([]);
  const [localPresets, setLocalPresets] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('turni_presets') || '[]');
    } catch {
      return [];
    }
  });
  const [currentPresetId, setCurrentPresetId] = useState(null);

  // Combined presets (file-based first, then local)
  const presets = [...filePresets, ...localPresets];

  // Load presets from /presets/ folder on mount
  useEffect(() => {
    const loadFilePresets = async () => {
      const loaded = [];

      for (const filename of PRESET_FILES) {
        try {
          const response = await fetch(`/presets/${filename}`);
          if (response.ok) {
            const data = await response.json();
            loaded.push({
              id: `file-${filename.replace('.json', '')}`,
              name: data.name || filename.replace('.json', ''),
              isFilePreset: true,
              filename,
              config: data.config
            });
          }
        } catch (err) {
          console.log(`Preset ${filename} not found or invalid`);
        }
      }

      setFilePresets(loaded);
    };

    loadFilePresets();
  }, []);

  // Save local presets to localStorage
  const saveLocalPresets = (newPresets) => {
    setLocalPresets(newPresets);
    localStorage.setItem('turni_presets', JSON.stringify(newPresets));
  };

  // Preset handlers
  const handleSavePreset = (name) => {
    const newPreset = {
      id: generateId(),
      name,
      config: { facility, shiftTypes, constraints, employees, matrices },
      createdAt: new Date().toISOString()
    };
    saveLocalPresets([...localPresets, newPreset]);
    setCurrentPresetId(newPreset.id);
  };

  const handleImportPresets = (importedPresets) => {
    saveLocalPresets([...localPresets, ...importedPresets]);
  };

  const handleSelectPreset = (presetId) => {
    if (presetId === null) {
      // Create new - reset to defaults
      setFacility(DEFAULT_FACILITY);
      setShiftTypes(DEFAULT_SHIFT_TYPES);
      setConstraints(DEFAULT_CONSTRAINTS);
      setEmployees([]);
      setMatrices([]);
      setGeneratedSchedule(null);
      setCurrentPresetId(null);
    } else {
      const preset = presets.find(p => p.id === presetId);
      if (preset) {
        if (preset.config.facility) setFacility(preset.config.facility);
        if (preset.config.shiftTypes) setShiftTypes(preset.config.shiftTypes);
        if (preset.config.constraints) setConstraints(preset.config.constraints);
        if (preset.config.employees) setEmployees(preset.config.employees);
        // Handle both old `matrix` format and new `matrices` format
        if (preset.config.matrices) {
          setMatrices(preset.config.matrices);
        } else if (preset.config.matrix && preset.config.matrix.length > 0) {
          // Backward compatibility: convert old single matrix to new format
          setMatrices([{
            id: generateId(),
            name: 'Principale',
            rows: preset.config.matrix
          }]);
        } else {
          setMatrices([]);
        }
        setCurrentPresetId(presetId);
        setGeneratedSchedule(null);
      }
    }
  };

  const handleDeletePreset = (presetId) => {
    const preset = presets.find(p => p.id === presetId);
    if (preset?.isFilePreset) {
      alert(`Per eliminare "${preset.name}", rimuovi il file ${preset.filename} dalla cartella /public/presets/`);
      return;
    }
    saveLocalPresets(localPresets.filter(p => p.id !== presetId));
    if (currentPresetId === presetId) setCurrentPresetId(null);
  };

  // Schedule generation
  const generate = useCallback((options = {}) => {
    if (employees.length === 0) {
      setWarnings([{ message: 'Aggiungi almeno un dipendente' }]);
      return;
    }

    // Terminate existing worker if any
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    // Ensure we have at least one matrix; create default if needed
    let workingMatrices = matrices;
    if (matrices.length === 0) {
      const defaultMatrix = {
        id: generateId(),
        name: 'Principale',
        rows: generateDefaultMatrix()
      };
      workingMatrices = [defaultMatrix];
      setMatrices(workingMatrices);
    }

    const useGreedy = !!options.forceGreedy;
    setIsGreedyMode(useGreedy);
    setIsGenerating(true);
    setGenerationStats(null);
    setGenerationError(null); // Reset error state

    const worker = new Worker(new URL('./scheduling/worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === 'PROGRESS') {
        setGenerationStats(payload);
      } else if (type === 'SUCCESS') {
        // Check for logical failure (e.g. GA couldn't find valid solution)
        if (payload.metadata && payload.metadata.failed) {
          setGenerationError({
            message: payload.warnings[0]?.message || 'Ottimizzazione fallita',
            details: payload.warnings[0]?.details || payload.metadata.cspReason,
            // Store the best-effort schedule so user can view it
            bestEffortSchedule: payload.metadata.hasBestEffortSchedule ? payload.schedule : null
          });
          // Keep overlay visible (isGenerating remains true until closed)
        } else {
          setGeneratedSchedule(payload.schedule);

          // Use centralized evaluator for constraint warnings
          const evaluation = evaluateSchedule({
            schedule: payload.schedule,
            employees,
            shiftTypes,
            constraints,
            coverageRules: facility.coverageRules,
            daysInMonth: getDaysInMonth(year, month)
          });
          setWarnings(evaluation.warnings);

          setActiveTab('schedule');
          setIsGenerating(false);
        }
        worker.terminate();
        workerRef.current = null;
      } else if (type === 'ERROR') {
        console.error('Generation error:', payload);
        setGenerationError({
          message: 'Errore critico durante la generazione',
          details: payload
        });
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.postMessage({
      type: 'GENERATE',
      payload: {
        year,
        month,
        employees,
        shiftTypes,
        matrices: workingMatrices,
        coverageRules: facility.coverageRules,
        constraints,
        previousMonthSchedule,
        optimizerOptions: {
          useCSP: !options.forceGreedy, // Disable CSP/GA if greedy is forced
          gaTimeoutMs: 1800000, // 30 minutes
          greedyFallback: !!options.forceGreedy, // Use greedy only if explicitly requested
          weights: options.weights,
          populationSize: options.populationSize,
          maxGenerations: options.maxGenerations,
          stagnationLimit: options.stagnationLimit,
          baselineAdherence: options.baselineAdherence
        }
      }
    });
  }, [year, month, employees, shiftTypes, matrices, facility, constraints, previousMonthSchedule]);

  const handleRetryGreedy = () => {
    generate({ forceGreedy: true });
  };

  const handleSwitchToGreedy = () => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    // Small delay to ensure cleanup
    setTimeout(() => {
      generate({ forceGreedy: true });
    }, 100);
  };

  const handleCancel = () => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsGenerating(false);
    setGenerationStats(null);
    setGenerationError(null);
  };

  const handleCloseError = () => {
    // If there's a best-effort schedule, use it when closing and evaluate constraints
    if (generationError?.bestEffortSchedule && Object.keys(generationError.bestEffortSchedule).length > 0) {
      setGeneratedSchedule(generationError.bestEffortSchedule);

      // Use centralized evaluator for constraint warnings
      const evaluation = evaluateSchedule({
        schedule: generationError.bestEffortSchedule,
        employees,
        shiftTypes,
        constraints,
        coverageRules: facility.coverageRules,
        daysInMonth: getDaysInMonth(year, month)
      });
      setWarnings(evaluation.warnings);

      setActiveTab('schedule');
    }
    setGenerationError(null);
    setIsGenerating(false);
  };

  const handleCloseErrorWithoutSchedule = () => {
    // Close without using the best-effort schedule
    setGenerationError(null);
    setIsGenerating(false);
  };

  // Excel export
  const handleExport = () => {
    if (generatedSchedule) {
      exportToExcel({
        schedule: generatedSchedule,
        employees,
        shiftTypes,
        year,
        month,
        facility
      });
    }
  };

  // Manual schedule editing
  const handleScheduleChange = (employeeId, day, newShift) => {
    if (!generatedSchedule || !generatedSchedule[employeeId]) return;

    // Update the schedule with new shift
    const updatedSchedule = {
      ...generatedSchedule,
      [employeeId]: {
        ...generatedSchedule[employeeId],
        shifts: generatedSchedule[employeeId].shifts.map((s, i) =>
          i === day ? newShift : s
        )
      }
    };

    // Recalculate hours for this employee
    const newTotalHours = calculateWorkerHours(updatedSchedule[employeeId].shifts, shiftTypes);
    updatedSchedule[employeeId].totalHours = newTotalHours;
    updatedSchedule[employeeId].hoursDiff = newTotalHours - updatedSchedule[employeeId].contractHours;

    setGeneratedSchedule(updatedSchedule);

    // Re-evaluate warnings with updated schedule
    const evaluation = evaluateSchedule({
      schedule: updatedSchedule,
      employees,
      shiftTypes,
      constraints,
      coverageRules: facility.coverageRules,
      daysInMonth: getDaysInMonth(year, month)
    });
    setWarnings(evaluation.warnings);
  };

  // Month navigation
  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ACCESS_CODE) {
      setIsAuthorized(true);
      localStorage.setItem('turni_authorized', 'true');
      setLoginError(false);
    } else {
      setLoginError(true);
    }
  };

  const handleLogout = () => {
    setIsAuthorized(false);
    localStorage.removeItem('turni_authorized');
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
              <Lock size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Accesso Riservato</h1>
            <p className="text-slate-500 text-center mt-2">Inserisci il codice di accesso per utilizzare il generatore di turni.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Codice di accesso"
                className={`w-full px-4 py-3 rounded-xl border ${loginError ? 'border-red-500' : 'border-slate-200'} focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all`}
                autoFocus
              />
              {loginError && <p className="text-red-500 text-xs mt-1 ml-1">Codice non corretto</p>}
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 transition-all transform active:scale-[0.98]"
            >
              Entra
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 pb-16">
      <LoadingOverlay
        visible={isGenerating}
        stats={generationStats}
        error={generationError}
        isGreedyMode={isGreedyMode}
        onRetryGreedy={handleRetryGreedy}
        onSwitchToGreedy={handleSwitchToGreedy}
        onCancel={handleCancel}
        onClose={handleCloseError}
        onCloseWithoutSchedule={handleCloseErrorWithoutSchedule}
        hasBestEffortSchedule={!!(generationError?.bestEffortSchedule && Object.keys(generationError.bestEffortSchedule).length > 0)}
      />
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow">
                <Calendar className="text-white" size={20} />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-slate-800">Turni OSS</h1>
              </div>
            </div>

            {/* Preset Bar */}
            <PresetBar
              presets={presets}
              currentPresetId={currentPresetId}
              onSelect={handleSelectPreset}
              onSave={handleSavePreset}
              onDelete={handleDeletePreset}
              onImport={handleImportPresets}
              facilityName={facility.name}
            />

            {/* Month Navigation */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              <button onClick={prevMonth} className="p-1.5 hover:bg-white rounded">
                <ChevronLeft size={18} />
              </button>
              <div className="px-2 py-1 font-medium text-slate-800 text-sm min-w-[100px] text-center">
                {MONTHS[month].slice(0, 3)} {year}
              </div>
              <button onClick={nextMonth} className="p-1.5 hover:bg-white rounded">
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Esci"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-slate-200 sticky top-[68px] z-20">
        <div className="max-w-7xl mx-auto px-4 py-2 flex gap-2 overflow-x-auto">
          <TabButton
            active={activeTab === 'config'}
            onClick={() => setActiveTab('config')}
            icon={Settings}
            label="Config"
          />
          <TabButton
            active={activeTab === 'employees'}
            onClick={() => setActiveTab('employees')}
            icon={Users}
            label="Dipendenti"
          />
          <TabButton
            active={activeTab === 'matrix'}
            onClick={() => setActiveTab('matrix')}
            icon={Grid}
            label="Matrice"
          />
          <TabButton
            active={activeTab === 'schedule'}
            onClick={() => setActiveTab('schedule')}
            icon={Calendar}
            label="Turni"
          />
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'config' && (
          <FacilityConfig
            facility={facility}
            setFacility={setFacility}
            shiftTypes={shiftTypes}
            setShiftTypes={setShiftTypes}
            constraints={constraints}
            setConstraints={setConstraints}
          />
        )}

        {activeTab === 'employees' && (
          <EmployeesPanel
            employees={employees}
            setEmployees={setEmployees}
            shiftTypes={shiftTypes}
            matrices={matrices}
          />
        )}

        {activeTab === 'matrix' && (
          <MatrixEditor
            matrices={matrices}
            setMatrices={setMatrices}
            shiftTypes={shiftTypes}
            constraints={constraints}
            coverageRules={facility.coverageRules}
            employees={employees}
            year={year}
            month={month}
          />
        )}

        {activeTab === 'schedule' && (
          <ScheduleViewer
            schedule={generatedSchedule}
            employees={employees}
            shiftTypes={shiftTypes}
            matrices={matrices}
            year={year}
            month={month}
            warnings={warnings}
            facility={facility}
            onExport={handleExport}
            previousMonthSchedule={previousMonthSchedule}
            onPreviousMonthUpload={setPreviousMonthSchedule}
            onPreviousMonthClear={() => setPreviousMonthSchedule(null)}
            onGenerate={generate}
            onScheduleChange={handleScheduleChange}
          />
        )}
      </main>

      {/* Footer Legend */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 py-2 px-4 z-10">
        <div className="max-w-7xl mx-auto flex items-center gap-4 overflow-x-auto">
          <span className="text-xs font-medium text-slate-600 whitespace-nowrap">Legenda:</span>
          <div className="flex gap-3">
            {shiftTypes.map(st => (
              <div key={st.id} className="flex items-center gap-1.5 whitespace-nowrap">
                <ShiftBadge shift={st.id} shiftTypes={shiftTypes} size="sm" />
                <span className="text-xs text-slate-600">{st.name}</span>
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
