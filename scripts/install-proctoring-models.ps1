$ErrorActionPreference = 'Stop'
$modelDirectory = Join-Path $PSScriptRoot '..\proctoring\models'
New-Item -ItemType Directory -Path $modelDirectory -Force | Out-Null
$models = @(
    @{ Name = 'face_landmarker.task'; Path = 'face_landmarker/face_landmarker'; Hash = '64184E229B263107BC2B804C6625DB1341FF2BB731874B0BCC2FE6544E0BC9FF' },
    @{ Name = 'pose_landmarker_lite.task'; Path = 'pose_landmarker/pose_landmarker_lite'; Hash = '59929E1D1EE95287735DDD833B19CF4AC46D29BC7AFDDBBF6753C459690D574A' },
    @{ Name = 'hand_landmarker.task'; Path = 'hand_landmarker/hand_landmarker'; Hash = 'FBC2A30080C3C557093B5DDFC334698132EB341044CCEE322CCF8BCF3607CDE1' },
    # Object detector (COCO classes; only 'cell phone' is used). Same official bucket, different layout.
    @{ Name = 'efficientdet_lite0.tflite'; Url = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/latest/efficientdet_lite0.tflite'; Hash = '4B59100025BEA1235A84C1038879A6CCCC9F6C49F5E41144E91E74D99E780993' }
)
foreach ($model in $models) {
    $target = Join-Path $modelDirectory $model.Name
    if ((Test-Path -LiteralPath $target) -and (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $model.Hash) {
        Write-Output "$($model.Name): checksum verified"
        continue
    }
    $temporary = "$target.download"
    try {
        # Digest pins the inspected asset even if upstream changes its latest alias.
        $uri = if ($model.Url) { $model.Url } else { "https://storage.googleapis.com/mediapipe-models/$($model.Path)/float16/latest/$($model.Name)" }
        Invoke-WebRequest -Uri $uri -OutFile $temporary
        if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $model.Hash) {
            throw "Model checksum mismatch: $($model.Name). Existing model preserved; review upstream changes."
        }
        Move-Item -LiteralPath $temporary -Destination $target -Force
        Write-Output "$($model.Name): installed and checksum verified"
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
    }
}
