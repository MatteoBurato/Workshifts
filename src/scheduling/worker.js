import { generateMonthlySchedule } from './generator.js';
import { generateOptimalMatrix, generateOptimalMatricesJointly } from './matrixGenerator.js';

self.onmessage = (e) => {
  const { type, payload } = e.data;

  if (type === 'GENERATE') {
    try {
      const result = generateMonthlySchedule({
        ...payload,
        optimizerOptions: {
          ...payload.optimizerOptions,
          onProgress: (stats) => {
            self.postMessage({ type: 'PROGRESS', payload: stats });
          }
        }
      });
      self.postMessage({ type: 'SUCCESS', payload: result });
    } catch (error) {
      self.postMessage({ type: 'ERROR', payload: error.message });
    }
  } else if (type === 'GENERATE_MATRIX') {
    // Generate optimal single matrix (others held constant)
    try {
      const result = generateOptimalMatrix({
        ...payload,
        onProgress: (stats) => {
          self.postMessage({ type: 'PROGRESS', payload: stats });
        }
      });
      self.postMessage({ type: 'SUCCESS', payload: result });
    } catch (error) {
      self.postMessage({ type: 'ERROR', payload: error.message });
    }
  } else if (type === 'GENERATE_ALL_MATRICES') {
    // Generate optimal matrices jointly (all matrices evolved together)
    try {
      const result = generateOptimalMatricesJointly({
        ...payload,
        onProgress: (stats) => {
          self.postMessage({ type: 'PROGRESS', payload: stats });
        }
      });
      self.postMessage({ type: 'SUCCESS', payload: result });
    } catch (error) {
      self.postMessage({ type: 'ERROR', payload: error.message });
    }
  }
};
