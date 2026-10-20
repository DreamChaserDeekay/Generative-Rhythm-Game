import { useEffect, useRef, useState } from 'react';
import { getAudioEngine, type BufferPlacement } from '../audio/AudioEngine';
import type { KeysoundBank } from '../audio/keysounds';
import { practiceAudio } from '../audio/practiceAudio';
import type { StemName } from '../engine/types';
import { GamepadMenuBridge } from '../input/gamepad';
import { disposeSkinArt, loadSkinArt } from '../render/skinArt';
import { skinById } from '../render/skins';
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
  const bgRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<PlayController | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('불러오는 중…');

  useEffect(() => {
    let cancelled = false;
    let controller: PlayController | null = null;
    // skin textures load alongside the audio; without them the skin is drawn in code
    const artLoad = loadSkinArt(skinById(settings.skin, settings.customSkin));
    (async () => {
      try {
        const engine = getAudioEngine();
        await engine.unlock();
        let keysounds: KeysoundBank | null = null;
        if (request.loadKeysounds) {
          setLoadingText('키음 불러오는 중…');
          keysounds = await request.loadKeysounds();
          setLoadingText('배경음 준비 중…');
        }
        if (request.loadStems) setLoadingText('키음 준비 중… (처음 한 번은 스템을 나누느라 오래 걸릴 수 있습니다)');
        // keysounds are optional: without their stems the plain mix plays
        const [loaded, loadedStems] = await Promise.all([
          request.loadAudio(),
          request.loadStems?.().catch(() => null) ?? Promise.resolve(null),
        ]);
        let buffer = loaded;
        let stems = buffer && loadedStems ? loadedStems : new Map<StemName, AudioBuffer>();
        let bufferPlacement: BufferPlacement = { originMs: 0, rate: 1 };
        if (request.practice && buffer) {
          setLoadingText(request.practice.rate !== 1 ? '연습용 음원 만드는 중…' : '불러오는 중…');
          ({ buffer, stems, placement: bufferPlacement } = await practiceAudio(engine.ctx, buffer, request.practice, stems));
        }
        const art = await artLoad;
        if (cancelled || !canvasRef.current || !hudRef.current || !bgRef.current) {
          disposeSkinArt(art);
          return;
        }
        controller = new PlayController(
          { request, buffer, stems, keysounds, bufferPlacement, settings, canvas: canvasRef.current, hudRoot: hudRef.current, bgRoot: bgRef.current, art },
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

  // Loading (the first stem split can take a while) and a load error can be left with Esc.
  const waiting = loading || error !== null;
  useEffect(() => {
    if (!waiting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      onQuit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [waiting, onQuit]);

  // The pad works these menus too: B is Esc, A presses the focused button, the d-pad moves
  // between them. While paused, Start stays the play screen's own resume key.
  const menu = waiting || paused;
  useEffect(() => {
    if (!menu) return;
    const bridge = new GamepadMenuBridge({ ignore: paused ? ['Pad:B9'] : [] });
    bridge.start();
    return () => bridge.stop();
  }, [menu, paused]);

  return (
    <div className="play-screen" data-testid="play-screen">
      <div ref={bgRef} className="play-bg" data-testid="play-bg" />
      <canvas ref={canvasRef} className="play-canvas" />
      <div ref={hudRef} className="hud" />
      {loading && !error && (
        <div className="play-overlay" data-testid="play-loading">
          <div className="spinner" />
          {loadingText}
          <button className="quiet" data-testid="play-loading-cancel" onClick={onQuit}>취소 <kbd>Esc</kbd></button>
        </div>
      )}
      {error && (
        <div className="play-overlay">
          <p className="error">{error}</p>
          <button onClick={onQuit} autoFocus>돌아가기 <kbd>Esc</kbd></button>
        </div>
      )}
      {paused && (
        <div className="play-overlay pause-menu" data-testid="pause-menu">
          <h2>일시정지</h2>
          <button onClick={() => controllerRef.current?.resume()} autoFocus>계속하기 <kbd>Esc</kbd></button>
          <button onClick={() => controllerRef.current?.restart()}>다시 하기 <kbd>R</kbd></button>
          <button onClick={onQuit}>나가기 <kbd>Q</kbd></button>
        </div>
      )}
    </div>
  );
}
