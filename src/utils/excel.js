/**
 * Excel import/export utilities using SheetJS
 */

import * as XLSX from 'xlsx';
import { MONTHS } from '../constants';
import { getDaysInMonth, getFirstDayOfMonth } from './dates';

const WEEKDAYS = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'];

/**
 * Export schedule to Excel file
 * @param {Object} params - Export parameters
 * @param {Object} params.schedule - Generated schedule object
 * @param {Array} params.employees - Employee list
 * @param {Array} params.shiftTypes - Shift type definitions
 * @param {number} params.year - Year
 * @param {number} params.month - Month index (0-11)
 * @param {Object} params.facility - Facility configuration
 */
export const exportToExcel = ({ schedule, employees, shiftTypes, year, month, facility }) => {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const wb = XLSX.utils.book_new();
  const data = [];

  // Header row with month/year and facility name
  const headerRow = ['', MONTHS[month], year];
  for (let i = 3; i < daysInMonth + 5; i++) headerRow.push('');
  headerRow[daysInMonth + 3] = facility.name;
  data.push(headerRow);

  // Day numbers row
  const dayNumRow = ['Ore Contr.', 'Cognome Nome'];
  for (let i = 1; i <= daysInMonth; i++) dayNumRow.push(i);
  dayNumRow.push('TOT ORE', 'DIFF');
  data.push(dayNumRow);

  // Day names row
  const dayNameRow = ['', ''];
  for (let i = 0; i < daysInMonth; i++) {
    const dow = (firstDay + i) % 7;
    dayNameRow.push(WEEKDAYS[dow]);
  }
  dayNameRow.push('', '');
  data.push(dayNameRow);

  // Employee rows
  employees.forEach(emp => {
    const empSchedule = schedule[emp.id];
    if (!empSchedule) return;

    const shiftRow = [emp.contractHours, `${emp.surname} ${emp.name}`];
    empSchedule.shifts.forEach(shift => shiftRow.push(shift));
    shiftRow.push(empSchedule.totalHours, empSchedule.hoursDiff);
    data.push(shiftRow);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  const colWidths = [{ wch: 10 }, { wch: 22 }];
  for (let i = 0; i < daysInMonth; i++) colWidths.push({ wch: 5 });
  colWidths.push({ wch: 8 }, { wch: 6 });
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, facility.name);

  const fileName = `Turni_${facility.name}_${MONTHS[month]}_${year}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

/**
 * Parse Excel/CSV file for matrix import
 * @param {ArrayBuffer} data - File data as ArrayBuffer
 * @returns {Array<Array<string>>} Parsed data as 2D array
 */
export const parseExcelFile = (data) => {
  const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
};

/**
 * Parse previous month schedule from Excel file
 * @param {ArrayBuffer} data - File data as ArrayBuffer
 * @param {Array} employees - Employee list for matching
 * @returns {Object} Object with employeeId -> shifts array mapping and stats
 */
export const parsePreviousMonthSchedule = (data, employees) => {
  const jsonData = parseExcelFile(data);

  const previousSchedule = {};
  let matchedCount = 0;

  for (let rowIdx = 0; rowIdx < jsonData.length; rowIdx++) {
    const row = jsonData[rowIdx];
    if (!row || row.length < 3) continue;

    // Try to find employee name in column 1 or 2
    const possibleName = String(row[1] || '').trim().toUpperCase();
    if (!possibleName) continue;

    // Match with employees
    const matchedEmp = employees.find(emp => {
      const fullName = `${emp.surname} ${emp.name}`.toUpperCase();
      const reverseName = `${emp.name} ${emp.surname}`.toUpperCase();
      return possibleName.includes(emp.surname?.toUpperCase()) ||
             fullName.includes(possibleName) ||
             reverseName.includes(possibleName) ||
             possibleName.includes(fullName);
    });

    if (matchedEmp) {
      // Extract shifts (columns 2 onwards, skip last 2 which are totals)
      const shifts = [];
      for (let col = 2; col < row.length - 2; col++) {
        const cellValue = String(row[col] || '').trim().toUpperCase();
        if (cellValue && cellValue !== '') {
          shifts.push(cellValue);
        }
      }

      if (shifts.length > 0) {
        previousSchedule[matchedEmp.id] = shifts;
        matchedCount++;
      }
    }
  }

  return {
    schedule: previousSchedule,
    stats: {
      matched: matchedCount,
      total: employees.length,
      daysFound: Object.values(previousSchedule)[0]?.length || 0
    }
  };
};
