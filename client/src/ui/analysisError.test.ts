import { describe, expect, it } from 'vitest';
import { failureReason } from './analysisError';

describe('analysis errors', () => {
  it('say why in a short Korean line', () => {
    expect(failureReason('decode failed: unsupported codec')).toBe('음원을 읽지 못했습니다');
    expect(failureReason('디코딩된 오디오가 비어 있습니다')).toBe('음원을 읽지 못했습니다');
    expect(failureReason('MemoryError')).toMatch(/^메모리가 모자랐습니다/);
    expect(failureReason("[Errno 2] No such file or directory: 'audio.flac'")).toBe('음원 파일을 찾지 못했습니다');
    expect(failureReason('CUDA error: device-side assert triggered')).toBe('ML 분석 도구에서 오류가 났습니다');
    expect(failureReason('signal is too short')).toBe('곡이 너무 짧거나 소리가 거의 없습니다');
    expect(failureReason('KeyError: tempo')).toBe('분석 중에 오류가 났습니다');
    // an empty array somewhere is no sign of a silent song
    expect(failureReason('ValueError: attempt to get argmax of an empty sequence')).toBe('분석 중에 오류가 났습니다');
    expect(failureReason('the audio is silent')).toBe('곡이 너무 짧거나 소리가 거의 없습니다');
    expect(failureReason(null)).toBe('분석 중에 오류가 났습니다');
  });
});
