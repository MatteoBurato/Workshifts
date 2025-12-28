import React, { useState, useMemo } from 'react';
import { Calendar, Download, AlertCircle, Zap, ArrowLeftRight, Sliders, Activity } from 'lucide-react';
import { WEEKDAYS, MONTHS } from '../constants';
import { getDaysInMonth, getFirstDayOfMonth } from '../utils';
import { WEIGHTS, DEFAULT_SCHEDULE_GA_CONFIG } from '../scheduling';
import { ShiftBadge } from './shared';
import PreviousMonthUploader from './PreviousMonthUploader';

/**
 * Schedule viewer component
 * Displays generated schedule with warnings and export functionality
 *
 * @param {Object} props
 * @param {Object|null} props.schedule - Generated schedule object
 * @param {Array<Object>} props.employees - Employee list
 * @param {Array<Object>} props.shiftTypes - Shift type definitions
 * @param {Array<Object>} props.matrices - Array of { id, name, rows } matrix objects
 * @param {number} props.year - Year
 * @param {number} props.month - Month index (0-11)
 * @param {Array<Object>} props.warnings - Generation warnings
 * @param {Object} props.facility - Facility configuration
 * @param {Function} props.onExport - Called to export schedule
 * @param {Object|null} props.previousMonthSchedule - Previous month data
 * @param {Function} props.onPreviousMonthUpload - Called with uploaded previous month data
 * @param {Function} props.onPreviousMonthClear - Called to clear previous month data
 * @param {Function} props.onGenerate - Called to generate schedule
 * @param {Function} props.onScheduleChange - Called when a shift is manually changed (employeeId, day, newShift)
 */
const ScheduleViewer = ({
  schedule,
  employees,
  shiftTypes,
  matrices,
  year,
  month,
  warnings,
  facility,
  onExport,
  previousMonthSchedule,
  onPreviousMonthUpload,
  onPreviousMonthClear,
  onGenerate,
  onScheduleChange
}) => {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // GA Configuration State
  const [hoursVsMatrix, setHoursVsMatrix] = useState(50); // 0 = Hours, 100 = Matrix
  const [underPenalty, setUnderPenalty] = useState(50); // 0 = Symmetric, 100 = Heavy Under Penalty
  const [matrixFidelity, setMatrixFidelity] = useState(60); // 0-100% adherence to baseline
  
  // Advanced GA Config
  const [popSize, setPopSize] = useState(DEFAULT_SCHEDULE_GA_CONFIG.POPULATION_SIZE);
  const [maxGen, setMaxGen] = useState(DEFAULT_SCHEDULE_GA_CONFIG.MAX_GENERATIONS);
  const [timeoutSec, setTimeoutSec] = useState(DEFAULT_SCHEDULE_GA_CONFIG.TIMEOUT_MS / 1000);
  
  // Abstracted Controls
  const [mutationPressure, setMutationPressure] = useState(50); // 0-100
  const [selectionPressure, setSelectionPressure] = useState(50); // 0-100

  // Build matrix map for lookups
  const matrixMap = useMemo(() => {
    const map = {};
    for (const m of (matrices || [])) {
      map[m.id] = m.rows;
    }
    return map;
  }, [matrices]);

  const defaultMatrix = matrices?.[0]?.rows || [];

  // Compute stats for the current schedule
  const stats = useMemo(() => {
    if (!schedule || !matrices || matrices.length === 0) return null;

    let totalDeltaHours = 0;
    let totalChanges = 0;

    Object.entries(schedule).forEach(([empId, s]) => {
      // 1. Delta Hours
      totalDeltaHours += Math.abs(s.hoursDiff);

      // 2. Matrix Changes - use the correct matrix for this employee
      const emp = employees.find(e => e.id === empId);
      const empMatrixId = s.matrixId || emp?.matrixId || matrices[0]?.id;
      const matrix = matrixMap[empMatrixId] || defaultMatrix;

      if (!matrix || matrix.length === 0) return;

      const rowLength = matrix[0].length;
      const fullPattern = matrix.flat();

      // Reconstruct baseline
      const startIndex = s.matrixRow * rowLength + s.dayOffset;
      s.shifts.forEach((shift, i) => {
        // Find expected shift from matrix (ignoring exclusions logic for raw diff)
        // Note: Generator uses snake pattern: (startIndex + day + firstDay) % fullLen
        const patternIndex = (startIndex + i + firstDay) % fullPattern.length;
        const expected = fullPattern[patternIndex];

        // If actual shift is different from expected matrix shift
        if (shift !== expected) {
            totalChanges++;
        }
      });
    });

    return { totalDeltaHours, totalChanges };
  }, [schedule, matrices, matrixMap, defaultMatrix, employees, firstDay]);

  // Calculate weights for generation
  // Sliders modify the default WEIGHTS imported from scheduling/ga/fitness.js
  const handleGenerate = () => {
    // hoursVsMatrix slider: balance between hours optimization and matrix adherence
    // 0   -> Hours priority (2x hours, 0x matrix)
    // 50  -> Balanced (1x hours, 1x matrix) - uses defaults as-is
    // 100 -> Matrix priority (0x hours, 2x matrix)
    const hoursMult = 2 * (1 - hoursVsMatrix / 100);
    const matrixMult = 2 * (hoursVsMatrix / 100);

    // underPenalty slider: asymmetry between under-hours and over-hours penalties
    // 0   -> Symmetric (1:1 ratio, both use HOURS_OVER as base)
    // 50  -> Default ratio (~1.875:1, approximates default 15:8 ratio)
    // 100 -> Extreme asymmetry (5:1 ratio)
    const underOverRatio = 1 + (underPenalty / 100) * 4;

    // Apply multipliers to defaults
    // Only pass weights the user can control; others use fitness.js defaults
    const weights = {
      HOURS_OVER: WEIGHTS.HOURS_OVER * hoursMult,
      HOURS_UNDER: WEIGHTS.HOURS_OVER * hoursMult * underOverRatio,
      MATRIX_CHANGE: WEIGHTS.MATRIX_CHANGE * matrixMult
    };

    // Calculate derived GA parameters
    const population = parseInt(popSize);
    const maxGenerations = parseInt(maxGen);
    
    // Stagnation: Hardcoded as 10% of max generations
    const derivedStagnation = Math.max(10, Math.floor(maxGenerations * 0.1));

    // Selection Pressure -> Elite Count & Tournament Size
    // Low: Elite 1%, Tourn 2
    // High: Elite 20%, Tourn 10
    const selectionRatio = selectionPressure / 100;
    const derivedEliteCount = Math.floor(population * (0.01 + selectionRatio * 0.19));
    const derivedTournamentSize = Math.floor(2 + selectionRatio * 8);

    // Mutation Pressure -> Mutation Rate & Crossover Rate
    // Low: Mut 0.01, Cross 0.6
    // High: Mut 0.20, Cross 0.95
    const mutationRatio = mutationPressure / 100;
    const derivedMutationRate = 0.01 + mutationRatio * 0.19;
    const derivedCrossoverRate = 0.6 + mutationRatio * 0.35;

    onGenerate({
      weights,
      populationSize: population,
      maxGenerations: maxGenerations,
      stagnationLimit: derivedStagnation,
      gaTimeoutMs: parseInt(timeoutSec) * 1000,
      baselineAdherence: matrixFidelity / 100,
      eliteCount: derivedEliteCount,
      mutationRate: derivedMutationRate,
      crossoverRate: derivedCrossoverRate,
      tournamentSize: derivedTournamentSize
    });
  };

  // Calculate average continuity score
  const continuityScores = Object.values(schedule || {})
    .map(s => s.continuityScore)
    .filter(s => s !== null && s !== undefined);
  const avgContinuity = continuityScores.length > 0
    ? (continuityScores.reduce((a, b) => a + b, 0) / continuityScores.length * 100).toFixed(0)
    : null;

  return (
    <div className="space-y-4">
      {/* Previous Month Uploader */}
      <PreviousMonthUploader
        employees={employees}
        previousMonthData={previousMonthSchedule}
        onUpload={onPreviousMonthUpload}
        onClear={onPreviousMonthClear}
      />

      {/* Header with export */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            {MONTHS[month]} {year} - {facility.name}
          </h2>
          {avgContinuity && (
            <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <ArrowLeftRight size={12} />
              Continuità media:{' '}
              <span className={`font-medium ${
                parseInt(avgContinuity) >= 70 ? 'text-green-600' :
                parseInt(avgContinuity) >= 40 ? 'text-amber-600' :
                'text-red-600'
              }`}>
                {avgContinuity}%
              </span>
            </div>
          )}
        </div>
        <button
          onClick={onExport}
          disabled={!schedule}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={16} />
          Scarica Excel
        </button>
      </div>

      {/* Warnings */}
      {warnings?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <h4 className="font-semibold text-amber-800 flex items-center gap-2 text-sm mb-1">
            <AlertCircle size={16} />
            Avvisi ({warnings.length})
          </h4>
          <ul className="text-xs text-amber-700 space-y-0.5 max-h-24 overflow-y-auto">
            {warnings.slice(0, 8).map((w, i) => (
              <li key={i}>
                {w.message}
              </li>
            ))}
            {warnings.length > 8 && (
              <li className="font-medium">...e altri {warnings.length - 8}</li>
            )}
          </ul>
        </div>
      )}

      {/* Schedule Table */}
      {schedule ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="sticky left-0 bg-slate-100 py-2 px-2 text-left font-medium text-slate-600 min-w-[50px] z-10">
                    Ore
                  </th>
                  <th className="sticky left-[50px] bg-slate-100 py-2 px-2 text-left font-medium text-slate-600 min-w-[120px] z-10">
                    Dipendente
                  </th>
                  {previousMonthSchedule && (
                    <th className="py-2 px-1 text-center font-medium text-slate-600 min-w-[40px]" title="Continuità">
                      %
                    </th>
                  )}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const dow = (firstDay + i) % 7;
                    return (
                      <th
                        key={i}
                        className={`py-1 px-0.5 text-center font-medium min-w-[40px] ${dow >= 5 ? 'bg-slate-200' : ''}`}
                      >
                        <span className="text-slate-600">{i + 1}</span>
                        <span className={`block text-[10px] ${dow >= 5 ? 'text-slate-500' : 'text-slate-400'}`}>
                          {WEEKDAYS[dow]}
                        </span>
                      </th>
                    );
                  })}
                  <th className="py-2 px-2 text-center font-medium text-slate-600 min-w-[50px]">TOT</th>
                  <th className="py-2 px-2 text-center font-medium text-slate-600 min-w-[50px]">DIFF</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const es = schedule[emp.id];
                  if (!es) return null;
                  const continuityPct = es.continuityScore !== null && es.continuityScore !== undefined
                    ? Math.round(es.continuityScore * 100)
                    : null;
                  return (
                    <tr key={emp.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="sticky left-0 bg-white py-1 px-2 text-slate-500 z-10 border-r border-slate-100 text-center">
                        {emp.contractHours}
                      </td>
                      <td className="sticky left-[50px] bg-white py-1 px-2 font-medium text-slate-800 z-10 border-r border-slate-100">
                        <div className="truncate text-xs">{emp.surname} {emp.name}</div>
                        <div className="text-[10px] text-slate-400">R{es.matrixRow + 1} +{es.dayOffset}</div>
                      </td>
                      {previousMonthSchedule && (
                        <td className="py-1 px-1 text-center">
                          {continuityPct !== null ? (
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              continuityPct >= 70 ? 'bg-green-100 text-green-700' :
                              continuityPct >= 40 ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {continuityPct}%
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      )}
                      {es.shifts.map((shift, i) => {
                        const dow = (firstDay + i) % 7;
                        const shiftType = shiftTypes.find(s => s.id === shift);
                        return (
                          <td key={i} className={`py-0.5 px-0.5 text-center ${dow >= 5 ? 'bg-slate-50' : ''}`}>
                            {onScheduleChange ? (
                              <select
                                value={shift}
                                onChange={(e) => onScheduleChange(emp.id, i, e.target.value)}
                                className="w-11 h-5 text-[10px] border border-slate-200 rounded font-medium cursor-pointer"
                                style={{
                                  backgroundColor: shiftType?.color || '#fff',
                                  color: shiftType?.textColor || '#000'
                                }}
                              >
                                {shiftTypes.map(st => (
                                  <option key={st.id} value={st.id}>{st.id}</option>
                                ))}
                              </select>
                            ) : (
                              <ShiftBadge shift={shift} shiftTypes={shiftTypes} size="sm" />
                            )}
                          </td>
                        );
                      })}
                      <td className="py-1 px-2 text-center font-medium">{es.totalHours}</td>
                      <td className={`py-1 px-2 text-center font-bold ${
                        es.hoursDiff >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {es.hoursDiff >= 0 ? '+' : ''}{es.hoursDiff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl p-10 text-center shadow-sm border border-slate-200">
          <Calendar size={48} className="mx-auto mb-3 text-slate-300" />
          <h3 className="text-lg font-medium text-slate-600 mb-1">Nessun turno generato</h3>
          <p className="text-slate-500 text-sm mb-4">
            {previousMonthSchedule
              ? 'Mese precedente caricato! Clicca "Genera" per creare i turni con continuità ottimizzata.'
              : 'Configura struttura e dipendenti, poi clicca "Genera"'
            }
          </p>
          <button
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700"
          >
            <Zap size={16} />
            Genera Turni
          </button>
        </div>
      )}

      {/* Bottom Actions and Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Card 1: GA Customization */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <Sliders size={16} />
            Parametri Ottimizzazione
          </h3>
          
          <div className="space-y-4">
            {/* Slider 1: Hours vs Matrix */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600">Priorità Ore</span>
                <span className="font-medium text-slate-800">
                  {hoursVsMatrix < 50 ? 'Ore' : hoursVsMatrix > 50 ? 'Matrice' : 'Bilanciato'}
                </span>
                <span className="text-slate-600">Priorità Matrice</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={hoursVsMatrix} 
                onChange={(e) => setHoursVsMatrix(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Slider 2: Under vs Over Penalty */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600">Penalità Simmetrica</span>
                <span className="font-medium text-slate-800">
                  {underPenalty < 30 ? 'Simmetrica' : 'Sotto > Sopra'}
                </span>
                <span className="text-slate-600">Penalità Sotto++</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={underPenalty} 
                onChange={(e) => setUnderPenalty(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
              />
            </div>

            {/* Slider 3: Matrix Fidelity */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600">Flessibile</span>
                <span className="font-medium text-slate-800">
                  Fedeltà Matrice: {matrixFidelity}%
                </span>
                <span className="text-slate-600">Rigido</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={matrixFidelity} 
                onChange={(e) => setMatrixFidelity(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>

            {/* Slider 4: Mutation Pressure */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600">Stabilità</span>
                <span className="font-medium text-slate-800">
                  Mutazione: {mutationPressure}%
                </span>
                <span className="text-slate-600">Caos</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={mutationPressure} 
                onChange={(e) => setMutationPressure(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
              />
            </div>

            {/* Slider 5: Selection Pressure */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600">Diversità</span>
                <span className="font-medium text-slate-800">
                  Selezione: {selectionPressure}%
                </span>
                <span className="text-slate-600">Elitismo</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={selectionPressure} 
                onChange={(e) => setSelectionPressure(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-600"
              />
            </div>

            {/* Advanced Params */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Popolazione</label>
                <input
                  type="number"
                  value={popSize}
                  onChange={(e) => setPopSize(Math.max(10, parseInt(e.target.value) || 0))}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs text-center"
                  min="10"
                  max="2000"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Max Gen.</label>
                <input
                  type="number"
                  value={maxGen}
                  onChange={(e) => setMaxGen(Math.max(50, parseInt(e.target.value) || 0))}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs text-center"
                  min="50"
                  max="100000"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Timeout (s)</label>
                <input
                  type="number"
                  value={timeoutSec}
                  onChange={(e) => setTimeoutSec(Math.max(5, parseInt(e.target.value) || 0))}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs text-center"
                  min="5"
                />
              </div>
            </div>

            <button
              onClick={handleGenerate}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Zap size={14} />
              Rigenera con nuovi parametri
            </button>
          </div>
        </div>

        {/* Card 2: Stats */}
        {schedule && stats && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Activity size={16} />
              Statistiche Soluzione
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="text-xs text-slate-500 mb-1">Delta Ore Totale</div>
                <div className="text-xl font-bold text-slate-800">
                  {stats.totalDeltaHours.toFixed(1)}
                </div>
                <div className="text-[10px] text-slate-400">differenza assoluta</div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="text-xs text-slate-500 mb-1">Modifiche Matrice</div>
                <div className="text-xl font-bold text-slate-800">
                  {stats.totalChanges}
                </div>
                <div className="text-[10px] text-slate-400">turni variati vs base</div>
              </div>
            </div>
            
            <div className="mt-3 text-xs text-slate-500">
              Queste metriche indicano la qualità della soluzione corrente rispetto agli obiettivi di ore e stabilità del pattern.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScheduleViewer;