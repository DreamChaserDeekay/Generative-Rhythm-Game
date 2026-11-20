import { useEffect, useState } from 'react';
import { api, type QueuedChart } from '../api/client';

/** A song's charts in the generator's queue: one being made, or only waiting their turn. */
export type SongMaking = 'making' | 'queued';

/** How often the song list asks what the generator is making. */
export const MAKING_POLL_MS = 4000;

/** The songs with a chart in the queue (GET /api/mapper/queue): "making" where one of their charts is being made. */
export function songsMaking(charts: readonly QueuedChart[]): Map<string, SongMaking> {
  const out = new Map<string, SongMaking>();
  for (const c of charts) if (out.get(c.songId) !== 'making') out.set(c.songId, c.state === 'making' ? 'making' : 'queued');
  return out;
}

export function sameMaking(a: ReadonlyMap<string, SongMaking>, b: ReadonlyMap<string, SongMaking>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, state] of a) if (b.get(id) !== state) return false;
  return true;
}

const NONE: ReadonlyMap<string, SongMaking> = new Map();

/**
 * The songs the generator is making charts of, asked every MAKING_POLL_MS while `on` (and at once
 * whenever `nudge` changes: a chart was just asked for, or made). A server that does not answer
 * leaves the last answer as it was.
 */
export function useMakingSongs(on: boolean, nudge?: unknown): ReadonlyMap<string, SongMaking> {
  const [making, setMaking] = useState<ReadonlyMap<string, SongMaking>>(NONE);
  useEffect(() => {
    if (!on) {
      setMaking(NONE);
      return;
    }
    let alive = true;
    const ask = async () => {
      try {
        const queue = await api.mapperQueue();
        if (!alive) return;
        const next = songsMaking(queue.charts ?? []);
        setMaking((prev) => (sameMaking(prev, next) ? prev : next));
      } catch {
        // (offline, or an older server: keep what was known)
      }
    };
    void ask();
    const timer = window.setInterval(() => void ask(), MAKING_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [on, nudge]);
  return making;
}
