$ErrorActionPreference = "Stop"

$Path = "C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\europa_ice_subsurface_simulation\v15.xlsx"
$SheetName = "Doppler_Depth_Inversion"
$DataFirst = 24
$DataLast = 264

$xl = $null
$wb = $null
$ws = $null

function RgbValue([int]$r, [int]$g, [int]$b) {
    return $r + ($g * 256) + ($b * 65536)
}

function Set-SeriesStyle($series, [int]$color, [double]$weight, [int]$dash = 1) {
    $series.MarkerStyle = -4142
    $series.Format.Line.Visible = -1
    $series.Format.Line.ForeColor.RGB = $color
    $series.Format.Line.Weight = $weight
    $series.Format.Line.DashStyle = $dash
}

function Add-Series($chart, [string]$name, [string]$xRange, [string]$yRange, [int]$color, [double]$weight = 1.75, [int]$dash = 1) {
    $series = $chart.SeriesCollection().NewSeries()
    $series.Name = "=""" + $name + """"
    $series.XValues = $xRange
    $series.Values = $yRange
    Set-SeriesStyle $series $color $weight $dash
}

function Add-Chart($ws, [string]$chartName, [string]$anchorRange, [string]$title, [string]$yTitle, [array]$seriesDefs, [bool]$reverseY = $false) {
    $anchor = $ws.Range($anchorRange)
    $co = $ws.ChartObjects().Add($anchor.Left, $anchor.Top, $anchor.Width, $anchor.Height)
    $co.Name = $chartName
    $chart = $co.Chart
    $chart.ChartType = 75
    $chart.DisplayBlanksAs = 1
    $chart.HasTitle = $true
    $chart.ChartTitle.Text = $title
    $chart.ChartTitle.Font.Name = "Aptos Display"
    $chart.ChartTitle.Font.Size = 13
    $chart.ChartTitle.Font.Bold = $true
    $chart.HasLegend = $true
    $chart.Legend.Position = -4107
    $chart.Legend.Font.Name = "Aptos"
    $chart.Legend.Font.Size = 8
    $chart.ChartArea.Format.Fill.ForeColor.RGB = (RgbValue 255 255 255)
    $chart.PlotArea.Format.Fill.ForeColor.RGB = (RgbValue 255 255 255)
    $chart.ChartArea.Format.Line.ForeColor.RGB = (RgbValue 166 166 166)

    foreach ($def in $seriesDefs) {
        Add-Series $chart $def.Name $def.X $def.Y $def.Color $def.Weight $def.Dash
    }

    $xAxis = $chart.Axes(1)
    $xAxis.HasTitle = $true
    $xAxis.AxisTitle.Text = "Along-track position x (km)"
    $xAxis.AxisTitle.Font.Name = "Aptos"
    $xAxis.AxisTitle.Font.Size = 9
    $xAxis.TickLabels.Font.Name = "Aptos"
    $xAxis.TickLabels.Font.Size = 8
    $xAxis.HasMajorGridlines = $true
    $xAxis.MajorGridlines.Format.Line.ForeColor.RGB = (RgbValue 217 225 242)
    $xAxis.MajorGridlines.Format.Line.Weight = 0.5

    $yAxis = $chart.Axes(2)
    $yAxis.HasTitle = $true
    $yAxis.AxisTitle.Text = $yTitle
    $yAxis.AxisTitle.Font.Name = "Aptos"
    $yAxis.AxisTitle.Font.Size = 9
    $yAxis.TickLabels.Font.Name = "Aptos"
    $yAxis.TickLabels.Font.Size = 8
    $yAxis.HasMajorGridlines = $true
    $yAxis.MajorGridlines.Format.Line.ForeColor.RGB = (RgbValue 217 225 242)
    $yAxis.MajorGridlines.Format.Line.Weight = 0.5
    $yAxis.ReversePlotOrder = $reverseY

    return $co
}

function SheetRange([string]$columnLetter) {
    return "='" + $SheetName + "'!`$" + $columnLetter + "`$" + $DataFirst + ":`$" + $columnLetter + "`$" + $DataLast
}

try {
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $xl.ScreenUpdating = $false

    $wb = $xl.Workbooks.Open($Path)
    try {
        $xl.Calculation = -4105
    }
    catch {
        Write-Output "calculation_mode_note=Excel kept its current calculation mode"
    }
    $ws = $wb.Worksheets.Item($SheetName)

    while ($ws.ChartObjects().Count -gt 0) {
        $ws.ChartObjects().Item(1).Delete()
    }

    $x = SheetRange "A"
    $colors = @{
        Blue = (RgbValue 68 114 196)
        Orange = (RgbValue 237 125 49)
        Green = (RgbValue 112 173 71)
        Gray = (RgbValue 127 127 127)
        Black = (RgbValue 64 64 64)
        Red = (RgbValue 192 0 0)
    }

    Add-Chart $ws "chtDopplerAngle" "A270:I294" "Doppler-Inverted Look Angle vs Existing Geometry" "Look angle (deg)" @(
        @{ Name = "Doppler angle from VHF shift"; X = $x; Y = (SheetRange "D"); Color = $colors.Orange; Weight = 1.75; Dash = 1 },
        @{ Name = "Existing model geometry angle"; X = $x; Y = (SheetRange "E"); Color = $colors.Blue; Weight = 1.5; Dash = 4 }
    ) $false | Out-Null

    Add-Chart $ws "chtDopplerDepth" "K270:S294" "Raw Slant Depth vs Doppler-Corrected Ocean Depth" "Depth below surface (m, positive down)" @(
        @{ Name = "True simulated ocean depth"; X = $x; Y = (SheetRange "H"); Color = $colors.Black; Weight = 1.5; Dash = 1 },
        @{ Name = "Raw slant depth from echo delay"; X = $x; Y = (SheetRange "L"); Color = $colors.Orange; Weight = 1.5; Dash = 4 },
        @{ Name = "Doppler-corrected actual depth"; X = $x; Y = (SheetRange "M"); Color = $colors.Green; Weight = 1.75; Dash = 1 }
    ) $true | Out-Null

    Add-Chart $ws "chtDopplerError" "A298:I322" "Depth Error Before and After Angle Correction" "Depth error (m)" @(
        @{ Name = "Uncorrected slant-depth error"; X = $x; Y = (SheetRange "N"); Color = $colors.Orange; Weight = 1.5; Dash = 1 },
        @{ Name = "Corrected depth error"; X = $x; Y = (SheetRange "O"); Color = $colors.Green; Weight = 1.75; Dash = 1 }
    ) $false | Out-Null

    Add-Chart $ws "chtDopplerLayers" "K298:S322" "Corrected Layer Depths From Doppler Angle" "Depth below surface (m, positive down)" @(
        @{ Name = "Corrected upper-layer depth"; X = $x; Y = (SheetRange "S"); Color = $colors.Green; Weight = 1.5; Dash = 1 },
        @{ Name = "Corrected briny lens depth"; X = $x; Y = (SheetRange "R"); Color = $colors.Blue; Weight = 1.5; Dash = 1 },
        @{ Name = "Corrected ocean boundary depth"; X = $x; Y = (SheetRange "M"); Color = $colors.Orange; Weight = 1.75; Dash = 1 }
    ) $true | Out-Null

    $ws.Range("A23:S23").AutoFilter() | Out-Null
    $xl.CalculateFullRebuild()
    $wb.Save()

    $chartCount = $ws.ChartObjects().Count
    $pictureCount = $ws.Pictures().Count
    $indexDashboard = $wb.Worksheets.Item("Subsurface_Dashboard").Index
    $indexDoppler = $ws.Index

    Write-Output "saved=$Path"
    Write-Output "doppler_sheet_index=$indexDoppler"
    Write-Output "subsurface_dashboard_index=$indexDashboard"
    Write-Output "chart_count=$chartCount"
    Write-Output "picture_count=$pictureCount"
}
finally {
    if ($wb -ne $null) {
        $wb.Close($true)
    }
    if ($xl -ne $null) {
        $xl.Quit()
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
