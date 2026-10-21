$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$photos=@(
 @{frame='006';file='nilza-sibinde';x=38;y=279;w=287;h=404},
 @{frame='012';file='nelson-estevao-tembe';x=38;y=137;w=287;h=402},
 @{frame='017';file='marlucha-monjane';x=38;y=188;w=287;h=382},
 @{frame='022';file='argelancia-da-tela-samuel-zitha';x=38;y=191;w=287;h=403},
 @{frame='027';file='kelven-ze-lino-cossa';x=38;y=220;w=287;h=342},
 @{frame='028';file='enia-joana';x=38;y=189;w=287;h=382},
 @{frame='032';file='filomena-zita';x=38;y=233;w=287;h=354},
 @{frame='035';file='yurnica-cossa';x=38;y=177;w=287;h=373},
 @{frame='038';file='ana-paula-rogerio';x=38;y=355;w=287;h=338}
)
foreach($photo in $photos){
 $source=[Drawing.Bitmap]::FromFile((Join-Path $PSScriptRoot ('protocolos-frames\frame-'+$photo.frame+'.00.jpg')))
 $rect=New-Object Drawing.Rectangle($photo.x,$photo.y,$photo.w,$photo.h)
 $extracted=$source.Clone($rect,$source.PixelFormat)
 $extracted.Save((Join-Path $PSScriptRoot ('protocolos-photos\'+$photo.file+'.jpg')),[Drawing.Imaging.ImageFormat]::Jpeg)
 $extracted.Dispose();$source.Dispose()
}
Write-Output 'Nine additional caption-associated photographs extracted; David uses the fallback symbol.'
