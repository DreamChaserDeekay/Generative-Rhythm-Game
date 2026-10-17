import { timeStretch } from './timeStretch';

interface StretchRequest {
  channels: Float32Array[];
  rate: number;
}

self.onmessage = (e: MessageEvent<StretchRequest>) => {
  const out = timeStretch(e.data.channels, e.data.rate);
  (self as unknown as Worker).postMessage({ channels: out }, out.map((c) => c.buffer));
};
