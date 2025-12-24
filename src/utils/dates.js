/**
 * Date utility functions for calendar operations
 */

/**
 * Get the number of days in a given month
 * @param {number} year - Full year (e.g., 2025)
 * @param {number} month - Month index (0-11)
 * @returns {number} Number of days in the month
 */
export const getDaysInMonth = (year, month) => {
  return new Date(year, month + 1, 0).getDate();
};

/**
 * Get the day of week for the first day of a month
 * Returns Monday = 0, Tuesday = 1, ..., Sunday = 6 (European format)
 * @param {number} year - Full year
 * @param {number} month - Month index (0-11)
 * @returns {number} Day of week (0 = Monday, 6 = Sunday)
 */
export const getFirstDayOfMonth = (year, month) => {
  const day = new Date(year, month, 1).getDay();
  // Convert from Sunday = 0 to Monday = 0
  return day === 0 ? 6 : day - 1;
};

/**
 * Calculate actual weeks in a specific month (more accurate than 4.33)
 * @param {number} year - Full year
 * @param {number} month - Month index (0-11)
 * @returns {number} Number of weeks (with decimals)
 */
export const getWeeksInMonth = (year, month) => {
  return getDaysInMonth(year, month) / 7;
};

/**
 * Calculate monthly contract hours based on weekly hours
 * @param {number} weeklyHours - Contract hours per week
 * @param {number} year - Full year
 * @param {number} month - Month index (0-11)
 * @returns {number} Expected monthly hours (rounded)
 */
export const calculateMonthlyHours = (weeklyHours, year, month) => {
  const weeks = getWeeksInMonth(year, month);
  return Math.round(weeklyHours * weeks);
};
