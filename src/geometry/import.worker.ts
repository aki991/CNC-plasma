import { parseDxf } from './dxf';

self.onmessage = ({ data }: MessageEvent<{ files: string[]; tolerance: number }>) => {
  self.postMessage(data.files.map(raw => parseDxf(raw, undefined, data.tolerance)));
};

