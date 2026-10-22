/** Why an analysis failed, as the song select says it first (the server's own words stay folded under it). */

const REASONS: [RegExp, string][] = [
  [/MemoryError|out of memory|cannot allocate|bad_alloc|ENOMEM/i, '메모리가 모자랐습니다. 다른 프로그램을 닫고 다시 분석하세요'],
  [/No such file|FileNotFound|Errno 2\b/i, '음원 파일을 찾지 못했습니다'],
  [/demucs|torch|cuda|onnx|beat.?this|allin1|basic.?pitch|madmom/i, 'ML 분석 도구에서 오류가 났습니다'],
  [/decod|codec|soundfile|libsndfile|format not recogni[sz]ed|error opening|오디오/i, '음원을 읽지 못했습니다'],
  [/too short|silen|무음|너무 짧/i, '곡이 너무 짧거나 소리가 거의 없습니다'],
];

/** A short Korean reason for an analysis error (its text as the server gives it). */
export function failureReason(error: string | null): string {
  return REASONS.find(([pattern]) => pattern.test(error ?? ''))?.[1] ?? '분석 중에 오류가 났습니다';
}
