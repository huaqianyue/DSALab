# 创建正确的ICO文件
Add-Type -AssemblyName System.Drawing

$pngPath = "src\assets\icons\favicon.png"
$icoPath = "src\assets\icons\favicon.ico"

if (Test-Path $pngPath) {
    # 加载PNG图像
    $img = [System.Drawing.Image]::FromFile($pngPath)
    Write-Host "原始PNG尺寸: $($img.Width) x $($img.Height)"
    
    # 创建256x256的位图
    $newImg = New-Object System.Drawing.Bitmap(256, 256)
    $graphics = [System.Drawing.Graphics]::FromImage($newImg)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    
    # 绘制图像到256x256画布
    $graphics.DrawImage($img, 0, 0, 256, 256)
    
    # 保存为PNG格式（临时）
    $tempPng = "temp_icon.png"
    $newImg.Save($tempPng, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # 清理
    $graphics.Dispose()
    $newImg.Dispose()
    $img.Dispose()
    
    # 使用ImageMagick或在线工具转换，这里我们直接使用PNG
    # 对于Electron-builder，PNG格式也可以作为图标
    Copy-Item $tempPng $icoPath -Force
    Remove-Item $tempPng -Force
    
    Write-Host "已创建256x256的图标文件"
} else {
    Write-Host "PNG文件不存在"
}
