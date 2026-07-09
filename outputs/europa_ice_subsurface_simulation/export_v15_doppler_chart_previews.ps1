$ErrorActionPreference = "Stop"

$Path = "C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\europa_ice_subsurface_simulation\v15.xlsx"
$SheetName = "Doppler_Depth_Inversion"
$PreviewDir = "C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\europa_ice_subsurface_simulation\previews"

New-Item -ItemType Directory -Force -Path $PreviewDir | Out-Null

$xl = $null
$wb = $null
$ws = $null

try {
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $xl.ScreenUpdating = $false

    $wb = $xl.Workbooks.Open($Path)
    $ws = $wb.Worksheets.Item($SheetName)
    $xl.CalculateFullRebuild()
    $ws.Activate()

    $count = $ws.ChartObjects().Count
    for ($i = 1; $i -le $count; $i++) {
        $chartObject = $ws.ChartObjects().Item($i)
        $out = Join-Path $PreviewDir ("v15_doppler_chart_{0}.png" -f $i)
        if (Test-Path $out) {
            Remove-Item -LiteralPath $out -Force
        }
        $chartObject.Activate()
        Start-Sleep -Milliseconds 300
        $ok = $chartObject.Chart.Export($out, "PNG", $false)
        $size = 0
        if (Test-Path $out) {
            $size = (Get-Item -LiteralPath $out).Length
        }
        Write-Output "exported=$out ok=$ok bytes=$size"
    }

    $wb.Save()
}
finally {
    if ($wb -ne $null) {
        try {
            $wb.Close($true)
        }
        catch {}
    }
    if ($xl -ne $null) {
        try {
            $xl.Quit()
        }
        catch {}
    }
    if ($ws -ne $null) {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) | Out-Null
    }
    if ($wb -ne $null) {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) | Out-Null
    }
    if ($xl -ne $null) {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
