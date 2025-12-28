import React, { useState } from 'react';
import { Users, Plus, Trash2 } from 'lucide-react';
import { generateId } from '../utils';

/**
 * Employee management panel
 *
 * @param {Object} props
 * @param {Array<Object>} props.employees - Employee list
 * @param {Function} props.setEmployees - Setter for employees
 * @param {Array<Object>} props.shiftTypes - Available shift types
 * @param {Array<Object>} props.matrices - Available matrices for assignment
 */
const EmployeesPanel = ({ employees, setEmployees, shiftTypes = [], matrices = [] }) => {
  const [newEmp, setNewEmp] = useState({
    name: '',
    surname: '',
    contractHours: 38,
    excludedShifts: [],
    matrixId: null // null means "auto" (first available matrix)
  });

  const addEmployee = () => {
    if (newEmp.name || newEmp.surname) {
      setEmployees([...employees, { id: generateId(), ...newEmp }]);
      setNewEmp({ name: '', surname: '', contractHours: 38, excludedShifts: [], matrixId: null });
    }
  };

  const updateEmployee = (id, field, value) => {
    setEmployees(employees.map(emp =>
      emp.id === id ? { ...emp, [field]: value } : emp
    ));
  };

  const toggleExclusion = (empId, currentExcluded, shiftId) => {
    const excluded = currentExcluded || [];
    const newExcluded = excluded.includes(shiftId)
      ? excluded.filter(id => id !== shiftId)
      : [...excluded, shiftId];
    updateEmployee(empId, 'excludedShifts', newExcluded);
  };

  const toggleNewEmpExclusion = (shiftId) => {
    const excluded = newEmp.excludedShifts;
    const newExcluded = excluded.includes(shiftId)
      ? excluded.filter(id => id !== shiftId)
      : [...excluded, shiftId];
    setNewEmp({ ...newEmp, excludedShifts: newExcluded });
  };

  const removeEmployee = (id) => {
    setEmployees(employees.filter(e => e.id !== id));
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
      <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <Users size={18} />
        Dipendenti ({employees.length})
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-600">Cognome</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-600">Nome</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-600">Ore/Sett</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-600">Ore/Mese (stima)</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-600">Matrice</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-600">Escludi Turni</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="border-b border-slate-100">
                <td className="py-1.5 px-2">
                  <input
                    type="text"
                    value={emp.surname || ''}
                    onChange={(e) => updateEmployee(emp.id, 'surname', e.target.value)}
                    className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                  />
                </td>
                <td className="py-1.5 px-2">
                  <input
                    type="text"
                    value={emp.name || ''}
                    onChange={(e) => updateEmployee(emp.id, 'name', e.target.value)}
                    className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                  />
                </td>
                <td className="py-1.5 px-2">
                  <input
                    type="number"
                    value={emp.contractHours}
                    onChange={(e) => updateEmployee(emp.id, 'contractHours', parseInt(e.target.value) || 0)}
                    className="w-16 px-2 py-1 border border-slate-200 rounded text-xs"
                  />
                </td>
                <td className="py-1.5 px-2 text-xs text-slate-500">
                  ~{Math.round(emp.contractHours * 4.33)}h
                </td>
                <td className="py-1.5 px-2">
                  <select
                    value={emp.matrixId || ''}
                    onChange={(e) => updateEmployee(emp.id, 'matrixId', e.target.value || null)}
                    className="w-24 px-1.5 py-1 border border-slate-200 rounded text-xs"
                  >
                    <option value="">Auto</option>
                    {matrices.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 px-2">
                  <div className="flex flex-wrap gap-1">
                    {shiftTypes.map(st => {
                      const isExcluded = (emp.excludedShifts || []).includes(st.id);
                      return (
                        <button
                          key={st.id}
                          onClick={() => toggleExclusion(emp.id, emp.excludedShifts, st.id)}
                          className={`px-1.5 py-0.5 text-[10px] rounded border ${
                            isExcluded
                              ? 'bg-red-50 border-red-200 text-red-600 line-through opacity-70'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                          title={isExcluded ? `Includi ${st.name}` : `Escludi ${st.name}`}
                        >
                          {st.id}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="py-1.5 px-2">
                  <button
                    onClick={() => removeEmployee(emp.id)}
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

      {/* Add New Employee */}
      <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={newEmp.surname}
          onChange={(e) => setNewEmp({ ...newEmp, surname: e.target.value })}
          placeholder="Cognome"
          className="w-28 px-2 py-1.5 border border-slate-300 rounded text-xs"
        />
        <input
          type="text"
          value={newEmp.name}
          onChange={(e) => setNewEmp({ ...newEmp, name: e.target.value })}
          placeholder="Nome"
          className="w-28 px-2 py-1.5 border border-slate-300 rounded text-xs"
        />
        <input
          type="number"
          value={newEmp.contractHours}
          onChange={(e) => setNewEmp({ ...newEmp, contractHours: parseInt(e.target.value) || 0 })}
          placeholder="Ore"
          className="w-14 px-2 py-1.5 border border-slate-300 rounded text-xs"
        />

        <select
          value={newEmp.matrixId || ''}
          onChange={(e) => setNewEmp({ ...newEmp, matrixId: e.target.value || null })}
          className="w-24 px-1.5 py-1.5 border border-slate-300 rounded text-xs"
        >
          <option value="">Auto</option>
          {matrices.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 mr-1">Escludi:</span>
          {shiftTypes.map(st => {
            const isExcluded = newEmp.excludedShifts.includes(st.id);
            return (
              <button
                key={st.id}
                onClick={() => toggleNewEmpExclusion(st.id)}
                className={`px-1.5 py-0.5 text-[10px] rounded border ${
                  isExcluded
                    ? 'bg-red-50 border-red-200 text-red-600 line-through opacity-70'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {st.id}
              </button>
            );
          })}
        </div>

        <button
          onClick={addEmployee}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs ml-auto"
        >
          <Plus size={14} />
          Aggiungi
        </button>
      </div>
    </div>
  );
};

export default EmployeesPanel;
