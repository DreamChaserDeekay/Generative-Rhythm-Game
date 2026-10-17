import { useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '../audio/AudioEngine';
import type { SessionResult } from '../engine/session';
import type { Settings } from '../settings/settings';
import type { PlayRequest } from './App';
import { PlayController } from './PlayController';

interface Props {
  request: PlayRequest;
  settings: Settings;
  onFinish: (result: SessionResult) => void;
  onQuit: () => void;
}

export function PlayScreen({ request, settings, onFinish, onQuit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<PlayController | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let controller: PlayController | null = null;
    (async () => {
      try {
        await getAudioEngine().unlock();
        const buffer = await request.loadAudio();
        if (cancelled || !canvasRef.current || !hudRef.current) return;
        controller = new PlayController(
          { chart: request.chart, buffer, settings, autoPlay: request.autoPlay, canvas: canvasRef.current, hudRoot: hudRef.current },
          { onFinish, onPauseChange: setPaused },
        );
        controllerRef.current = controller;
        setLoading(false);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      controller?.dispose();
      controllerRef.current = null;
    };
    // The play screen is remounted (keyed) for every run, so its props are fixed for its lifetime.
  }, []);

  useEffect(() => {
    if (!paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyR') controllerRef.current?.restart();
      if (e.code === 'KeyQ') onQuit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused, onQuit]);

  return (
    <div className="play-screen" data-testid="play-screen">
      <canvas ref={canvasRef} className="play-canvas" />
      <div ref={hudRef} className="hud" />
      {loading && !error && <div className="play-overlay"><div className="spinner" />불러오는 중…</div>}
      {error && (
        <div className="play-overlay">
          <p className="error">{error}</p>
          <button onClick={onQuit}>돌아가기</button>
        </div>
      )}
      {paused && (
        <div className="play-overlay pause-menu" data-testid="pause-menu">
          <h2>일시정지</h2>
          <button onClick={() => controllerRef.current?.resume()}>계속하기 <kbd>Esc</kbd></button>
          <button onClick={() => controllerRef.current?.restart()}>다시 하기 <kbd>R</kbd></button>
          <button onClick={onQuit}>나가기 <kbd>Q</kbd></button>
        </div>
      )}
    </div>
  );
}
