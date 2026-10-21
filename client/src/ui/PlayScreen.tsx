import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { getAudioEngine, type BufferPlacement } from '../audio/AudioEngine';
import type { KeysoundBank } from '../audio/keysounds';
import { practiceAudio } from '../audio/practiceAudio';
import { isReplay, type ReplayData } from '../engine/replay';
import type { StemName } from '../engine/types';
import { GamepadMenuBridge } from '../input/gamepad';
import { disposeSkinArt, loadSkinArt } from '../render/skinArt';
import { skinById } from '../render/skins';
import { styleOf } from '../render/TrackRenderer';
import { padPlayOf, songOffsetOf, type Settings } from '../settings/settings';
import type { PlayRequest } from './App';
import { loadHudFont } from './Hud';
import { LoadingCard } from './LoadingCard';
import { PlayController, type PlayOutcome } from './PlayController';
import { practicePrerollMs } from './practiceLead';

interface Props {
  request: PlayRequest;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onFinish: (outcome: PlayOutcome) => void;
  onQuit: () => void;
}

/** The best play's replay a BEST pacemaker follows note by note (null: not kept, not wanted, not loaded or not a replay). */
function bestReplayOf(request: PlayRequest, settings: Settings): Promise<ReplayData | null> {
  const best = request.best;
  if (settings.pacemaker !== 'BEST' || request.practice || !best?.hasReplay || best.replay || best.scoreId === undefined) return Promise.resolve(null);
  return api
    .replay(best.scoreId)
    .then((r: unknown) => (isReplay(r) ? r : null))
    .catch(() => null);
}

export function PlayScreen({ request, settings, onSettingsChange, onFinish, onQuit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<PlayController | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // set with the controller, and read by the loading's Esc at the key: the effect that lets go of
  // that key runs only after the next paint, and an Esc meanwhile belongs to the play (it pauses)
  const started = useRef(false);
  const [loadingText, setLoadingText] = useState('불러오는 중…');

  useEffect(() => {
    let cancelled = false;
    let controller: PlayController | null = null;
    // skin textures and type load alongside the audio; without the textures the skin is drawn in code
    const skin = skinById(settings.skin, settings.customSkin);
    const artLoad = loadSkinArt(skin);
    const fontLoad = loadHudFont(styleOf(skin).type);
    const bestReplayLoad = bestReplayOf(request, settings);
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
        const practice = request.practice;
        if (practice && buffer) {
          setLoadingText(practice.rate !== 1 ? '연습용 음원 만드는 중…' : '불러오는 중…');
          const { chart } = request;
          const visual = settings.visualOffsetMs * practice.rate - songOffsetOf(settings, chart.meta.songId);
          const durationMs = Math.max(buffer.duration * 1000, chart.meta.durationMs ?? 0);
          const prerollMs = practicePrerollMs(chart, practice, settings.scrollMode, durationMs, visual);
          ({ buffer, stems, placement: bufferPlacement } = await practiceAudio(engine.ctx, buffer, practice, stems, prerollMs));
        }
        const [art, , bestReplay] = await Promise.all([artLoad, fontLoad, bestReplayLoad]);
        if (cancelled || !canvasRef.current || !hudRef.current || !bgRef.current) {
          disposeSkinArt(art);
          return;
        }
        controller = new PlayController(
          { request, buffer, stems, keysounds, bufferPlacement, settings, canvas: canvasRef.current, hudRoot: hudRef.current, bgRoot: bgRef.current, art, bestReplay },
          { onFinish, onPauseChange: setPaused, onSettingsChange },
        );
        controllerRef.current = controller;
        started.current = true;
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

  // The pause menu: R and Q, and ↑↓ between its buttons as in the other menus (a pad's d-pad
  // comes as the same keys; SPEED is not changed while paused).
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyR') controllerRef.current?.restart();
      if (e.code === 'KeyQ') onQuit();
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        const buttons = [...(menuRef.current?.querySelectorAll('button') ?? [])];
        if (buttons.length === 0) return;
        e.preventDefault();
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const dir = e.code === 'ArrowDown' ? 1 : -1;
        buttons[at < 0 ? 0 : (at + dir + buttons.length) % buttons.length].focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused, onQuit]);

  // Loading (the first stem split can take a while) and a load error can be left with Esc.
  const waiting = loading || error !== null;
  useEffect(() => {
    if (!waiting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || started.current) return;
      e.preventDefault();
      onQuit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [waiting, onQuit]);

  // The pad works these menus too: B is Esc, A presses the focused button, the d-pad moves
  // between them. While paused, Start and Select stay the play screen's own: Start resumes, and
  // Select is no Esc there (it would resume before Select + Start retries).
  const menu = waiting || paused;
  const { start, select } = padPlayOf(settings);
  useEffect(() => {
    if (!menu) return;
    const bridge = new GamepadMenuBridge({ ignore: paused ? [start, select].filter((c): c is string => c !== null) : [] });
    bridge.start();
    return () => bridge.stop();
  }, [menu, paused, start, select]);

  return (
    <div className="play-screen" data-testid="play-screen">
      <div ref={bgRef} className="play-bg" data-testid="play-bg" />
      <canvas ref={canvasRef} className="play-canvas" />
      <div ref={hudRef} className="hud" />
      {loading && !error && <LoadingCard request={request} settings={settings} text={loadingText} onCancel={onQuit} />}
      {error && (
        <div className="play-overlay">
          <p className="error">{error}</p>
          <button onClick={onQuit} autoFocus>돌아가기 <kbd>Esc</kbd></button>
        </div>
      )}
      {paused && (
        <div ref={menuRef} className="play-overlay pause-menu" data-testid="pause-menu">
          <h2>일시정지</h2>
          <button onClick={() => controllerRef.current?.resume()} autoFocus>계속하기 <kbd>Esc</kbd></button>
          <button onClick={() => controllerRef.current?.restart()}>다시 하기 <kbd>R</kbd></button>
          <button onClick={onQuit}>나가기 <kbd>Q</kbd></button>
        </div>
      )}
    </div>
  );
}
