import React, { useState } from 'react';
import { Settings, Clock, Plus, Trash2, Users } from 'lucide-react';
import { ShiftBadge } from './shared';
import ConstraintsEditor from './ConstraintsEditor';

/**
 * Component to manage coverage rules (flexible requirements)
 */
const CoverageRulesEditor = ({ coverageRules = [], setCoverageRules, shiftTypes }) => {
  const [newRule, setNewRule] = useState({ min: 1, shiftIds: [] });

  const toggleShift = (shiftId) => {
    setNewRule(prev => ({
      ...prev,
      shiftIds: prev.shiftIds.includes(shiftId)
        ? prev.shiftIds.filter(id => id !== shiftId)
        : [...prev.shiftIds, shiftId]
    }));
  };

  const addRule = () => {
    if (newRule.min > 0 && newRule.shiftIds.length > 0) {
      setCoverageRules([
        ...(coverageRules || []),
        { ...newRule, id: Date.now().toString() }
      ]);
      setNewRule({ min: 1, shiftIds: [] });
    }
  };

  const removeRule = (id) => {
    setCoverageRules((coverageRules || []).filter(r => r.id !== id));
  };

  // Helper to get rule string description
  const getRuleDescription = (rule) => {
    const names = rule.shiftIds.map(sid => {
      const st = shiftTypes.find(s => s.id === sid);
      return st ? st.name : sid;
    }).join(' o ');
    return `${rule.min} ${names}`;
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
      <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <Users size={18} />
        Copertura Giornaliera
      </h3>
      
      <p className="text-xs text-slate-500 mb-4">
        Definisci quante persone devono essere presenti ogni giorno.
        Puoi specificare combinazioni di turni (es. 3 persone in "Mattina" o "Pomeriggio").
      </p>

      {/* List of existing rules */}
      <div className="space-y-2 mb-4">
        {(coverageRules || []).map(rule => (
          <div key={rule.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded border border-slate-100">
            <span className="font-bold text-slate-700 w-8 text-center">{rule.min}</span>
            <div className="flex flex-wrap gap-1 flex-1 items-center">
              <span className="text-xs text-slate-500 mr-1">persone in:</span>
              {rule.shiftIds.map(sid => (
                <ShiftBadge key={sid} shift={sid} shiftTypes={shiftTypes} size="sm" />
              ))}
            </div>
            <button 
              onClick={() => removeRule(rule.id)} 
              className="text-slate-400 hover:text-red-500 transition-colors p-1"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {(!coverageRules || coverageRules.length === 0) && (
          <div className="text-sm text-slate-400 italic text-center py-2">
            Nessuna regola definita
          </div>
        )}
      </div>

      {/* Add New Rule */}
      <div className="flex flex-col gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600">Nuova Regola</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Min</label>
            <input 
              type="number" 
              value={newRule.min} 
              onChange={e => setNewRule({...newRule, min: parseInt(e.target.value)||0})} 
              className="w-14 px-2 py-1.5 border rounded text-sm font-medium text-center" 
              min="1"
            />
          </div>
          
          <div className="flex flex-col flex-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Turni Ammessi</label>
            <div className="flex flex-wrap gap-1.5">
              {shiftTypes.filter(s => s.hours > 0).map(st => {
                const isSelected = newRule.shiftIds.includes(st.id);
                return (
                  <button
                    key={st.id}
                    onClick={() => toggleShift(st.id)}
                    className={`
                      px-2 py-1 rounded text-xs font-medium transition-all border
                      ${isSelected 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }
                    `}
                  >
                    {st.id}
                  </button>
                );
              })}
            </div>
          </div>

          <button 
            onClick={addRule} 
            disabled={newRule.min < 1 || newRule.shiftIds.length === 0}
            className={`
              p-2 rounded-lg self-end mb-0.5 transition-colors
              ${(newRule.min < 1 || newRule.shiftIds.length === 0)
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
              }
            `}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Facility configuration panel
 * Handles facility settings, shift types, and constraints
 */
const FacilityConfig = ({
  facility,
  setFacility,
  shiftTypes,
  setShiftTypes,
  constraints,
  setConstraints
}) => {
  const [newST, setNewST] = useState({
    id: '',
    name: '',
    hours: 0,
    color: '#60A5FA',
    textColor: '#000000'
  });

  const addShiftType = () => {
    if (newST.id && !shiftTypes.find(s => s.id === newST.id)) {
      setShiftTypes([...shiftTypes, newST]);
      setNewST({ id: '', name: '', hours: 0, color: '#60A5FA', textColor: '#000000' });
    }
  };

  const updateShiftType = (id, field, value) => {
    setShiftTypes(shiftTypes.map(s =>
      s.id === id ? { ...s, [field]: value } : s
    ));
  };

  const removeShiftType = (id) => {
    setShiftTypes(shiftTypes.filter(s => s.id !== id));
  };

  const setCoverageRules = (newRules) => {
    setFacility({
      ...facility,
      coverageRules: newRules
    });
  };

  return (
    <div className="space-y-6">
      {/* Facility Settings */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
        <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <Settings size={18} />
          Struttura
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nome</label>
            <input
              type="text"
              value={facility.name}
              onChange={(e) => setFacility({ ...facility, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="Es. CEDRO"
            />
          </div>
        </div>
      </div>

      {/* Coverage Rules */}
      <CoverageRulesEditor
        coverageRules={facility.coverageRules}
        setCoverageRules={setCoverageRules}
        shiftTypes={shiftTypes}
      />

      {/* Shift Types */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
        <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <Clock size={18} />
          Tipi di Turno
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-2 text-xs font-medium text-slate-600">Codice</th>
                <th className="text-left py-2 px-2 text-xs font-medium text-slate-600">Nome</th>
                <th className="text-left py-2 px-2 text-xs font-medium text-slate-600">Ore</th>
                <th className="text-left py-2 px-2 text-xs font-medium text-slate-600">Colore</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {shiftTypes.map((st) => (
                <tr key={st.id} className="border-b border-slate-100">
                  <td className="py-1.5 px-2">
                    <ShiftBadge shift={st.id} shiftTypes={shiftTypes} size="sm" />
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="text"
                      value={st.name}
                      onChange={(e) => updateShiftType(st.id, 'name', e.target.value)}
                      className="w-28 px-2 py-1 border border-slate-200 rounded text-xs"
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="number"
                      value={st.hours}
                      onChange={(e) => updateShiftType(st.id, 'hours', parseFloat(e.target.value) || 0)}
                      className="w-14 px-2 py-1 border border-slate-200 rounded text-xs"
                      step="0.5"
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="color"
                      value={st.color}
                      onChange={(e) => updateShiftType(st.id, 'color', e.target.value)}
                      className="w-8 h-6 rounded cursor-pointer border-0"
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <button
                      onClick={() => removeShiftType(st.id)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add New Shift Type */}
        <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2">
          <input
            type="text"
            value={newST.id}
            onChange={(e) => setNewST({ ...newST, id: e.target.value.toUpperCase() })}
            placeholder="COD"
            className="w-14 px-2 py-1.5 border border-slate-300 rounded text-xs"
          />
          <input
            type="text"
            value={newST.name}
            onChange={(e) => setNewST({ ...newST, name: e.target.value })}
            placeholder="Nome"
            className="w-24 px-2 py-1.5 border border-slate-300 rounded text-xs"
          />
          <input
            type="number"
            value={newST.hours}
            onChange={(e) => setNewST({ ...newST, hours: parseFloat(e.target.value) || 0 })}
            placeholder="Ore"
            className="w-14 px-2 py-1.5 border border-slate-300 rounded text-xs"
          />
          <input
            type="color"
            value={newST.color}
            onChange={(e) => setNewST({ ...newST, color: e.target.value })}
            className="w-8 h-7 rounded cursor-pointer"
          />
          <button
            onClick={addShiftType}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs"
          >
            <Plus size={14} />
            Aggiungi
          </button>
        </div>
      </div>

      {/* Constraints Editor */}
      <ConstraintsEditor
        constraints={constraints}
        setConstraints={setConstraints}
        shiftTypes={shiftTypes}
      />
    </div>
  );
};

export default FacilityConfig;