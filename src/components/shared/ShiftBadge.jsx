import React from 'react';

/**
 * Visual badge for displaying a shift type
 *
 * @param {Object} props
 * @param {string} props.shift - Shift ID to display
 * @param {Array<Object>} props.shiftTypes - Array of shift type definitions
 * @param {string} props.size - Size variant: 'sm', 'md', or 'lg'
 */
const ShiftBadge = ({ shift, shiftTypes, size = 'md' }) => {
  const shiftType = shiftTypes.find(
    s => s.id === shift || shift?.startsWith(s.id + '_')
  );

  const sizes = {
    sm: 'w-7 h-5 text-xs',
    md: 'w-10 h-7 text-xs',
    lg: 'w-14 h-9 text-sm'
  };

  if (!shiftType) {
    return (
      <div
        className={`${sizes[size]} rounded flex items-center justify-center bg-gray-200 text-gray-500`}
      >
        {shift || '-'}
      </div>
    );
  }

  return (
    <div
      className={`${sizes[size]} rounded flex items-center justify-center font-semibold`}
      style={{
        backgroundColor: shiftType.color,
        color: shiftType.textColor
      }}
    >
      {shift}
    </div>
  );
};

export default ShiftBadge;
