# Smoke test of the bundled analysis server on Windows (used by the desktop workflow):
# starts it, analyzes a demo song, generates a chart and decodes an uploaded MP3 file.
# -ExpectML (the ML edition): the server must report Demucs, beat_this and basic-pitch as active, and
# the demo song must be analyzed with them (their weights are downloaded on the first analysis).
# -ExpectStructure (the structure edition): allin1 too, for the song structure.
param([switch]$ExpectML, [switch]$ExpectStructure)
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

$waitSteps = if ($ExpectStructure) { 2400 } elseif ($ExpectML) { 1200 } else { 240 }
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
  if ($ExpectML) {
    $expected = @('demucs', 'beat_this', 'basic_pitch') + $(if ($ExpectStructure) { @('allin1') } else { @() })
    foreach ($name in $expected) {
      if (-not ($health.backends | Where-Object { $_.name -eq $name -and $_.active })) { throw "the ML edition has no active $name" }
    }
  }

  $demo = (Invoke-RestMethod -Method Post "$base/api/songs/demo" -ContentType 'application/json' -Body '{"bpm":128,"bars":12,"seed":2}').song
  $s = Wait-Ready $demo.id
  if ($s.status -ne 'ready') { throw "demo analysis failed: $($s.error)" }
  Write-Host "demo song analyzed: BPM $($s.bpm) | backends $($s.analyzer.backends | ConvertTo-Json -Compress)"
  if ($ExpectML) {
    $used = $s.analyzer.backends
    if ($used.stems -notmatch '^demucs' -or $used.beats -notmatch '^beat_this' -or $used.pitch -notmatch '^basic_pitch') {
      throw "the demo song was not analyzed with the ML backends: $($used | ConvertTo-Json -Compress) $($s.analyzer.errors | ConvertTo-Json -Compress)"
    }
    if ($ExpectStructure -and $used.structure -notmatch '^allin1') {
      throw "the demo song's structure was not analyzed with allin1: $($used | ConvertTo-Json -Compress) $($s.analyzer.errors | ConvertTo-Json -Compress)"
    }
  }
  $chart = (Invoke-RestMethod -Method Post "$base/api/songs/$($demo.id)/charts" -ContentType 'application/json' -Body '{"keyMode":"7K+1S","difficulty":"HARD"}').chart
  Write-Host "chart: $($chart.meta.keyMode) $($chart.meta.difficulty) Lv.$($chart.meta.level) | $($chart.meta.noteCount) notes"

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
  Write-Host "MP3 upload analyzed: BPM $($s.bpm)"

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

# the chart workers (spawned rhythm-server processes) end with the server, even one stopped at once
$left = @()
for ($i = 0; $i -lt 40; $i++) {
  $left = @(Get-Process -Name 'rhythm-server' -ErrorAction SilentlyContinue)
  if ($left.Count -eq 0) { break }
  Start-Sleep -Milliseconds 250
}
if ($left.Count -gt 0) { throw "$($left.Count) chart worker process(es) outlived the stopped server" }
Write-Host 'chart workers ended with the server: ok'
