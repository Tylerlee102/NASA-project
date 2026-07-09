$ErrorActionPreference = "Stop"

$sourcePath = "C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\codex-20260608-parabolic-radar-review\parabolic-motion-radar-model-baseline-and-runs-checked-generated-topography.xlsx"
$outputPath = "C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\codex-20260608-parabolic-radar-review\parabolic-motion-radar-model-baseline-and-runs-dashboard-fixed-generated-topography.xlsx"

Copy-Item -LiteralPath $sourcePath -Destination $outputPath -Force

function RgbValue([int]$r, [int]$g, [int]$b) {
  return $r + ($g -shl 8) + ($b -shl 16)
}

function Get-OrAddWorksheet($workbook, [string]$name) {
  foreach ($sheet in @($workbook.Worksheets)) {
    if ($sheet.Name -eq $name) {
      return $sheet
    }
  }
  $newSheet = $workbook.Worksheets.Add($null, $workbook.Worksheets.Item($workbook.Worksheets.Count))
  $newSheet.Name = $name
  return $newSheet
}

function Set-SeriesLine($series, [int]$color, [double]$weight, [int]$dashStyle) {
  $series.MarkerStyle = -4142
  $series.Format.Line.Visible = -1
  $series.Format.Line.ForeColor.RGB = $color
  $series.Format.Line.Weight = $weight
  $series.Format.Line.DashStyle = $dashStyle
}

function Add-LineChart(
  $dashboard,
  [string]$positionRange,
  [string]$title,
  [string]$xTitle,
  [string]$primaryYTitle,
  [array]$seriesSpecs,
  [Nullable[double]]$primaryMin,
  [Nullable[double]]$primaryMax,
  [string]$secondaryYTitle,
  [Nullable[double]]$secondaryMin,
  [Nullable[double]]$secondaryMax
) {
  $box = $dashboard.Range($positionRange)
  $chartObject = $dashboard.ChartObjects().Add($box.Left, $box.Top, $box.Width, $box.Height)
  $chart = $chartObject.Chart
  $chart.ChartType = 4
  $chart.HasTitle = $true
  $chart.ChartTitle.Text = $title
  $chart.ChartTitle.Font.Size = 11
  $chart.HasLegend = $true
  $chart.Legend.Position = -4107
  $chart.Legend.Font.Size = 8

  foreach ($spec in $seriesSpecs) {
    $series = $chart.SeriesCollection().NewSeries()
    $series.Name = $spec.Name
    $series.XValues = $spec.XValues
    $series.Values = $spec.Values
    if ($spec.AxisGroup -eq 2) {
      $series.AxisGroup = 2
    }
    Set-SeriesLine $series $spec.Color $spec.Weight $spec.DashStyle
  }

  $chart.Axes(1, 1).HasTitle = $true
  $chart.Axes(1, 1).AxisTitle.Text = $xTitle
  $chart.Axes(1, 1).AxisTitle.Font.Size = 9
  $chart.Axes(1, 1).TickLabels.Font.Size = 8

  $chart.Axes(2, 1).HasTitle = $true
  $chart.Axes(2, 1).AxisTitle.Text = $primaryYTitle
  $chart.Axes(2, 1).AxisTitle.Font.Size = 9
  $chart.Axes(2, 1).TickLabels.Font.Size = 8
  if ($primaryMin.HasValue) { $chart.Axes(2, 1).MinimumScale = $primaryMin.Value }
  if ($primaryMax.HasValue) { $chart.Axes(2, 1).MaximumScale = $primaryMax.Value }

  if ($secondaryYTitle.Length -gt 0) {
    $chart.HasAxis(2, 2) = $true
    $chart.Axes(2, 2).HasTitle = $true
    $chart.Axes(2, 2).AxisTitle.Text = $secondaryYTitle
    $chart.Axes(2, 2).AxisTitle.Font.Size = 9
    $chart.Axes(2, 2).TickLabels.Font.Size = 8
    if ($secondaryMin.HasValue) { $chart.Axes(2, 2).MinimumScale = $secondaryMin.Value }
    if ($secondaryMax.HasValue) { $chart.Axes(2, 2).MaximumScale = $secondaryMax.Value }
  }

  $chart.Axes(2, 1).MajorGridlines.Format.Line.ForeColor.RGB = RgbValue 220 220 220
  $chart.Axes(2, 1).MajorGridlines.Format.Line.DashStyle = 4
  return $chartObject
}

$excel = $null
$workbook = $null

try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.ScreenUpdating = $false

  $workbook = $excel.Workbooks.Open($outputPath, 0, $false)
  $dashboard = $workbook.Worksheets.Item("Dashboard")
  $helper = Get-OrAddWorksheet $workbook "Dashboard_Chart_Data"

  $helper.Cells.Clear()
  $helper.Visible = -1
  $headers = @(
    "Along-track Distance x (km)",
    "Generated Topography Surface (Baseline)",
    "Apparent Radar Horizon (Flat Geometry)",
    "Apparent Radar Horizon (Topo-Adjusted)",
    "Off-Nadir Generated Topography Height (m)",
    "Nadir Generated Topography Height (m)",
    "Satellite Parabolic Altitude (km)",
    "Smooth Flyby VHF Doppler (Hz)",
    "Terrain-Distorted VHF Doppler (Hz)",
    "Smooth Flyby HF Doppler (Hz)",
    "Terrain-Distorted HF Doppler (Hz)",
    "Scenario Pass Fraction",
    "Current Custom Altitude (km)",
    "Paper 800-km Pass Altitude (km)",
    "Paper 1600-km Pass Altitude (km)",
    "Paper 25-to-1000-km Altitude (km)"
  )
  for ($col = 1; $col -le $headers.Count; $col++) {
    $helper.Cells.Item(1, $col).Value2 = $headers[$col - 1]
  }

  for ($row = 2; $row -le 242; $row++) {
    $helper.Cells.Item($row, 1).Formula = "='Chart_Data'!A$row"
    $helper.Cells.Item($row, 2).Formula = "='Chart_Data'!J$row"
    $helper.Cells.Item($row, 3).Formula = "='Chart_Data'!J$row-'Chart_Data'!D$row"
    $helper.Cells.Item($row, 4).Formula = "='Chart_Data'!J$row-'Chart_Data'!E$row"
    $helper.Cells.Item($row, 5).Formula = "='Chart_Data'!I$row"
    $helper.Cells.Item($row, 6).Formula = "='Chart_Data'!J$row"
    $helper.Cells.Item($row, 7).Formula = "='Model_Data'!B$row"
    $helper.Cells.Item($row, 8).Formula = "='Chart_Data'!Q$row"
    $helper.Cells.Item($row, 9).Formula = "='Chart_Data'!R$row"
    $helper.Cells.Item($row, 10).Formula = "='Chart_Data'!S$row"
    $helper.Cells.Item($row, 11).Formula = "='Chart_Data'!T$row"
    $helper.Cells.Item($row, 12).Formula = "='Scenario_Data'!AX$row"
    $helper.Cells.Item($row, 13).Formula = "='Scenario_Data'!AZ$row"
    $helper.Cells.Item($row, 14).Formula = "='Scenario_Data'!BA$row"
    $helper.Cells.Item($row, 15).Formula = "='Scenario_Data'!BB$row"
    $helper.Cells.Item($row, 16).Formula = "='Scenario_Data'!BC$row"
  }
  $helper.Range("A1:P1").Font.Bold = $true
  $helper.Columns.AutoFit() | Out-Null

  $dashboard.Range("A25:H26").Value2 =
    "How to read this model: the chart baseline is the generated topography surface, not the scanned surface and not a 0 m floor. Apparent radar horizon = generated nadir topography height - radar depth reading. Nadir is straight below the spacecraft; off-nadir is the side-looking target at y = Inputs!C6."

  $dashboard.Range("A65:H72").ClearContents()
  $dashboard.Range("A65:H65").Merge()
  $dashboard.Range("A65").Value2 = "Quick Graph Guide"
  $dashboard.Range("A66").Value2 = "Graph"
  $dashboard.Range("B66:E66").Merge()
  $dashboard.Range("B66").Value2 = "What it is trying to show"
  $dashboard.Range("F66:H66").Merge()
  $dashboard.Range("F66").Value2 = "How to read the baseline"
  $guideRows = @(
    @("Apparent elevation", "Generated terrain surface compared with the two radar horizons after converting depth into elevation.", "Green is generated topography. Blue/orange are apparent radar horizons, not spacecraft motion."),
    @("Surface geometry", "Generated off-nadir terrain, generated nadir terrain, and the satellite altitude on a separate scale.", "Left axis is terrain meters. Right axis is satellite altitude in kilometers."),
    @("VHF Doppler", "Smooth flyby VHF Doppler compared with terrain-distorted VHF Doppler.", "Separate VHF graph keeps its large scale from hiding HF behavior."),
    @("HF Doppler", "Smooth flyby HF Doppler compared with terrain-distorted HF Doppler.", "Zoomed HF scale makes the terrain-driven wiggles readable."),
    @("Scenario altitude", "Only altitude profiles for custom and paper scenarios, normalized by pass fraction.", "No scenario apparent-depth plot; that would flatten the custom pass."),
    @("Formula basis", "Generated topo comes from Model_Data!X/Y. Dashboard helper formulas transform the readings.", "Baseline is generated topography, not scanned data.")
  )
  for ($i = 0; $i -lt $guideRows.Count; $i++) {
    $targetRow = 67 + $i
    $dashboard.Cells.Item($targetRow, 1).Value2 = $guideRows[$i][0]
    $dashboard.Range("B$targetRow:E$targetRow").Merge()
    $dashboard.Range("B$targetRow").Value2 = $guideRows[$i][1]
    $dashboard.Range("F$targetRow:H$targetRow").Merge()
    $dashboard.Range("F$targetRow").Value2 = $guideRows[$i][2]
  }
  $dashboard.Range("A65:H72").WrapText = $true
  $dashboard.Range("A65:H66").Font.Bold = $true

  $dashboard.Range("M1").Value2 = "Dashboard charts rebuilt: generated topography is the reference baseline."
  $dashboard.Range("M1:R1").Merge()
  $dashboard.Range("M1:R1").Font.Bold = $true
  $dashboard.Range("M1:R1").Interior.Color = RgbValue 255 244 214

  $dashboard.ChartObjects() | ForEach-Object { $_.Delete() }

  $green = RgbValue 22 163 74
  $blue = RgbValue 37 99 235
  $orange = RgbValue 249 115 22
  $gray = RgbValue 85 85 85
  $purple = RgbValue 124 58 237
  $cyan = RgbValue 8 145 178

  Add-LineChart $dashboard "I3:R23" "Radar Apparent Elevation Relative to Generated Topography" "Along-track distance x (km)" "Elevation (m)" @(
    @{ Name = "Generated Topography Surface (Baseline)"; XValues = $helper.Range("A2:A242"); Values = $helper.Range("B2:B242"); Color = $green; Weight = 2.75; DashStyle = 1; AxisGroup = 1 },
    @{ Name = "Apparent Radar Horizon (Flat Geometry)"; XValues = $helper.Range("A2:A242"); Values = $helper.Range("C2:C242"); Color = $blue; Weight = 2; DashStyle = 4; AxisGroup = 1 },
    @{ Name = "Apparent Radar Horizon (Topo-Adjusted)"; XValues = $helper.Range("A2:A242"); Values = $helper.Range("D2:D242"); Color = $orange; Weight = 2.25; DashStyle = 1; AxisGroup = 1 }
  ) $null $null "" $null $null | Out-Null

  Add-LineChart $dashboard "A29:H48" "Generated Surface Geometry + Satellite Location" "Along-track distance x (km)" "Generated topography height (m)" @(
    @{ Name = "Off-Nadir Generated Topography"; XValues = $helper.Range("A2:A242"); Values = $helper.Range("E2:E242"); Color = $orange; Weight = 2; DashStyle = 1; AxisGroup = 1 },
    @{ Name = "Nadir Generated Topography"; XValues = $helper.Range("A2:A242"); Values = $helper.Range("F2:F242"); Color = $green; Weight = 2; DashStyle = 1; AxisGroup = 1 },
    @{ Name = "Satellite Parabolic Altitude"; XValues = $helper.Range("A2:A242"); Values = $helper.Range("G2:G242"); Color = $gray; Weight = 2; DashStyle = 4; AxisGroup = 2 }
  ) -200 800 "Satellite altitude (km)" 380 420 | Out-Null

  Add-LineChart $dashboard "I25:R44" "VHF Doppler: Smooth Flyby vs Terrain-Distorted" "Along-track distance x (km)" "Doppler shift (Hz)" @(
    @{ Name = "Smooth Flyby VHF Doppler (Flat)"; XValues = $helper.Range("A2:A242"); Values = $helper.Range("H2:H242"); Color = $blue; Weight = 2; DashStyle = 4; AxisGroup = 1 },
    @{ Name = "Terrain-Distorted VHF Doppler (Topo)"; XValues = $helper.Range("A2:A242"); Values = $helper.Range("I2:I242"); Color = $orange; Weight = 2; DashStyle = 1; AxisGroup = 1 }
  ) $null $null "" $null $null | Out-Null

  Add-LineChart $dashboard "I46:R64" "HF Doppler: Smooth Flyby vs Terrain-Distorted" "Along-track distance x (km)" "Doppler shift (Hz)" @(
    @{ Name = "Smooth Flyby HF Doppler (Flat)"; XValues = $helper.Range("A2:A242"); Values = $helper.Range("J2:J242"); Color = $blue; Weight = 2; DashStyle = 4; AxisGroup = 1 },
    @{ Name = "Terrain-Distorted HF Doppler (Topo)"; XValues = $helper.Range("A2:A242"); Values = $helper.Range("K2:K242"); Color = $cyan; Weight = 2; DashStyle = 1; AxisGroup = 1 }
  ) -90 90 "" $null $null | Out-Null

  Add-LineChart $dashboard "A74:H111" "Scenario Altitude Profiles Only" "Pass fraction (-1 to +1)" "Altitude (km)" @(
    @{ Name = "Current Custom Altitude"; XValues = $helper.Range("L2:L242"); Values = $helper.Range("M2:M242"); Color = $orange; Weight = 2; DashStyle = 1; AxisGroup = 1 },
    @{ Name = "Paper 800-km Pass Altitude"; XValues = $helper.Range("L2:L242"); Values = $helper.Range("N2:N242"); Color = $green; Weight = 2; DashStyle = 1; AxisGroup = 1 },
    @{ Name = "Paper 1600-km Pass Altitude"; XValues = $helper.Range("L2:L242"); Values = $helper.Range("O2:O242"); Color = $blue; Weight = 2; DashStyle = 1; AxisGroup = 1 },
    @{ Name = "Paper 25-to-1000-km Pass Altitude"; XValues = $helper.Range("L2:L242"); Values = $helper.Range("P2:P242"); Color = $purple; Weight = 2; DashStyle = 4; AxisGroup = 1 }
  ) 0 1100 "" $null $null | Out-Null

  $workbook.Worksheets.Item("Chart_Data").Range("B1").Value2 = "Flat-Nadir Reference Line (0 m datum)"
  $workbook.Worksheets.Item("Chart_Data").Range("H1").Value2 = "0 m Base Datum"
  $workbook.Worksheets.Item("Chart_Data").Range("Z1").Value2 = "Flat-Nadir Reference Line (0 m datum)"

  $workbook.CalculateFull()
  $workbook.Save()
  $workbook.Close($true)
  $excel.Quit()

  Write-Output "saved=$outputPath"
} finally {
  if ($workbook -ne $null) {
    try { $workbook.Close($false) | Out-Null } catch {}
  }
  if ($excel -ne $null) {
    try { $excel.Quit() | Out-Null } catch {}
  }
  [System.GC]::Collect()
  [System.GC]::WaitForPendingFinalizers()
}
