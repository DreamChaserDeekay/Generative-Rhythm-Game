# Smoke test of the bundled analysis server on Windows (used by the desktop workflow):
# starts it, analyzes a demo song, asks for a chart and decodes an uploaded MP3 file.
# The chart: Mapperatorinator is the only generator (docs/MAPPERATORINATOR.md). Where its runtime is
# set up (GRG_MAPPER_HOME, as the workflow's CPU step leaves it) the chart is made with it; where it
# is not (this runner has no NVIDIA GPU) the request must be refused with the reason, not crash.
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

$waitSteps = 240
function Wait-Ready($id) {
  for ($i = 0; $i -lt $waitSteps; $i++) {
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
  $active = @($health.backends | Where-Object { $_.active } | ForEach-Object { "$($_.name)-$($_.version)" })
  Write-Host "ML backends: $(if ($active) { $active -join ', ' } else { 'none' })"

  $demo = (Invoke-RestMethod -Method Post "$base/api/songs/demo" -ContentType 'application/json' -Body '{"bpm":128,"bars":12,"seed":2}').song
  $s = Wait-Ready $demo.id
  if ($s.status -ne 'ready') { throw "demo analysis failed: $($s.error)" }
  Write-Host "demo song analyzed: backends $($s.analyzer.backends | ConvertTo-Json -Compress)"
  $mapper = $health.mapper.state
  Write-Host "Mapperatorinator: $mapper"
  $brief = (Invoke-RestMethod -Method Post "$base/api/songs/$($demo.id)/charts" -ContentType 'application/json' -Body '{"keyMode":"7K+1S","difficulty":"HARD","brief":true}').meta
  if (-not $brief.predicted) { throw 'a chart not made yet has no predicted brief' }
  Write-Host "brief: aims at Lv.$($brief.level) ($($brief.generator.stars) stars)"
  if ($mapper -eq 'ready') {
    $chart = (Invoke-RestMethod -Method Post "$base/api/songs/$($demo.id)/charts" -ContentType 'application/json' -Body '{"keyMode":"7K+1S","difficulty":"HARD"}' -TimeoutSec 1800).chart
    Write-Host "chart: $($chart.meta.keyMode) $($chart.meta.difficulty) Lv.$($chart.meta.level) | $($chart.meta.noteCount) notes | timing $($chart.meta.generator.timing) | $($chart.meta.generator.seconds)s"
    $s = (Invoke-RestMethod "$base/api/songs/$($demo.id)").song
    if (-not $s.bpm) { throw 'the song has no BPM after its first chart' }
    Write-Host "the song's BPM from its first chart: $($s.bpm)"
  } else {
    $refused = curl.exe -s -o (Join-Path $work 'refused.json') -w '%{http_code}' -H 'Content-Type: application/json' -d '{"keyMode":"7K+1S","difficulty":"HARD"}' "$base/api/songs/$($demo.id)/charts"
    $detail = (Get-Content (Join-Path $work 'refused.json') -Raw -Encoding utf8 | ConvertFrom-Json).detail
    if ($refused -ne '503' -or -not $detail) { throw "a chart without Mapperatorinator answered $refused, not 503 with its reason" }
    Write-Host "chart refused without Mapperatorinator (503): ok"
  }

  # an uploaded MP3 goes through the bundled FFmpeg (PyAV)
  $mp3 = Join-Path $work 'upload.mp3'
  $make = Join-Path $work 'make_mp3.py'
  Set-Content -Path $make -Encoding utf8 -Value @'
import sys
sys.path.insert(0, sys.argv[2])
import soundfile as sf
from rhythm_server.synth import make_song
song = make_song(120.0, 8, seed=4)
# small blocks: a single large write overflows the stack in libsndfile's encoders on Windows
with sf.SoundFile(sys.argv[1], 'w', song.sample_rate, 2, format='MP3') as f:
    for i in range(0, len(song.pcm), 4096):
        f.write(song.pcm[i:i + 4096])
'@
  python $make $mp3 (Join-Path $root 'server')
  $upload = curl.exe -s --fail-with-body -F "file=@$mp3" "$base/api/songs" | ConvertFrom-Json
  $s = Wait-Ready $upload.song.id
  if ($s.status -ne 'ready') { throw "MP3 analysis failed: $($s.error)" }
  Write-Host 'MP3 upload analyzed'

  $index = Invoke-WebRequest "$base/" -UseBasicParsing
  if ($index.Content -notmatch 'Generative Rhythm') { throw 'the client is not served' }
  Write-Host 'client served: ok'

  # the game media (the parts' pictures and the hits' flipbooks) is bundled with the client
  $manifest = Invoke-RestMethod "$base/media/manifest.json"
  $count = @($manifest.textures.PSObject.Properties).Count
  $burst = Invoke-WebRequest "$base/media/$($manifest.textures.'flash/hitBurst'.file)" -UseBasicParsing
  if ($count -lt 1 -or $burst.StatusCode -ne 200 -or $burst.Headers['Content-Type'] -notmatch 'image/png') { throw 'the game media is not served' }
  Write-Host "media served: $count textures"
}
catch {
  Get-Content (Join-Path $work 'server.log'), (Join-Path $work 'server.err.log') -Tail 40 -ErrorAction SilentlyContinue
  throw
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

# no server process outlives the stopped server
$left = @()
for ($i = 0; $i -lt 40; $i++) {
  $left = @(Get-Process -Name 'rhythm-server' -ErrorAction SilentlyContinue)
  if ($left.Count -eq 0) { break }
  Start-Sleep -Milliseconds 250
}
if ($left.Count -gt 0) { throw "$($left.Count) server process(es) outlived the stopped server" }
Write-Host 'no server process left: ok'
