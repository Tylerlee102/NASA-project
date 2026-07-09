$ErrorActionPreference = "Stop"

$Path = "C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\europa_ice_subsurface_simulation\v18.xlsx"

$xl = $null
$wb = $null
$test = $null
$coverage = $null

try {
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $xl.ScreenUpdating = $false

    $wb = $xl.Workbooks.Open($Path, 0, $false)
    if ($wb -eq $null) {
        throw "Excel did not return an opened workbook object."
    }
    $test = $wb.Worksheets.Item("Gap_Test_Topography")
    $coverage = $wb.Worksheets.Item("NASA_Coverage_Matrix")

    $xl.CalculateFullRebuild()

    $chartCount = $test.ChartObjects().Count
    $pictureCount = $test.Pictures().Count
    $angleBias = $test.Range("B7").Value2
    $maxSlope = $test.Range("G7").Value2
    $maxRawError = $test.Range("G8").Value2
    $maxBiasedError = $test.Range("G9").Value2
    $mediumRows = $test.Range("G10").Value2
    $highRows = $test.Range("G11").Value2
    $verdict = $test.Range("G12").Value2

    $originalBias = $test.Range("B7").Value2
    $beforeError = $test.Range("G9").Value2
    $test.Range("B7").Value2 = 5
    $xl.CalculateFullRebuild()
    $afterError = $test.Range("G9").Value2
    $test.Range("B7").Value2 = $originalBias
    $xl.CalculateFullRebuild()
    $restoredError = $test.Range("G9").Value2

    $wb.Save()

    Write-Output "file=$Path"
    Write-Output "gap_test_chart_count=$chartCount"
    Write-Output "gap_test_picture_count=$pictureCount"
    Write-Output ("angle_bias_deg={0:N3}" -f $angleBias)
    Write-Output ("max_surface_slope_deg={0:N6}" -f $maxSlope)
    Write-Output ("max_raw_slant_error_m={0:N3}" -f $maxRawError)
    Write-Output ("max_biased_depth_error_m={0:N3}" -f $maxBiasedError)
    Write-Output "medium_risk_rows=$mediumRows"
    Write-Output "high_risk_rows=$highRows"
    Write-Output "verdict=$verdict"
    Write-Output ("live_before_G9={0:N3}" -f $beforeError)
    Write-Output ("live_after_bias_5deg_G9={0:N3}" -f $afterError)
    Write-Output ("live_restored_G9={0:N3}" -f $restoredError)
}
finally {
    if ($wb -ne $null) {
        try {
            $wb.Close($true)
        }
        catch {
            Write-Output "close_note=Workbook was already closed"
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
    if ($coverage -ne $null) {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($coverage) | Out-Null
    }
    if ($test -ne $null) {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($test) | Out-Null
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
