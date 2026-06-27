Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
$video = "C:\Users\Admin\Downloads\video_2026-06-21_12-55-15.mp4"
$outDir = "S:\Money Printer\app\video_review_frames"
$times = @(0.5, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20)
foreach ($seconds in $times) {
  $player = New-Object System.Windows.Media.MediaPlayer
  $opened = $false
  $player.add_MediaOpened({ $script:opened = $true })
  $player.Open([Uri]::new($video))
  $deadline = [DateTime]::Now.AddSeconds(5)
  while (-not $opened -and [DateTime]::Now -lt $deadline) {
    [System.Windows.Threading.Dispatcher]::CurrentDispatcher.Invoke([Action]{}, [System.Windows.Threading.DispatcherPriority]::Background)
    Start-Sleep -Milliseconds 50
  }
  $player.Position = [TimeSpan]::FromSeconds($seconds)
  $player.Pause()
  Start-Sleep -Milliseconds 500
  $width = if ($player.NaturalVideoWidth -gt 0) { $player.NaturalVideoWidth } else { 489 }
  $height = if ($player.NaturalVideoHeight -gt 0) { $player.NaturalVideoHeight } else { 1088 }
  $drawingVisual = New-Object System.Windows.Media.DrawingVisual
  $context = $drawingVisual.RenderOpen()
  $rect = New-Object System.Windows.Rect 0,0,$width,$height
  $context.DrawVideo($player, $rect)
  $context.Close()
  $bitmap = New-Object System.Windows.Media.Imaging.RenderTargetBitmap $width,$height,96,96,([System.Windows.Media.PixelFormats]::Pbgra32)
  $bitmap.Render($drawingVisual)
  $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
  $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
  $path = Join-Path $outDir ("frame_{0:0000}ms.png" -f [int]($seconds * 1000))
  $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Create)
  $encoder.Save($stream)
  $stream.Close()
  $player.Close()
}
