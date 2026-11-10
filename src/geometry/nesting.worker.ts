import { optimize } from './nesting';

self.onmessage = ({ data }: MessageEvent<Parameters<typeof optimize>>) => {
  try {
    self.postMessage({ result: optimize(...data) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Optimizacija nije uspela.' });
  }
};

