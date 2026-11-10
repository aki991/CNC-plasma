import { generateFence } from './panels';

self.onmessage = ({ data }: MessageEvent<Parameters<typeof generateFence>>) => {
  try {
    self.postMessage({ result: generateFence(...data) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Generisanje DXF-a nije uspelo.' });
  }
};

