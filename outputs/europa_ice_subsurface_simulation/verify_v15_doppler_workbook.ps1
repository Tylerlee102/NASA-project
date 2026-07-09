$ErrorActionPreference = "Stop"

$Path = "C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\europa_ice_subsurface_simulation\v15.xlsx"
$SheetName = "Doppler_Depth_Inversion"

$xl = $null
$wb = $null
$ws = $null
$inputWs = $null

try {
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $xl.ScreenUpdating = $false

    $wb = $xl.Workbooks.Open($Path)
    $ws = $wb.Worksheets.Item($SheetName)
    $inputWs = $wb.Worksheets.Item("Subsurface_Inputs")

    $xl.CalculateFullRebuild()

    $dashboardIndex = $wb.Worksheets.Item("Subsurface_Dashboard").Index
    $dopplerIndex = $ws.Index
    $chartCount = $ws.ChartObjects().Count
    $pictureCount = $ws.Pictures().Count

    $formulaM24 = $ws.Range("M24").Formula
    $formulaD24 = $ws.Range("D24").Formula
    $angle24 = $ws.Range("D24").Value2
    $trueDepth24 = $ws.Range("H24").Value2
    $rawDepth24 = $ws.Range("L24").Value2
    $correctedDepth24 = $ws.Range("M24").Value2
    $correctedError24 = $ws.Range("O24").Value2
    $passCheck = $ws.Range("L11").Value2

    $origOceanInput = $inputWs.Range("C25").Value2
    $beforeLive = $ws.Range("M24").Value2
    $inputWs.Range("C25").Value2 = $origOceanInput + 500
    $xl.CalculateFullRebuild()
    $afterLive = $ws.Range("M24").Value2
    $inputWs.Range("C25").Value2 = $origOceanInput
    $xl.CalculateFullRebuild()
    $restoredLive = $ws.Range("M24").Value2

    $wb.Save()

    Write-Output "file=$Path"
    Write-Output "subsurface_dashboard_index=$dashboardIndex"
    Write-Output "doppler_sheet_index=$dopplerIndex"
    Write-Output "chart_count=$chartCount"
    Write-Output "picture_count=$pictureCount"
    Write-Output "formula_D24=$formulaD24"
    Write-Output "formula_M24=$formulaM24"
    Write-Output ("sample_angle_D24={0:N6}" -f $angle24)
    Write-Output ("sample_true_ocean_depth_H24={0:N3}" -f $trueDepth24)
    Write-Output ("sample_raw_slant_depth_L24={0:N3}" -f $rawDepth24)
    Write-Output ("sample_corrected_ocean_depth_M24={0:N3}" -f $correctedDepth24)
    Write-Output ("sample_corrected_error_O24={0:N9}" -f $correctedError24)
    Write-Output "pass_check_L11=$passCheck"
    Write-Output ("live_before_M24={0:N3}" -f $beforeLive)
    Write-Output ("live_after_input_change_M24={0:N3}" -f $afterLive)
    Write-Output ("live_restored_M24={0:N3}" -f $restoredLive)
}
finally {
    if ($wb -ne $null) {
        try {
            $wb.Close($true)
        }
        catch {
            Write-Output "close_note=Excel workbook was already closed"
        }
    }
    if ($xl -ne $null) {
        try {
            $xl.Quit()
        }
        catch {
            Write-Output "quit_note=Excel was already closed"
        }
    }
    if ($inputWs -ne $null) {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($inputWs) | Out-Null
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
