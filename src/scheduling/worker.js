import { generateMonthlySchedule } from './generator.js';
import { generateOptimalMatrix } from './matrixGenerator.js';

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
  }
};