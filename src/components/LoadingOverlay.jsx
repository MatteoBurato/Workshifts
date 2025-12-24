import React from 'react';
import { AlertCircle, Play, X, Zap, Brain, Eye } from 'lucide-react';

const LoadingOverlay = ({
  visible,
  stats,
  error,
  isGreedyMode,
  onRetryGreedy,
  onClose,
  onCloseWithoutSchedule,
  onSwitchToGreedy,
  onCancel,
  allowGreedyFallback = true,
  hasBestEffortSchedule = false
}) => {
  if (!visible) return null;

  // Engine-specific styling
  const engineColors = isGreedyMode
    ? { primary: 'amber', ring: 'border-amber-600', bg: 'bg-amber-100', text: 'text-amber-600' }
    : { primary: 'blue', ring: 'border-blue-600', bg: 'bg-blue-100', text: 'text-blue-600' };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-8 shadow-2xl flex flex-col items-center gap-4 max-w-md w-full mx-4 animate-in fade-in zoom-in duration-200">

        {error ? (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-2">
              <AlertCircle className="text-red-600" size={32} />
            </div>

            <div className="text-center w-full">
              <h3 className="text-xl font-bold text-slate-800 mb-2">Ottimizzazione Fallita</h3>
              <p className="text-slate-600 text-sm mb-4">
                {error.message || "Impossibile trovare una soluzione valida."}
              </p>

              {error.details && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg text-xs font-mono text-left mb-6 max-h-32 overflow-y-auto border border-red-100 w-full">
                  {JSON.stringify(error.details, null, 2)}
                </div>
              )}

              <div className="flex flex-col gap-3 w-full">
                {/* Show best-effort schedule option if available */}
                {hasBestEffortSchedule && (
                  <>
                    <button
                      onClick={onClose}
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                    >
                      <Eye size={18} />
                      Visualizza Turno Migliore
                    </button>
                    <p className="text-xs text-slate-400">
                      Mostra il miglior turno trovato, anche se non rispetta tutti i vincoli.
                    </p>
                  </>
                )}

                {allowGreedyFallback && (
                  <>
                    <button
                      onClick={onRetryGreedy}
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
                    >
                      <Play size={18} />
                      Usa Algoritmo Greedy (Fallback)
                    </button>
                    <p className="text-xs text-slate-400">
                      L'algoritmo Greedy ignora alcuni vincoli per generare comunque un turno.
                    </p>
                  </>
                )}

                <button
                  onClick={hasBestEffortSchedule ? onCloseWithoutSchedule : onClose}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors mt-2"
                >
                  <X size={18} />
                  Chiudi
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Animated spinner with engine-specific color */}
            <div className="relative">
              <div className={`w-16 h-16 border-4 ${isGreedyMode ? 'border-amber-100' : 'border-blue-100'} rounded-full`}></div>
              <div className={`absolute top-0 left-0 w-16 h-16 border-4 ${engineColors.ring} rounded-full border-t-transparent animate-spin`}></div>
              {isGreedyMode ? (
                <Zap className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${engineColors.text} animate-pulse`} size={24} />
              ) : (
                <Brain className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${engineColors.text} animate-pulse`} size={24} />
              )}
            </div>

            {/* Title and engine badge */}
            <div className="text-center">
              <h3 className="text-xl font-bold text-slate-800 mb-2">Generazione Turni</h3>

              {/* Engine indicator badge */}
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${isGreedyMode ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                {isGreedyMode ? (
                  <>
                    <Zap size={12} />
                    Modalità Greedy (Veloce)
                  </>
                ) : (
                  <>
                    <Brain size={12} />
                    Modalità Genetica (Ottimale)
                  </>
                )}
              </div>

              <p className="text-slate-500 text-sm mt-2">
                {isGreedyMode
                  ? 'Generazione rapida in corso...'
                  : "L'algoritmo sta evolvendo la pianificazione..."
                }
              </p>
            </div>

            {/* Stats panel - different content for GA vs Greedy */}
            {isGreedyMode ? (
              /* Greedy mode: simple indeterminate progress */
              <div className="w-full bg-amber-50 rounded-lg p-4 border border-amber-100 mt-2">
                <div className="space-y-2">
                  <div className="h-2 w-full bg-amber-200 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full animate-pulse" style={{ width: '100%' }} />
                  </div>
                  <p className="text-xs text-amber-700 text-center">
                    Applicazione pattern dalla matrice...
                  </p>
                </div>
              </div>
            ) : stats ? (
              /* GA mode: detailed stats */
              <div className="w-full bg-slate-50 rounded-lg p-3 border border-slate-100 mt-2 space-y-2">

                {/* Generation progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Generazione</span>
                    <span className="font-mono font-medium">{stats.generation || 0} / {stats.maxGenerations || 200}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300 ease-linear"
                      style={{ width: `${Math.min(100, ((stats.generation || 0) / (stats.maxGenerations || 200)) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex justify-between text-xs text-slate-600">
                  <span>Fitness (minore è meglio):</span>
                  <span className="font-mono font-medium">{stats.bestFitness !== undefined ? Math.round(stats.bestFitness) : '-'}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Stagnazione:</span>
                  <span className="font-mono">{stats.stagnation || 0} it.</span>
                </div>
              </div>
            ) : null}

            {/* Action buttons */}
            <div className="flex flex-col gap-2 w-full mt-4 border-t border-slate-100 pt-4">
              {/* Only show "Switch to Greedy" button if NOT already in greedy mode AND allowed */}
              {!isGreedyMode && allowGreedyFallback && (
                <>
                  <button
                    onClick={onSwitchToGreedy}
                    className="flex items-center justify-center gap-2 w-full py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg font-medium text-sm transition-colors"
                  >
                    <Zap size={16} />
                    Passa a Greedy (Veloce)
                  </button>
                  <p className="text-[10px] text-slate-400 text-center">
                    L'algoritmo genetico migliora la soluzione iterativamente.
                  </p>
                </>
              )}

              <button
                onClick={onCancel}
                className="flex items-center justify-center gap-2 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-medium text-sm transition-colors"
              >
                <X size={16} />
                Interrompi
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LoadingOverlay;