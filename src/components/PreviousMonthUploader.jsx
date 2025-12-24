import React, { useState } from 'react';
import {
  FileUp, Upload, ChevronDown, AlertCircle, CheckCircle2, ArrowLeftRight
} from 'lucide-react';
import { parsePreviousMonthSchedule } from '../utils/excel';

/**
 * Component for uploading previous month's schedule
 * Used to optimize continuity in schedule generation
 *
 * @param {Object} props
 * @param {Array<Object>} props.employees - Employee list for matching
 * @param {Function} props.onUpload - Called with parsed schedule data
 * @param {Object|null} props.previousMonthData - Currently loaded previous month data
 * @param {Function} props.onClear - Called to clear previous month data
 */
const PreviousMonthUploader = ({ employees, onUpload, previousMonthData, onClear }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadStats, setUploadStats] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError('');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = parsePreviousMonthSchedule(event.target.result, employees);

        if (result.stats.matched === 0) {
          setUploadError('Nessun dipendente riconosciuto nel file. Verifica che i nomi corrispondano.');
          return;
        }

        setUploadStats(result.stats);
        onUpload(result.schedule);
        setIsExpanded(false);

      } catch (err) {
        setUploadError('Errore nella lettura del file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleClear = () => {
    onClear();
    setUploadStats(null);
    setUploadError('');
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            previousMonthData ? 'bg-green-100' : 'bg-slate-100'
          }`}>
            {previousMonthData ? (
              <CheckCircle2 size={20} className="text-green-600" />
            ) : (
              <FileUp size={20} className="text-slate-500" />
            )}
          </div>
          <div className="text-left">
            <div className="font-medium text-slate-800">
              {previousMonthData ? 'Mese Precedente Caricato' : 'Carica Mese Precedente'}
            </div>
            <div className="text-xs text-slate-500">
              {previousMonthData && uploadStats ? (
                `${uploadStats.matched}/${uploadStats.total} dipendenti • ${uploadStats.daysFound} giorni rilevati`
              ) : (
                'Carica i turni del mese scorso per ottimizzare la continuità'
              )}
            </div>
          </div>
        </div>
        <ChevronDown
          size={20}
          className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {isExpanded && (
        <div className="p-4 pt-0 border-t border-slate-100">
          <div className="space-y-3">
            {/* Info box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <ArrowLeftRight size={16} className="text-blue-600 mt-0.5" />
                <div className="text-xs text-blue-800">
                  <strong>Come funziona:</strong> Caricando i turni del mese precedente, l'algoritmo assegnerà
                  automaticamente ogni dipendente alla posizione della matrice che garantisce la migliore
                  continuità, minimizzando le discontinuità nel ciclo dei turni.
                </div>
              </div>
            </div>

            {/* Upload area */}
            <div className="flex gap-3">
              <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-colors">
                <Upload size={18} className="text-slate-500" />
                <span className="text-sm text-slate-600">Carica file Excel del mese precedente</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {previousMonthData && (
                <button
                  onClick={handleClear}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm"
                >
                  Rimuovi
                </button>
              )}
            </div>

            {uploadError && (
              <div className="flex items-center gap-2 text-red-600 text-xs">
                <AlertCircle size={14} />
                {uploadError}
              </div>
            )}

            {/* Matched employees preview */}
            {previousMonthData && uploadStats && (
              <div className="mt-3">
                <div className="text-xs font-medium text-slate-600 mb-2">Dipendenti riconosciuti:</div>
                <div className="flex flex-wrap gap-1">
                  {employees.map(emp => {
                    const hasData = previousMonthData[emp.id];
                    return (
                      <span
                        key={emp.id}
                        className={`px-2 py-1 rounded text-xs ${
                          hasData
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {emp.surname}
                        {hasData && <CheckCircle2 size={10} className="inline ml-1" />}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviousMonthUploader;
