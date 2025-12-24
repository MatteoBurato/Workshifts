import React from 'react';

/**
 * Tab navigation button component
 *
 * @param {Object} props
 * @param {boolean} props.active - Whether this tab is currently selected
 * @param {Function} props.onClick - Click handler
 * @param {React.ComponentType} props.icon - Lucide icon component
 * @param {string} props.label - Button label text
 */
const TabButton = ({ active, onClick, icon: Icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-sm ${
      active
        ? 'bg-slate-800 text-white'
        : 'bg-white text-slate-600 hover:bg-slate-100'
    }`}
  >
    <Icon size={16} />
    <span>{label}</span>
  </button>
);

export default TabButton;
