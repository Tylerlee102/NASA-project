$ErrorActionPreference = "Stop"

$Path = "C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\europa_ice_subsurface_simulation\v12.xlsx"

function ExcelRgb([int]$r, [int]$g, [int]$b) {
    return $r + ($g -shl 8) + ($b -shl 16)
}

function Add-Series($chart, $chartData, [string]$name, [string]$xRange, [string]$yRange, [int]$color) {
    $series = $chart.SeriesCollection().NewSeries()
    $series.Name = $name
    $series.XValues = $chartData.Range($xRange)
    $series.Values = $chartData.Range($yRange)
    $series.MarkerStyle = -4142
    $series.Format.Line.ForeColor.RGB = $color
    $series.Format.Line.Weight = 1.5
}

function Format-Axis($axis, [string]$title, [object]$minScale, [object]$maxScale, [int]$gridColor, [int]$axisColor) {
    $axis.HasTitle = $true
    $axis.AxisTitle.Text = $title
    $axis.AxisTitle.Font.Size = 9
    $axis.AxisTitle.Font.Color = $axisColor
    $axis.TickLabels.Font.Size = 8
    $axis.TickLabels.Font.Color = $axisColor
    if ($null -ne $minScale) { $axis.MinimumScale = [double]$minScale }
    if ($null -ne $maxScale) { $axis.MaximumScale = [double]$maxScale }
    $axis.HasMajorGridlines = $true
    $axis.MajorGridlines.Format.Line.ForeColor.RGB = $gridColor
    $axis.MajorGridlines.Format.Line.Weight = 0.5
}

$colors = @{
    Blue = ExcelRgb 47 109 179
    Green = ExcelRgb 33 150 83
    Orange = ExcelRgb 231 111 36
    Gold = ExcelRgb 212 154 34
    Purple = ExcelRgb 112 72 184
    Red = ExcelRgb 196 58 58
    Gray = ExcelRgb 128 128 128
    Grid = ExcelRgb 221 225 230
    Axis = ExcelRgb 82 97 116
    Border = ExcelRgb 212 218 227
}

$charts = @(
    @{
        Title = "Subsurface Truth Model: Icy Layers"
        Anchor = "A29"
        XTitle = "Along-track position x (km)"
        YTitle = "Elevation relative to reference (m)"
        XMin = -100
        XMax = 100
        Legend = $true
        Series = @(
            @{Name = "Icy top surface"; X = "A3:A243"; Y = "B3:B243"; Color = $colors.Orange},
            @{Name = "Shallow ice layer"; X = "C3:C243"; Y = "D3:D243"; Color = $colors.Green},
            @{Name = "Warm/briny lens"; X = "E3:E243"; Y = "F3:F243"; Color = $colors.Gold},
            @{Name = "Ice-ocean boundary"; X = "G3:G243"; Y = "H3:H243"; Color = $colors.Purple}
        )
    },
    @{
        Title = "Scenario Comparison: Thin / Medium / Thick Ice"
        Anchor = "J29"
        XTitle = "Along-track position x (km)"
        YTitle = "Depth to possible boundary (m)"
        XMin = -100
        XMax = 100
        Legend = $true
        Series = @(
            @{Name = "Thin shell"; X = "A248:A488"; Y = "B248:B488"; Color = $colors.Green},
            @{Name = "Medium shell"; X = "C248:C488"; Y = "D248:D488"; Color = $colors.Purple},
            @{Name = "Thick shell"; X = "E248:E488"; Y = "F248:F488"; Color = $colors.Red}
        )
    },
    @{
        Title = "Boundary Uncertainty Band"
        Anchor = "A50"
        XTitle = "Along-track position x (km)"
        YTitle = "Depth to possible boundary (m)"
        XMin = -100
        XMax = 100
        Legend = $true
        Series = @(
            @{Name = "Lower bound"; X = "A493:A733"; Y = "B493:B733"; Color = $colors.Green},
            @{Name = "Mean boundary"; X = "C493:C733"; Y = "D493:D733"; Color = $colors.Purple},
            @{Name = "Upper bound"; X = "E493:E733"; Y = "F493:F733"; Color = $colors.Red}
        )
    },
    @{
        Title = "Ocean Model vs No-Ocean Control"
        Anchor = "J50"
        XTitle = "Along-track position x (km)"
        YTitle = "Margin above threshold (dB)"
        XMin = -100
        XMax = 100
        Legend = $true
        Series = @(
            @{Name = "Ocean model margin"; X = "A738:A978"; Y = "B738:B978"; Color = $colors.Purple},
            @{Name = "No-ocean control margin"; X = "C738:C978"; Y = "D738:D978"; Color = $colors.Gray},
            @{Name = "Zero threshold"; X = "E738:E978"; Y = "F738:F978"; Color = $colors.Red}
        )
    },
    @{
        Title = "Radargram-Style Return Timing With Clutter"
        Anchor = "A71"
        XTitle = "Along-track position x (km)"
        YTitle = "Two-way delay after surface return (us)"
        XMin = -100
        XMax = 100
        Legend = $true
        Series = @(
            @{Name = "Surface clutter upper"; X = "A983:A1223"; Y = "B983:B1223"; Color = $colors.Gray},
            @{Name = "Shallow ice return"; X = "C983:C1223"; Y = "D983:D1223"; Color = $colors.Green},
            @{Name = "Warm/briny lens return"; X = "E983:E1223"; Y = "F983:F1223"; Color = $colors.Gold},
            @{Name = "Ocean boundary return"; X = "G983:G1223"; Y = "H983:H1223"; Color = $colors.Purple}
        )
    },
    @{
        Title = "Detectability Margin vs Threshold"
        Anchor = "J71"
        XTitle = "Along-track position x (km)"
        YTitle = "Margin above threshold (dB)"
        XMin = -100
        XMax = 100
        Legend = $true
        Series = @(
            @{Name = "Lens echo margin"; X = "A1228:A1468"; Y = "B1228:B1468"; Color = $colors.Gold},
            @{Name = "Ocean echo margin"; X = "C1228:C1468"; Y = "D1228:D1468"; Color = $colors.Purple},
            @{Name = "Zero margin threshold"; X = "E1228:E1468"; Y = "F1228:F1468"; Color = $colors.Red}
        )
    },
    @{
        Title = "Reflection Strength by Material / Interface"
        Anchor = "A92"
        XTitle = "Material/interface index"
        YTitle = "Reflection strength before depth loss (dB)"
        XMin = 1
        XMax = 5
        Legend = $false
        Series = @(
            @{Name = "Material/interface strength"; X = "A1473:A1477"; Y = "B1473:B1477"; Color = $colors.Blue}
        )
    },
    @{
        Title = "Cross-Instrument Evidence Score"
        Anchor = "J92"
        XTitle = "Evidence source index"
        YTitle = "Support score (%)"
        XMin = 1
        XMax = 4
        Legend = $false
        Series = @(
            @{Name = "Evidence support score"; X = "A1492:A1495"; Y = "B1492:B1495"; Color = $colors.Green}
        )
    }
)

$excel = $null
$workbook = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false

    $workbook = $excel.Workbooks.Open($Path)
    $dashboard = $workbook.Worksheets.Item("Dashboard")
    $subsurface = $workbook.Worksheets.Item("Subsurface_Dashboard")
    $chartData = $workbook.Worksheets.Item("Subsurface_Chart_Data")

    for ($i = $subsurface.ChartObjects().Count; $i -ge 1; $i--) {
        $subsurface.ChartObjects($i).Delete()
    }

    $leftChartWidth = $dashboard.ChartObjects(1).Width
    $rightChartLeft = $dashboard.ChartObjects(2).Left
    $rightChartWidth = $dashboard.ChartObjects(2).Width
    $chartHeight = $dashboard.ChartObjects(1).Height

    for ($idx = 0; $idx -lt $charts.Count; $idx++) {
        $spec = $charts[$idx]
        $anchor = $subsurface.Range($spec.Anchor)
        $isRight = (($idx + 1) % 2 -eq 0)
        $left = if ($isRight) { $rightChartLeft } else { 0 }
        $width = if ($isRight) { $rightChartWidth } else { $leftChartWidth }

        $chartObject = $subsurface.ChartObjects().Add($left, $anchor.Top, $width, $chartHeight)
        $chartObject.Name = "SubsurfaceChart$($idx + 1)"
        $chart = $chartObject.Chart
        $chart.ChartType = 75
        $chart.HasTitle = $true
        $chart.ChartTitle.Text = $spec.Title
        $chart.ChartTitle.Font.Size = 11
        $chart.ChartTitle.Font.Bold = $true
        $chart.HasLegend = [bool]$spec.Legend
        if ($chart.HasLegend) {
            $chart.Legend.Position = -4107
            $chart.Legend.Font.Size = 8
        }

        foreach ($seriesSpec in $spec.Series) {
            Add-Series $chart $chartData $seriesSpec.Name $seriesSpec.X $seriesSpec.Y $seriesSpec.Color
        }

        Format-Axis $chart.Axes(1) $spec.XTitle $spec.XMin $spec.XMax $colors.Grid $colors.Axis
        Format-Axis $chart.Axes(2) $spec.YTitle $null $null $colors.Grid $colors.Axis

        try {
            $chart.Axes(1).Crosses = 4
            $chart.Axes(2).Crosses = 4
        } catch {}

        try {
            $chart.ChartArea.Format.Line.ForeColor.RGB = $colors.Border
            $chart.ChartArea.Format.Line.Weight = 0.75
            $chart.ChartArea.Format.Fill.ForeColor.RGB = (ExcelRgb 255 255 255)
            $chart.PlotArea.Format.Fill.ForeColor.RGB = (ExcelRgb 255 255 255)
        } catch {}
    }

    $excel.CalculateFullRebuild()
    $workbook.Save()
    $workbook.Close($true)
    $excel.Quit()
    Write-Output $Path
}
finally {
    if ($workbook -ne $null) {
        try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) } catch {}
    }
    if ($excel -ne $null) {
        try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) } catch {}
    }
}
