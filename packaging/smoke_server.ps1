# Smoke test of the bundled analysis server on Windows (used by the desktop workflow):
# starts it, analyzes a demo song, decodes an uploaded OGG file and generates a chart.
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root 'server\dist\rhythm-server\rhythm-server.exe'
$tmp = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
$work = Join-Path $tmp 'grg-smoke'
New-Item -ItemType Directory -Force $work | Out-Null
$base = 'http://127.0.0.1:8795'
$library = Join-Path $work 'library'
$proc = Start-Process -FilePath $exe -ArgumentList "--port 8795 --data `"$library`"" `
  -RedirectStandardOutput (Join-Path $work 'server.log') -RedirectStandardError (Join-Path $work 'server.err.log') -PassThru -NoNewWindow

function Wait-Ready($id) {
  for ($i = 0; $i -lt 240; $i++) {
    $s = (Invoke-RestMethod "$base/api/songs/$id").song
    if ($s.status -eq 'ready' -or $s.status -eq 'error') { return $s }
    Start-Sleep -Milliseconds 500
  }
  throw "analysis timed out for $id"
}

try {
  for ($i = 0; $i -lt 240; $i++) {
    if ($proc.HasExited) { throw "the server exited with $($proc.ExitCode)" }
    try { Invoke-RestMethod "$base/api/health" | Out-Null; break } catch { Start-Sleep -Milliseconds 500 }
  }
  $health = Invoke-RestMethod "$base/api/health"
  Write-Host "server $($health.version) | analyzer $($health.analyzer) | generator $($health.generator)"

  $demo = (Invoke-RestMethod -Method Post "$base/api/songs/demo" -ContentType 'application/json' -Body '{"bpm":128,"bars":12,"seed":2}').song
  $s = Wait-Ready $demo.id
  if ($s.status -ne 'ready') { throw "demo analysis failed: $($s.error)" }
  Write-Host "demo song analyzed: BPM $($s.bpm)"
  $chart = (Invoke-RestMethod -Method Post "$base/api/songs/$($demo.id)/charts" -ContentType 'application/json' -Body '{"keyMode":"7K+1S","difficulty":"HARD"}').chart
  Write-Host "chart: $($chart.meta.keyMode) $($chart.meta.difficulty) Lv.$($chart.meta.level) | $($chart.meta.noteCount) notes"

  # an uploaded file goes through the bundled FFmpeg (PyAV)
  $ogg = Join-Path $work 'upload.ogg'
  python -c "import sys; sys.path.insert(0, sys.argv[2]); from rhythm_server.synth import make_song; import soundfile as sf; s = make_song(120.0, 8, seed=4); sf.write(sys.argv[1], s.pcm, 44100, format='OGG')" $ogg (Join-Path $root 'server')
  $upload = curl.exe -s --fail-with-body -F "file=@$ogg" "$base/api/songs" | ConvertFrom-Json
  $s = Wait-Ready $upload.song.id
  if ($s.status -ne 'ready') { throw "OGG analysis failed: $($s.error)" }
  Write-Host "OGG upload analyzed: BPM $($s.bpm)"

  $index = Invoke-WebRequest "$base/" -UseBasicParsing
  if ($index.Content -notmatch 'Generative Rhythm') { throw 'the client is not served' }
  Write-Host 'client served: ok'
}
catch {
  Get-Content (Join-Path $work 'server.log'), (Join-Path $work 'server.err.log') -Tail 40 -ErrorAction SilentlyContinue
  throw
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
