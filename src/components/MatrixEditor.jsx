import React, { useState } from 'react';
import { Grid, Plus, Trash2, Clipboard, Upload, Zap, X, AlertCircle, Sliders, Edit2, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import { WEEKDAYS } from '../constants';
import { generateDefaultMatrix, DEFAULT_GA_CONFIG } from '../scheduling';
import { generateId } from '../utils';
import LoadingOverlay from './LoadingOverlay';

/**
 * Visual editor for multiple shift pattern matrices
 *
 * @param {Object} props
 * @param {Array<Object>} props.matrices - Array of { id, name, rows } objects
 * @param {Function} props.setMatrices - Setter for matrices
 * @param {Array<Object>} props.shiftTypes - Available shift types
 * @param {Array<Object>} props.constraints - Application constraints
 * @param {Array<Object>} props.coverageRules - Staffing requirements (Flexible rules)
 */
const MatrixEditor = ({
  matrices,
  setMatrices,
  shiftTypes,
  constraints,
  coverageRules,
  employees,
  year,
  month
}) => {
  // Track which matrix is currently selected
  const [selectedMatrixId, setSelectedMatrixId] = useState(matrices[0]?.id || null);
  const [editingName, setEditingName] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false); // true when generating all matrices jointly
  const [generationStats, setGenerationStats] = useState(null);

  // GA Parameters
  const [popSize, setPopSize] = useState(DEFAULT_GA_CONFIG.POPULATION_SIZE);
  const [maxGen, setMaxGen] = useState(DEFAULT_GA_CONFIG.MAX_GENERATIONS);
  const [timeoutSec, setTimeoutSec] = useState(DEFAULT_GA_CONFIG.TIMEOUT_MS / 1000);
  const [stagnationLimit, setStagnationLimit] = useState(DEFAULT_GA_CONFIG.STAGNATION_LIMIT);
  const [eliteCount, setEliteCount] = useState(DEFAULT_GA_CONFIG.ELITE_COUNT);
  const [mutationRate, setMutationRate] = useState(DEFAULT_GA_CONFIG.MUTATION_RATE);
  const [useCurrentAsSeed, setUseCurrentAsSeed] = useState(true);

  // Worker ref for cancellation
  const workerRef = React.useRef(null);

  // Get the currently selected matrix
  const selectedMatrix = matrices.find(m => m.id === selectedMatrixId);
  const matrix = selectedMatrix?.rows || [];

  // Derive column count from matrix dimensions
  const columnCount = matrix[0]?.length || 7;

  // Matrix CRUD operations
  const addMatrix = () => {
    const newMatrix = {
      id: generateId(),
      name: `Matrice ${matrices.length + 1}`,
      rows: generateDefaultMatrix()
    };
    setMatrices([...matrices, newMatrix]);
    setSelectedMatrixId(newMatrix.id);
  };

  const deleteMatrix = (matrixId) => {
    if (matrices.length <= 1) {
      alert('Deve esistere almeno una matrice');
      return;
    }
    const newMatrices = matrices.filter(m => m.id !== matrixId);
    setMatrices(newMatrices);
    if (selectedMatrixId === matrixId) {
      setSelectedMatrixId(newMatrices[0]?.id || null);
    }
  };

  const startEditName = (matrixId, currentName) => {
    setEditingName(matrixId);
    setEditNameValue(currentName);
  };

  const saveEditName = () => {
    if (editingName && editNameValue.trim()) {
      setMatrices(matrices.map(m =>
        m.id === editingName ? { ...m, name: editNameValue.trim() } : m
      ));
    }
    setEditingName(null);
    setEditNameValue('');
  };

  // Update the selected matrix's rows
  const setMatrix = (newRows) => {
    setMatrices(matrices.map(m =>
      m.id === selectedMatrixId ? { ...m, rows: newRows } : m
    ));
  };

  // Generate a single matrix (others held constant)
  const handleGenerate = () => {
    setIsGenerating(true);
    setGeneratingAll(false);
    setGenerationStats(null);

    // Terminate existing worker if any
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    const worker = new Worker(new URL('../scheduling/worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === 'PROGRESS') {
        setGenerationStats(payload);
      } else if (type === 'SUCCESS') {
        if (payload) {
          // Update the selected matrix with the generated rows
          setMatrices(matrices.map(m =>
            m.id === selectedMatrixId ? { ...m, rows: payload } : m
          ));
        } else {
          alert('Impossibile generare una matrice valida con i vincoli attuali.\nProva a rilassare i vincoli o cambiare i requisiti.');
        }
        setIsGenerating(false);
        worker.terminate();
        workerRef.current = null;
      } else if (type === 'ERROR') {
        console.error(payload);
        alert('Errore durante la generazione: ' + payload);
        setIsGenerating(false);
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.postMessage({
      type: 'GENERATE_MATRIX',
      payload: {
        targetMatrixId: selectedMatrixId,
        allMatrices: matrices,
        shiftTypes,
        constraints,
        coverageRules,
        columnCount,
        employees,
        year,
        month,
        rowCount: matrix.length > 0 ? matrix.length : null,
        options: {
          useCurrentAsSeed,
          POPULATION_SIZE: parseInt(popSize),
          MAX_GENERATIONS: parseInt(maxGen),
          TIMEOUT_MS: parseInt(timeoutSec) * 1000,
          STAGNATION_LIMIT: parseInt(stagnationLimit),
          ELITE_COUNT: parseInt(eliteCount),
          MUTATION_RATE: parseFloat(mutationRate)
        }
      }
    });
  };

  // Generate ALL matrices jointly
  const handleGenerateAll = () => {
    setIsGenerating(true);
    setGeneratingAll(true);
    setGenerationStats(null);

    if (workerRef.current) {
      workerRef.current.terminate();
    }

    const worker = new Worker(new URL('../scheduling/worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === 'PROGRESS') {
        setGenerationStats(payload);
      } else if (type === 'SUCCESS') {
        if (payload && typeof payload === 'object') {
          // payload is { matrixId: rows, ... }
          setMatrices(matrices.map(m => ({
            ...m,
            rows: payload[m.id] || m.rows
          })));
        } else {
          alert('Impossibile generare matrici valide con i vincoli attuali.\nProva a rilassare i vincoli o cambiare i requisiti.');
        }
        setIsGenerating(false);
        worker.terminate();
        workerRef.current = null;
      } else if (type === 'ERROR') {
        console.error(payload);
        alert('Errore durante la generazione: ' + payload);
        setIsGenerating(false);
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.postMessage({
      type: 'GENERATE_ALL_MATRICES',
      payload: {
        allMatrices: matrices,
        shiftTypes,
        constraints,
        coverageRules,
        columnCount,
        employees,
        year,
        month,
        options: {
          useCurrentAsSeed,
          POPULATION_SIZE: parseInt(popSize),
          MAX_GENERATIONS: parseInt(maxGen),
          TIMEOUT_MS: parseInt(timeoutSec) * 1000,
          STAGNATION_LIMIT: parseInt(stagnationLimit),
          ELITE_COUNT: parseInt(eliteCount),
          MUTATION_RATE: parseFloat(mutationRate)
        }
      }
    });
  };
  
  const handleCancel = () => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsGenerating(false);
    setGenerationStats(null);
  };

  const parseImportText = (text) => {
    setImportError('');
    const lines = text.trim().split('\n').filter(l => l.trim());

    if (lines.length === 0) {
      setImportError('Nessun dato trovato');
      return;
    }

    const newMatrix = [];
    const validShiftIds = shiftTypes.map(s => s.id);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const cells = line.split(/[\t,;]+|\s{2,}/).map(c => c.trim().toUpperCase()).filter(c => c);

      if (cells.length === 0) continue;

      const validatedRow = cells.map(cell => {
        if (validShiftIds.includes(cell)) return cell;
        const match = validShiftIds.find(id => cell.startsWith(id));
        return match || 'RP';
      });

      while (validatedRow.length < columnCount) validatedRow.push('RP');
      if (validatedRow.length > columnCount) validatedRow.length = columnCount;

      newMatrix.push(validatedRow);
    }

    if (newMatrix.length === 0) {
      setImportError('Impossibile analizzare i dati. Usa tab o virgola come separatore.');
      return;
    }

    setMatrix(newMatrix);
    setShowImport(false);
    setImportText('');
  };

  const handleFileImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        const text = jsonData.map(row => row.join('\t')).join('\n');
        setImportText(text);
        parseImportText(text);
      } catch (err) {
        setImportError('Errore nella lettura del file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const updateCell = (rowIndex, colIndex, value) => {
    setMatrix(matrix.map((row, ri) =>
      ri === rowIndex
        ? row.map((cell, ci) => ci === colIndex ? value : cell)
        : row
    ));
  };

  const addRow = () => {
    setMatrix([...matrix, Array(columnCount).fill('RP')]);
  };

  const removeRow = (rowIndex) => {
    setMatrix(matrix.filter((_, i) => i !== rowIndex));
  };

  return (
    <div className="space-y-4">
      {/* Matrix Tabs */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <LoadingOverlay
          visible={isGenerating && generatingAll}
          stats={generationStats}
          onCancel={handleCancel}
          allowGreedyFallback={false}
        />
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Grid size={18} />
            Matrici ({matrices.length})
          </h3>
          <div className="flex gap-2">
            {matrices.length > 1 && (
              <button
                onClick={handleGenerateAll}
                disabled={isGenerating}
                className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 disabled:opacity-50"
              >
                <Zap size={14} className={isGenerating ? "animate-spin" : ""} />
                {isGenerating ? "Gen..." : "Genera Tutte"}
              </button>
            )}
            <button
              onClick={addMatrix}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700"
            >
              <Plus size={14} />
              Nuova Matrice
            </button>
          </div>
        </div>

        {matrices.length === 0 ? (
          <div className="text-center py-4 text-slate-500 text-sm">
            Nessuna matrice. Clicca "Nuova Matrice" per crearne una.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {matrices.map(m => (
              <div
                key={m.id}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                  selectedMatrixId === m.id
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => setSelectedMatrixId(m.id)}
              >
                {editingName === m.id ? (
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEditName()}
                      className="w-24 px-1 py-0.5 text-xs border border-blue-300 rounded"
                      autoFocus
                    />
                    <button onClick={saveEditName} className="p-0.5 text-green-600 hover:bg-green-50 rounded">
                      <Check size={12} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-xs font-medium">{m.name}</span>
                    <span className="text-[10px] text-slate-400">({m.rows?.length || 0}×{m.rows?.[0]?.length || 7})</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); startEditName(m.id, m.name); }}
                      className="p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    >
                      <Edit2 size={10} />
                    </button>
                    {matrices.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteMatrix(m.id); }}
                        className="p-0.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor Card - only show if a matrix is selected */}
      {selectedMatrix && (
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
        <LoadingOverlay
          visible={isGenerating && !generatingAll}
          stats={generationStats}
          onCancel={handleCancel}
          allowGreedyFallback={false}
        />
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Grid size={18} />
            {selectedMatrix.name} ({matrix.length}×{columnCount})
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setShowImport(!showImport)}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-600 text-white rounded text-xs hover:bg-slate-700"
            >
              <Clipboard size={14} />
              Importa
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white rounded text-xs hover:bg-amber-600 disabled:opacity-50"
            >
              <Zap size={14} className={isGenerating ? "animate-spin" : ""} />
              {isGenerating ? "Gen..." : "Genera"}
            </button>
            <button
              onClick={addRow}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
            >
              <Plus size={14} />
              Riga
            </button>
          </div>
        </div>

        {/* Import Panel */}
        {showImport && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-slate-700">Importa Matrice</h4>
              <button
                onClick={() => setShowImport(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 text-sm">
                  <Upload size={16} className="text-slate-500" />
                  <span>Carica file Excel/CSV</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileImport}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Oppure incolla qui (tab/virgola/punto e virgola come separatore):
                </label>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={"M\tP\tN\tSN\tRP\tM\tP\nP\tN\tSN\tRP\tM\tP\tP\n..."}
                  className="w-full h-32 px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>

              {importError && (
                <div className="text-red-600 text-xs flex items-center gap-1">
                  <AlertCircle size={14} />
                  {importError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => parseImportText(importText)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  Applica
                </button>
                <button
                  onClick={() => { setShowImport(false); setImportText(''); setImportError(''); }}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300"
                >
                  Annulla
                </button>
              </div>

              <div className="text-xs text-slate-500">
                <strong>Formato:</strong> Una riga per pattern. Codici: {shiftTypes.map(s => s.id).join(', ')}
              </div>
            </div>
          </div>
        )}

        {/* Matrix Display */}
        {matrix.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Grid size={40} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Clicca "Genera" o "Importa" per creare la matrice</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 px-1 text-slate-600 w-10">#</th>
                  {Array.from({ length: columnCount }, (_, i) => (
                    <th key={i} className="py-2 px-1 text-slate-600">
                      {WEEKDAYS[i % 7]}
                    </th>
                  ))}
                  <th className="py-2 px-1 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, ri) => (
                  <tr key={ri} className="border-b border-slate-100">
                    <td className="py-1 px-1 text-slate-500 font-medium">R{ri + 1}</td>
                    {row.map((cell, ci) => {
                      const shiftType = shiftTypes.find(s => s.id === cell);
                      return (
                        <td key={ci} className="py-1 px-0.5">
                          <select
                            value={cell}
                            onChange={(e) => updateCell(ri, ci, e.target.value)}
                            className="w-11 h-6 text-xs border border-slate-200 rounded font-medium"
                            style={{
                              backgroundColor: shiftType?.color || '#fff',
                              color: shiftType?.textColor || '#000'
                            }}
                          >
                            {shiftTypes.map(st => (
                              <option key={st.id} value={st.id}>{st.id}</option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                    <td className="py-1 px-1">
                      <button
                        onClick={() => removeRow(ri)}
                        className="p-0.5 text-red-500"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* GA Parameters Card */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <Sliders size={16} />
          Parametri Ottimizzazione (GA)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
           <div>
             <label className="block text-[10px] font-medium text-slate-500 mb-1">Popolazione</label>
             <input
               type="number"
               value={popSize}
               onChange={(e) => setPopSize(Math.max(100, parseInt(e.target.value) || 0))}
               className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs"
               min="100"
             />
           </div>
           <div>
             <label className="block text-[10px] font-medium text-slate-500 mb-1">Max Generazioni</label>
             <input
               type="number"
               value={maxGen}
               onChange={(e) => setMaxGen(Math.max(1000, parseInt(e.target.value) || 0))}
               className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs"
               min="1000"
             />
           </div>
           <div>
             <label className="block text-[10px] font-medium text-slate-500 mb-1">Timeout (sec)</label>
             <input
               type="number"
               value={timeoutSec}
               onChange={(e) => setTimeoutSec(Math.max(5, parseInt(e.target.value) || 0))}
               className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs"
               min="5"
             />
           </div>
           <div>
             <label className="block text-[10px] font-medium text-slate-500 mb-1">Stagnazione (limit)</label>
             <input
               type="number"
               value={stagnationLimit}
               onChange={(e) => setStagnationLimit(Math.max(10, parseInt(e.target.value) || 0))}
               className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs"
               min="10"
             />
           </div>
           <div>
             <label className="block text-[10px] font-medium text-slate-500 mb-1">Elite Count</label>
             <input
               type="number"
               value={eliteCount}
               onChange={(e) => setEliteCount(Math.max(0, parseInt(e.target.value) || 0))}
               className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs"
               min="0"
             />
           </div>
           <div>
             <label className="block text-[10px] font-medium text-slate-500 mb-1">Mutation Rate (0-1)</label>
             <input
               type="number"
               step="0.01"
               value={mutationRate}
               onChange={(e) => setMutationRate(Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)))}
               className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs"
               min="0"
               max="1"
             />
           </div>
           <div className="md:col-span-3 flex items-center gap-2 pt-2 border-t border-slate-100">
             <input
               type="checkbox"
               id="useCurrentAsSeed"
               checked={useCurrentAsSeed}
               onChange={(e) => setUseCurrentAsSeed(e.target.checked)}
               className="h-3.5 w-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
             />
             <label htmlFor="useCurrentAsSeed" className="text-xs font-medium text-slate-700">
               Usa matrici attuali come punto di partenza (seeding)
             </label>
           </div>
        </div>
        <div className="mt-2 text-[10px] text-slate-400">
          Valori più alti migliorano la qualità della matrice ma richiedono più tempo di calcolo.
        </div>
      </div>
    </div>
  );
};

export default MatrixEditor;
