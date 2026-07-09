$ErrorActionPreference = "Stop"

$Path = "C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\europa_ice_subsurface_simulation\v16.xlsx"
$DashSheet = "Doppler_Depth_Inversion"
$DataSheet = "Doppler_Depth_Data"

$xl = $null
$wb = $null
$dash = $null
$data = $null
$inputs = $null

try {
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $xl.ScreenUpdating = $false

    $wb = $xl.Workbooks.Open($Path, 0, $false)
    if ($wb -eq $null) {
        throw "Excel did not return an opened workbook object."
    }

    $dash = $wb.Worksheets.Item($DashSheet)
    $data = $wb.Worksheets.Item($DataSheet)
    $inputs = $wb.Worksheets.Item("Subsurface_Inputs")
    $xl.CalculateFullRebuild()

    $dashboardIndex = $wb.Worksheets.Item("Subsurface_Dashboard").Index
    $dashIndex = $dash.Index
    $dataIndex = $data.Index
    $chartCount = $dash.ChartObjects().Count
    $pictureCount = $dash.Pictures().Count
    $status = $dash.Range("B9").Value2
    $meanCorrectedError = $dash.Range("B7").Value2
    $beforeDepth = $data.Range("M4").Value2

    $original = $inputs.Range("C25").Value2
    $inputs.Range("C25").Value2 = $original + 500
    $xl.CalculateFullRebuild()
    $afterDepth = $data.Range("M4").Value2
    $inputs.Range("C25").Value2 = $original
    $xl.CalculateFullRebuild()
    $restoredDepth = $data.Range("M4").Value2

    $wb.Save()

    Write-Output "file=$Path"
    Write-Output "subsurface_dashboard_index=$dashboardIndex"
    Write-Output "doppler_dashboard_index=$dashIndex"
    Write-Output "doppler_data_index=$dataIndex"
    Write-Output "dashboard_chart_count=$chartCount"
    Write-Output "dashboard_picture_count=$pictureCount"
    Write-Output "dashboard_status_B9=$status"
    Write-Output ("mean_corrected_error_B7={0:N9}" -f $meanCorrectedError)
    Write-Output ("live_before_M4={0:N3}" -f $beforeDepth)
    Write-Output ("live_after_input_change_M4={0:N3}" -f $afterDepth)
    Write-Output ("live_restored_M4={0:N3}" -f $restoredDepth)
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
    if ($inputs -ne $null) {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($inputs) | Out-Null
    }
    if ($data -ne $null) {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($data) | Out-Null
    }
    if ($dash -ne $null) {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($dash) | Out-Null
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
