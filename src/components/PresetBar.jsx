import React, { useState, useEffect, useRef } from 'react';
import {
  Save, Plus, Trash2, ChevronDown, FileSpreadsheet, Upload, Download, X
} from 'lucide-react';
import { generateId } from '../utils';

/**
 * Preset management bar with import/export functionality
 *
 * @param {Object} props
 * @param {Array<Object>} props.presets - Available presets
 * @param {string|null} props.currentPresetId - Currently selected preset ID
 * @param {Function} props.onSelect - Called when preset is selected
 * @param {Function} props.onSave - Called to save new preset
 * @param {Function} props.onDelete - Called to delete preset
 * @param {Function} props.onImport - Called with imported presets array
 * @param {string} props.facilityName - Current facility name (for display)
 */
const PresetBar = ({
  presets,
  currentPresetId,
  onSelect,
  onSave,
  onDelete,
  onImport,
  facilityName
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const dropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  const currentPreset = presets.find(p => p.id === currentPresetId);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = () => {
    if (newPresetName.trim()) {
      onSave(newPresetName.trim());
      setNewPresetName('');
      setShowSaveInput(false);
    }
  };

  // Export single preset (in file-compatible format)
  const handleExportPreset = (preset) => {
    const exportData = {
      version: '1.0',
      name: preset.name,
      description: `Preset ${preset.name} esportato il ${new Date().toLocaleDateString('it-IT')}`,
      config: preset.config
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${preset.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export all presets
  const handleExportAll = () => {
    if (presets.length === 0) {
      alert('Nessun preset da esportare');
      return;
    }
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      presets: presets.map(p => ({
        name: p.name,
        config: p.config
      }))
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `turni_presets_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import presets from file
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);

        // Handle different formats
        let presetsToImport = [];

        if (data.config) {
          // New single-file format: { name, config }
          presetsToImport = [{
            name: data.name || file.name.replace('.json', ''),
            config: data.config
          }];
        } else if (data.preset) {
          // Old single format: { preset: { name, config } }
          presetsToImport = [data.preset];
        } else if (data.presets && Array.isArray(data.presets)) {
          // Multi-preset format: { presets: [...] }
          presetsToImport = data.presets;
        } else {
          throw new Error('Formato file non valido');
        }

        // Assign new IDs to avoid conflicts
        const importedPresets = presetsToImport.map(p => ({
          id: generateId(),
          name: p.name,
          config: p.config,
          importedAt: new Date().toISOString()
        }));

        onImport(importedPresets);
        alert(`Importati ${importedPresets.length} preset!`);

      } catch (err) {
        alert('Errore importazione: ' + err.message);
      }
    };
    reader.readAsText(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors min-w-[200px] justify-between"
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-slate-500" />
            <span className="text-sm font-medium text-slate-700 truncate">
              {currentPreset?.name || facilityName || 'Nuovo Preset'}
            </span>
          </div>
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
            {/* Import/Export Section */}
            <div className="p-2 bg-slate-50 border-b border-slate-200">
              <div className="flex gap-2">
                <label className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-white border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 text-xs font-medium text-slate-600">
                  <Upload size={14} />
                  Importa
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImportFile}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={handleExportAll}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-xs font-medium text-slate-600"
                >
                  <Download size={14} />
                  Esporta Tutti
                </button>
              </div>
            </div>

            {/* Presets List */}
            <div className="max-h-64 overflow-y-auto">
              {presets.length === 0 ? (
                <div className="px-4 py-6 text-center text-slate-500 text-sm">
                  <FileSpreadsheet size={24} className="mx-auto mb-2 opacity-40" />
                  Nessun preset disponibile
                  <div className="text-xs mt-1">Crea un nuovo preset o importa da file</div>
                </div>
              ) : (
                presets.map(preset => (
                  <div
                    key={preset.id}
                    className={`flex items-center justify-between px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 ${
                      preset.id === currentPresetId ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div
                      className="flex-1 min-w-0"
                      onClick={() => { onSelect(preset.id); setIsOpen(false); }}
                    >
                      <div className="font-medium text-slate-800 truncate flex items-center gap-2">
                        {preset.name}
                        {preset.isFilePreset && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded flex items-center gap-0.5">
                            <FileSpreadsheet size={9} />
                            file
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {preset.config.employees?.length || 0} dipendenti • {preset.config.matrix?.length || 0} righe
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleExportPreset(preset); }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="Esporta preset"
                      >
                        <Download size={14} />
                      </button>
                      {!preset.isFilePreset && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(preset.id); }}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                          title="Elimina preset"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* New Preset Option */}
            <div
              className="px-4 py-3 bg-slate-50 hover:bg-slate-100 cursor-pointer flex items-center gap-2 text-blue-600 font-medium"
              onClick={() => { onSelect(null); setIsOpen(false); }}
            >
              <Plus size={16} />
              <span className="text-sm">Crea Nuovo Preset</span>
            </div>
          </div>
        )}
      </div>

      {showSaveInput ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="Nome preset..."
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-40"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <button
            onClick={handleSave}
            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
          >
            Salva
          </button>
          <button
            onClick={() => { setShowSaveInput(false); setNewPresetName(''); }}
            className="p-2 text-slate-400 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowSaveInput(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
        >
          <Save size={16} />
          Salva Preset
        </button>
      )}
    </div>
  );
};

export default PresetBar;
