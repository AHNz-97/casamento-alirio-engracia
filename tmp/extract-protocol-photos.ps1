$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$folder=Join-Path $PSScriptRoot 'protocolos-photos'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
# Exact photo rectangles within the video frames; captions remain in the source frames.
$photos=@(
 @{frame='000';file='joao-gito-ndzevo';x=38;y=270;w=287;h=405},
 @{frame='010';file='samuel-vasco-zitha-junior';x=38;y=40;w=287;h=404},
 @{frame='015';file='esperanca-adriano-dacalo';x=38;y=242;w=287;h=328},
 @{frame='020';file='silvia-shirley-mucavele';x=38;y=283;w=287;h=296},
 @{frame='025';file='vanda-cristina-samuel-zitha';x=38;y=212;w=394;h=330},
 @{frame='030';file='olima-jaime';x=38;y=202;w=394;h=304}
)
foreach($photo in $photos){
 $source=[Drawing.Bitmap]::FromFile((Join-Path $PSScriptRoot ('protocolos-frames\frame-'+$photo.frame+'.00.jpg')))
 $rect=New-Object Drawing.Rectangle($photo.x,$photo.y,$photo.w,$photo.h)
 $extracted=$source.Clone($rect,$source.PixelFormat)
 $extracted.Save((Join-Path $folder ($photo.file+'.jpg')),[Drawing.Imaging.ImageFormat]::Jpeg)
 $extracted.Dispose();$source.Dispose()
}
Write-Output 'Six photographs extracted from captioned video messages.'
