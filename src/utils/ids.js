/**
 * ID generation utilities
 */

/**
 * Generate a random alphanumeric ID
 * @param {number} length - Length of the ID (default: 9)
 * @returns {string} Random ID string
 */
export const generateId = (length = 9) => {
  return Math.random().toString(36).substring(2, 2 + length);
};

/**
 * Generate a prefixed ID for specific entity types
 * @param {string} prefix - Prefix for the ID (e.g., 'emp', 'constraint')
 * @returns {string} Prefixed ID string
 */
export const generatePrefixedId = (prefix) => {
  return `${prefix}-${generateId()}`;
};
