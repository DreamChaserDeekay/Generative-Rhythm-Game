import { useEffect, useRef, useState } from 'react';
import { getAudioEngine, type BufferPlacement } from '../audio/AudioEngine';
import { practiceAudio } from '../audio/practiceAudio';
import type { Settings } from '../settings/settings';
import type { PlayRequest } from './App';
import { PlayController, type PlayOutcome } from './PlayController';

interface Props {
  request: PlayRequest;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onFinish: (outcome: PlayOutcome) => void;
  onQuit: () => void;
}

export function PlayScreen({ request, settings, onSettingsChange, onFinish, onQuit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<PlayController | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('불러오는 중…');

  useEffect(() => {
    let cancelled = false;
    let controller: PlayController | null = null;
    (async () => {
      try {
        const engine = getAudioEngine();
        await engine.unlock();
        let buffer = await request.loadAudio();
        let bufferPlacement: BufferPlacement = { originMs: 0, rate: 1 };
        if (request.practice && buffer) {
          setLoadingText(request.practice.rate !== 1 ? '연습용 음원 만드는 중…' : '불러오는 중…');
          ({ buffer, placement: bufferPlacement } = await practiceAudio(engine.ctx, buffer, request.practice));
        }
        if (cancelled || !canvasRef.current || !hudRef.current) return;
        controller = new PlayController(
          { request, buffer, bufferPlacement, settings, canvas: canvasRef.current, hudRoot: hudRef.current },
          { onFinish, onPauseChange: setPaused, onSettingsChange },
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
      {loading && !error && <div className="play-overlay"><div className="spinner" />{loadingText}</div>}
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
