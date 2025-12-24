import React, { useState } from 'react';
import { Plus, Trash2, X, Link } from 'lucide-react';
import { CONSTRAINT_TYPES } from '../constants';
import { generateId } from '../utils';
import { ShiftBadge } from './shared';

/**
 * Editor for managing shift sequence constraints
 *
 * @param {Object} props
 * @param {Array<Object>} props.constraints - Current constraints array
 * @param {Function} props.setConstraints - Setter for constraints
 * @param {Array<Object>} props.shiftTypes - Available shift types
 */
const ConstraintsEditor = ({ constraints, setConstraints, shiftTypes }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newConstraint, setNewConstraint] = useState({
    type: 'must_follow',
    shiftA: '',
    shiftB: '',
    shift: '',
    days: 1
  });

  const addConstraint = () => {
    const constraintType = CONSTRAINT_TYPES.find(ct => ct.id === newConstraint.type);
    if (!constraintType) return;

    // Validate required fields
    if (constraintType.params.includes('shiftA') && !newConstraint.shiftA) return;
    if (constraintType.params.includes('shiftB') && !newConstraint.shiftB) return;
    if (constraintType.params.includes('shift') && !newConstraint.shift) return;
    if (constraintType.params.includes('days') && newConstraint.days < 1) return;

    const constraint = {
      id: generateId(),
      type: newConstraint.type,
      enabled: true
    };

    if (constraintType.params.includes('shiftA')) constraint.shiftA = newConstraint.shiftA;
    if (constraintType.params.includes('shiftB')) constraint.shiftB = newConstraint.shiftB;
    if (constraintType.params.includes('shift')) constraint.shift = newConstraint.shift;
    if (constraintType.params.includes('days')) constraint.days = newConstraint.days;

    setConstraints([...constraints, constraint]);
    setNewConstraint({ type: 'must_follow', shiftA: '', shiftB: '', shift: '', days: 1 });
    setShowAddForm(false);
  };

  const toggleConstraint = (id) => {
    setConstraints(constraints.map(c =>
      c.id === id ? { ...c, enabled: !c.enabled } : c
    ));
  };

  const removeConstraint = (id) => {
    setConstraints(constraints.filter(c => c.id !== id));
  };

  const renderConstraintDescription = (constraint) => {
    const type = CONSTRAINT_TYPES.find(ct => ct.id === constraint.type);
    if (!type) return 'Vincolo sconosciuto';

    switch (constraint.type) {
      case 'must_follow':
        return (
          <>
            <ShiftBadge shift={constraint.shiftA} shiftTypes={shiftTypes} size="sm" />
            <span className="mx-1">→</span>
            <ShiftBadge shift={constraint.shiftB} shiftTypes={shiftTypes} size="sm" />
          </>
        );
      case 'cannot_follow':
        return (
          <>
            <ShiftBadge shift={constraint.shiftA} shiftTypes={shiftTypes} size="sm" />
            <span className="mx-1 text-red-500">↛</span>
            <ShiftBadge shift={constraint.shiftB} shiftTypes={shiftTypes} size="sm" />
          </>
        );
      case 'must_precede':
        return (
          <>
            <ShiftBadge shift={constraint.shiftA} shiftTypes={shiftTypes} size="sm" />
            <span className="mx-1">←</span>
            <ShiftBadge shift={constraint.shiftB} shiftTypes={shiftTypes} size="sm" />
          </>
        );
      case 'cannot_precede':
        return (
          <>
            <ShiftBadge shift={constraint.shiftA} shiftTypes={shiftTypes} size="sm" />
            <span className="mx-1 text-orange-500">↚</span>
            <ShiftBadge shift={constraint.shiftB} shiftTypes={shiftTypes} size="sm" />
          </>
        );
      case 'max_consecutive_without':
        return (
          <>
            Max <span className="font-bold mx-1">{constraint.days}</span> giorni senza{' '}
            <ShiftBadge shift={constraint.shift} shiftTypes={shiftTypes} size="sm" />
          </>
        );
      case 'max_consecutive':
        return (
          <>
            <ShiftBadge shift={constraint.shift} shiftTypes={shiftTypes} size="sm" />
            <span className="mx-1">max</span>
            <span className="font-bold">{constraint.days}×</span> consecutive
          </>
        );
      case 'min_gap':
        return (
          <>
            Min <span className="font-bold mx-1">{constraint.days}</span> giorni tra{' '}
            <ShiftBadge shift={constraint.shiftA} shiftTypes={shiftTypes} size="sm" /> e{' '}
            <ShiftBadge shift={constraint.shiftB} shiftTypes={shiftTypes} size="sm" />
          </>
        );
      default:
        return type.name;
    }
  };

  const selectedType = CONSTRAINT_TYPES.find(ct => ct.id === newConstraint.type);

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <Link size={18} />
          Vincoli di Sequenza ({constraints.filter(c => c.enabled).length} attivi)
        </h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
        >
          <Plus size={14} />
          Aggiungi Vincolo
        </button>
      </div>

      {/* Add Constraint Form */}
      {showAddForm && (
        <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-slate-700">Nuovo Vincolo</h4>
            <button
              onClick={() => setShowAddForm(false)}
              className="p-1 text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3">
            {/* Constraint Type Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Tipo di Vincolo
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {CONSTRAINT_TYPES.map(ct => {
                  const Icon = ct.icon;
                  return (
                    <button
                      key={ct.id}
                      onClick={() => setNewConstraint({ ...newConstraint, type: ct.id })}
                      className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-left ${
                        newConstraint.type === ct.id
                          ? `${ct.bgColor} border-current ${ct.color}`
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <Icon
                        size={18}
                        className={newConstraint.type === ct.id ? ct.color : 'text-slate-400'}
                      />
                      <div>
                        <div className="text-xs font-medium">{ct.name}</div>
                        <div className="text-[10px] text-slate-500">{ct.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Parameters */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {selectedType?.params.includes('shiftA') && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Turno A</label>
                  <select
                    value={newConstraint.shiftA}
                    onChange={(e) => setNewConstraint({ ...newConstraint, shiftA: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm min-w-[100px]"
                  >
                    <option value="">Seleziona...</option>
                    {shiftTypes.map(st => (
                      <option key={st.id} value={st.id}>{st.id} - {st.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedType?.params.includes('shiftB') && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Turno B</label>
                  <select
                    value={newConstraint.shiftB}
                    onChange={(e) => setNewConstraint({ ...newConstraint, shiftB: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm min-w-[100px]"
                  >
                    <option value="">Seleziona...</option>
                    {shiftTypes.map(st => (
                      <option key={st.id} value={st.id}>{st.id} - {st.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedType?.params.includes('shift') && !selectedType?.params.includes('shiftA') && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Turno</label>
                  <select
                    value={newConstraint.shift}
                    onChange={(e) => setNewConstraint({ ...newConstraint, shift: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm min-w-[100px]"
                  >
                    <option value="">Seleziona...</option>
                    {shiftTypes.map(st => (
                      <option key={st.id} value={st.id}>{st.id} - {st.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedType?.params.includes('days') && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Giorni</label>
                  <input
                    type="number"
                    value={newConstraint.days}
                    onChange={(e) =>
                      setNewConstraint({ ...newConstraint, days: parseInt(e.target.value) || 1 })
                    }
                    min="1"
                    max="31"
                    className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              )}

              <div className="flex-1" />

              <button
                onClick={addConstraint}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 mt-auto"
              >
                Aggiungi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Constraints List */}
      <div className="space-y-2">
        {constraints.length === 0 ? (
          <div className="text-center py-6 text-slate-500">
            <Link size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nessun vincolo definito</p>
            <p className="text-xs">Aggiungi vincoli per controllare la sequenza dei turni</p>
          </div>
        ) : (
          constraints.map(constraint => {
            const type = CONSTRAINT_TYPES.find(ct => ct.id === constraint.type);
            const Icon = type?.icon || Link;

            return (
              <div
                key={constraint.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  constraint.enabled
                    ? `${type?.bgColor || 'bg-slate-50'} border-slate-200`
                    : 'bg-slate-100 border-slate-200 opacity-60'
                }`}
              >
                <button
                  onClick={() => toggleConstraint(constraint.id)}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    constraint.enabled ? 'bg-green-500' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${
                      constraint.enabled ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>

                <Icon
                  size={18}
                  className={constraint.enabled ? (type?.color || 'text-slate-600') : 'text-slate-400'}
                />

                <div className="flex-1 flex items-center gap-2 text-sm">
                  {renderConstraintDescription(constraint)}
                </div>

                <button
                  onClick={() => removeConstraint(constraint.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ConstraintsEditor;
