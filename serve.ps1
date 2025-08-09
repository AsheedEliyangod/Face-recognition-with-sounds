# PowerShell static file server using HttpListener
# Usage: powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Port 8080 -Root "."

param(
  [int]$Port = 8080,
  [string]$Root = "."
)

$ErrorActionPreference = 'Stop'

function Get-ContentType([string]$path) {
  $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
  switch ($ext) {
    '.html' { 'text/html; charset=utf-8' }
    '.htm'  { 'text/html; charset=utf-8' }
    '.css'  { 'text/css; charset=utf-8' }
    '.js'   { 'application/javascript; charset=utf-8' }
    '.json' { 'application/json; charset=utf-8' }
    '.png'  { 'image/png' }
    '.jpg'  { 'image/jpeg' }
    '.jpeg' { 'image/jpeg' }
    '.svg'  { 'image/svg+xml' }
    '.mp3'  { 'audio/mpeg' }
    '.wav'  { 'audio/wav' }
    '.wasm' { 'application/wasm' }
    default { 'application/octet-stream' }
  }
}

$rootFull = [System.IO.Path]::GetFullPath($Root)
if (-not (Test-Path $rootFull)) {
  throw "Root path not found: $rootFull"
}

$prefix = "http://127.0.0.1:$Port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving '$rootFull' at $prefix" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop"

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
      $relPath = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($relPath)) { $relPath = 'index.html' }

      $candidate = Join-Path $rootFull $relPath
      $candidateFull = [System.IO.Path]::GetFullPath($candidate)

      # Prevent path traversal
      if (-not $candidateFull.StartsWith($rootFull)) {
        $response.StatusCode = 403
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.OutputStream.Close()
        continue
      }

      # If directory, try index.html
      if (Test-Path $candidateFull -PathType Container) {
        $candidateFull = Join-Path $candidateFull 'index.html'
      }

      if (-not (Test-Path $candidateFull -PathType Leaf)) {
        $response.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.OutputStream.Close()
        continue
      }

      $contentType = Get-ContentType -path $candidateFull
      $response.ContentType = $contentType
      # No-cache for dev
      $response.Headers.Add('Cache-Control', 'no-cache, no-store, must-revalidate')
      $response.Headers.Add('Pragma', 'no-cache')
      $response.Headers.Add('Expires', '0')

      $bytes = [System.IO.File]::ReadAllBytes($candidateFull)
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
      $response.OutputStream.Close()
    } catch {
      try {
        $response.StatusCode = 500
        $msg = [System.Text.Encoding]::UTF8.GetBytes("Server Error: $($_.Exception.Message)")
        $response.OutputStream.Write($msg, 0, $msg.Length)
        $response.OutputStream.Close()
      } catch {}
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}


