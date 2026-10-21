param([string]$InputVideo='C:\Users\anham\Videos\protocolos.mp4',[double]$Step=5,[double]$Start=0,[double]$End=0)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null=[Windows.Media.Editing.MediaClip,Windows.Media.Editing,ContentType=WindowsRuntime]
$null=[Windows.Media.Editing.MediaComposition,Windows.Media.Editing,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.ImageStream,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
function Await-WinRT($Operation,$ResultType){
 $method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
 $task=$method.MakeGenericMethod($ResultType).Invoke($null,@($Operation));$task.Wait();$task.Result
}
$file=Await-WinRT ([Windows.Storage.StorageFile]::GetFileFromPathAsync($InputVideo)) ([Windows.Storage.StorageFile])
$clip=Await-WinRT ([Windows.Media.Editing.MediaClip]::CreateFromFileAsync($file)) ([Windows.Media.Editing.MediaClip])
$composition=New-Object Windows.Media.Editing.MediaComposition
$clipListType=[Windows.Media.Editing.MediaComposition].GetProperty('Clips').PropertyType
$clipListType.GetMethod('Insert').Invoke($composition.Clips,@(0,$clip))
$duration=$clip.OriginalDuration.TotalSeconds
Write-Output "Duration: $duration seconds"
$folder=Join-Path $PSScriptRoot 'protocolos-frames'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
if($End -le 0 -or $End -gt $duration){$End=$duration}
for($second=$Start;$second -lt $End;$second+=$Step){
 $frame=Await-WinRT ($composition.GetThumbnailAsync([TimeSpan]::FromSeconds($second),0,0,[Windows.Media.Editing.VideoFramePrecision]::NearestFrame)) ([Windows.Graphics.Imaging.ImageStream])
 $reader=[System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($frame)
 $output=[IO.File]::Create((Join-Path $folder ('frame-{0:000.00}.jpg' -f $second)))
 $reader.CopyTo($output);$output.Dispose();$reader.Dispose()
}
Write-Output 'Frames extracted.'
