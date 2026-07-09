$ErrorActionPreference = "Stop"

$Source = "C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\europa_ice_subsurface_simulation\v12.xlsx"
$Target = "C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\europa_ice_subsurface_simulation\v13.xlsx"
Copy-Item -LiteralPath $Source -Destination $Target -Force

function ExcelRgb([int]$r, [int]$g, [int]$b) {
    return $r + ($g -shl 8) + ($b -shl 16)
}

function Put-Cell($sheet, [int]$row, [int]$col, [string]$value) {
    $cell = $sheet.Cells.Item($row, $col)
    if ($value -like "=*") {
        $cell.Formula = $value
    } else {
        $cell.Value2 = $value
    }
}

$excel = $null
$workbook = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Open($Target)

    foreach ($sheet in @($workbook.Worksheets)) {
        if ($sheet.Name -eq "Subsurface_Model_Audit") {
            $sheet.Delete()
            break
        }
    }

    $afterSheet = $workbook.Worksheets.Item("Subsurface_Formulas")
    $audit = $workbook.Worksheets.Add([System.Type]::Missing, $afterSheet)
    $audit.Name = "Subsurface_Model_Audit"

    $audit.Range("A1:E1").Merge()
    $audit.Range("A1").Value2 = "Subsurface Model Audit"
    $audit.Range("A1").Font.Bold = $true
    $audit.Range("A1").Font.Size = 16
    $audit.Range("A2:E2").Merge()
    $audit.Range("A2").Value2 = "Live checks that confirm the graphs are connected to Excel formulas and the layer/radar calculations are internally consistent."
    $audit.Range("A2").WrapText = $true

    $headers = @("Area", "Check", "Live Excel formula", "Result", "Notes")
    for ($c = 1; $c -le $headers.Count; $c++) {
        $cell = $audit.Cells.Item(3, $c)
        $cell.Value2 = $headers[$c - 1]
        $cell.Font.Bold = $true
        $cell.Font.Color = 16777215
        $cell.Interior.Color = ExcelRgb 31 78 121
        $cell.WrapText = $true
    }

    $rows = @(
        @(
            "Graph links",
            "All plotted chart-source cells are formulas",
            '=IF(SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A3:H243))+SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A248:F488))+SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A493:F733))+SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A738:F978))+SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A983:H1223))+SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A1228:F1468))+SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A1473:B1477))+SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A1492:B1495))=9658,"PASS","CHECK")',
            $null,
            "Confirms graph ranges are live formula cells, not pasted chart values."
        ),
        @(
            "Graph links",
            "Main simulation output is formula-driven",
            '=IF(SUMPRODUCT(--ISFORMULA(Subsurface_Live_Data!A2:AA242))>=6200,"PASS","CHECK")',
            $null,
            "The simulation table contains formulas for the calculated outputs."
        ),
        @(
            "Layer logic",
            "Depth order is shallow ice < lens < ocean",
            '=IF(SUMPRODUCT(--(Subsurface_Live_Data!F2:F242<Subsurface_Live_Data!I2:I242),--(Subsurface_Live_Data!I2:I242<Subsurface_Live_Data!K2:K242))=ROWS(Subsurface_Live_Data!F2:F242),"PASS","CHECK")',
            $null,
            "Depths are below the icy surface; larger depth means deeper."
        ),
        @(
            "Layer logic",
            "Elevation order is surface > shallow ice > lens > ocean boundary",
            '=IF(SUMPRODUCT(--(Subsurface_Live_Data!B2:B242>Subsurface_Live_Data!G2:G242),--(Subsurface_Live_Data!G2:G242>Subsurface_Live_Data!J2:J242),--(Subsurface_Live_Data!J2:J242>Subsurface_Live_Data!L2:L242))=ROWS(Subsurface_Live_Data!B2:B242),"PASS","CHECK")',
            $null,
            "Matches the first dashboard graph: deeper interfaces plot lower."
        ),
        @(
            "Layer formulas",
            "Layer elevations equal surface height minus depth",
            '=IF(AND(SUMPRODUCT(--(ABS(Subsurface_Live_Data!G2:G242-(Subsurface_Live_Data!B2:B242-Subsurface_Live_Data!F2:F242))<0.000001))=ROWS(Subsurface_Live_Data!G2:G242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!J2:J242-(Subsurface_Live_Data!B2:B242-Subsurface_Live_Data!I2:I242))<0.000001))=ROWS(Subsurface_Live_Data!J2:J242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!L2:L242-(Subsurface_Live_Data!B2:B242-Subsurface_Live_Data!K2:K242))<0.000001))=ROWS(Subsurface_Live_Data!L2:L242)),"PASS","CHECK")',
            $null,
            "Checks shallow, lens, and ocean-boundary elevation formulas."
        ),
        @(
            "Radar timing",
            "Deeper reflectors return later",
            '=IF(SUMPRODUCT(--(Subsurface_Live_Data!M2:M242<Subsurface_Live_Data!N2:N242),--(Subsurface_Live_Data!N2:N242<Subsurface_Live_Data!O2:O242))=ROWS(Subsurface_Live_Data!M2:M242),"PASS","CHECK")',
            $null,
            "Matches the radargram logic: longer delay means deeper ice."
        ),
        @(
            "Radar timing",
            "Delay formula equals 2*n*depth/c*1e6",
            '=IF(AND(SUMPRODUCT(--(ABS(Subsurface_Live_Data!M2:M242-(2*Subsurface_Inputs!$C$34*Subsurface_Live_Data!F2:F242/Subsurface_Inputs!$C$35*1000000))<0.000001))=ROWS(Subsurface_Live_Data!M2:M242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!N2:N242-(2*Subsurface_Inputs!$C$34*Subsurface_Live_Data!I2:I242/Subsurface_Inputs!$C$35*1000000))<0.000001))=ROWS(Subsurface_Live_Data!N2:N242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!O2:O242-(2*Subsurface_Inputs!$C$34*Subsurface_Live_Data!K2:K242/Subsurface_Inputs!$C$35*1000000))<0.000001))=ROWS(Subsurface_Live_Data!O2:O242)),"PASS","CHECK")',
            $null,
            "Checks shallow, lens, and ocean-boundary delay equations."
        ),
        @(
            "Echo strength",
            "Echo formulas match attenuation and roughness assumptions",
            '=IF(AND(SUMPRODUCT(--(ABS(Subsurface_Live_Data!P2:P242-(Subsurface_Inputs!$C$37-2*Subsurface_Inputs!$C$36*(Subsurface_Live_Data!F2:F242/1000)))<0.000001))=ROWS(Subsurface_Live_Data!P2:P242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!Q2:Q242-(Subsurface_Inputs!$C$38+Subsurface_Inputs!$C$39*Subsurface_Live_Data!H2:H242-2*Subsurface_Inputs!$C$36*(Subsurface_Live_Data!I2:I242/1000)))<0.000001))=ROWS(Subsurface_Live_Data!Q2:Q242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!R2:R242-(Subsurface_Inputs!$C$40-2*Subsurface_Inputs!$C$36*(Subsurface_Live_Data!K2:K242/1000)-Subsurface_Inputs!$C$41*ABS(Subsurface_Live_Data!L2:L242-AVERAGE(Subsurface_Live_Data!L2:L242))))<0.000001))=ROWS(Subsurface_Live_Data!R2:R242)),"PASS","CHECK")',
            $null,
            "Checks shallow echo, lens echo, and ocean-boundary echo."
        ),
        @(
            "Detectability",
            "Margins equal echo strength minus detection threshold",
            '=IF(AND(SUMPRODUCT(--(ABS(Subsurface_Live_Data!X2:X242-(Subsurface_Live_Data!Q2:Q242-Subsurface_Live_Data!W2:W242))<0.000001))=ROWS(Subsurface_Live_Data!X2:X242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!Y2:Y242-(Subsurface_Live_Data!R2:R242-Subsurface_Live_Data!W2:W242))<0.000001))=ROWS(Subsurface_Live_Data!Y2:Y242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!AA2:AA242)<0.000001))=ROWS(Subsurface_Live_Data!AA2:AA242)),"PASS","CHECK")',
            $null,
            "Checks the detectability-margin chart."
        ),
        @(
            "Scenario logic",
            "Thin < medium < thick shell scenarios",
            '=IF(SUMPRODUCT(--(Subsurface_Scenario_Data!E2:E242<Subsurface_Scenario_Data!F2:F242),--(Subsurface_Scenario_Data!F2:F242<Subsurface_Scenario_Data!G2:G242))=ROWS(Subsurface_Scenario_Data!E2:E242),"PASS","CHECK")',
            $null,
            "Checks the scenario comparison chart."
        ),
        @(
            "Uncertainty logic",
            "Lower <= mean <= upper boundary band",
            '=IF(SUMPRODUCT(--(Subsurface_Scenario_Data!C2:C242<=Subsurface_Scenario_Data!B2:B242),--(Subsurface_Scenario_Data!B2:B242<=Subsurface_Scenario_Data!D2:D242))=ROWS(Subsurface_Scenario_Data!B2:B242),"PASS","CHECK")',
            $null,
            "Checks the uncertainty-band graph."
        ),
        @(
            "Radargram logic",
            "Weak lens returns are intentionally skipped with #N/A",
            '=IF(SUMPRODUCT(--ISNA(Subsurface_Radargram_Data!E2:E242))=COUNTIF(Subsurface_Live_Data!U2:U242,"Weak/no lens"),"PASS","CHECK")',
            $null,
            "#N/A here is intentional so Excel does not draw false weak-lens returns."
        ),
        @(
            "Evidence logic",
            "Evidence scores stay between 0 and 100 percent",
            '=IF(AND(MIN(Subsurface_Materials_Evidence!B10:B13)>=0,MAX(Subsurface_Materials_Evidence!B10:B13)<=100),"PASS","CHECK")',
            $null,
            "Checks the cross-instrument evidence graph."
        )
    )

    $startRow = 4
    for ($i = 0; $i -lt $rows.Count; $i++) {
        $rowNum = $startRow + $i
        Put-Cell $audit $rowNum 1 $rows[$i][0]
        Put-Cell $audit $rowNum 2 $rows[$i][1]
        $audit.Cells.Item($rowNum, 3).NumberFormat = "@"
        $audit.Cells.Item($rowNum, 3).Value2 = $rows[$i][2]
        $audit.Cells.Item($rowNum, 4).Formula = $rows[$i][2]
        Put-Cell $audit $rowNum 5 $rows[$i][4]
    }

    $used = $audit.Range("A3:E$($startRow + $rows.Count - 1)")
    $used.Borders.LineStyle = 1
    $used.Borders.Color = ExcelRgb 212 218 227
    $used.WrapText = $true
    $audit.Columns.Item("A").ColumnWidth = 18
    $audit.Columns.Item("B").ColumnWidth = 38
    $audit.Columns.Item("C").ColumnWidth = 48
    $audit.Columns.Item("D").ColumnWidth = 12
    $audit.Columns.Item("E").ColumnWidth = 62
    $audit.Rows.Item("1:2").RowHeight = 24
    $audit.Range("D4:D$($startRow + $rows.Count - 1)").Font.Bold = $true
    $audit.Range("D4:D$($startRow + $rows.Count - 1)").HorizontalAlignment = -4108
    $audit.Activate()
    $audit.Application.ActiveWindow.FreezePanes = $false
    $audit.Range("A4").Select()
    $audit.Application.ActiveWindow.FreezePanes = $true

    $formulaSheet = $workbook.Worksheets.Item("Subsurface_Formulas")
    $next = $formulaSheet.Cells.Item($formulaSheet.Rows.Count, 1).End(-4162).Row + 2
    $formulaSheet.Cells.Item($next, 1).Value2 = "Audit note"
    $formulaSheet.Cells.Item($next, 2).Value2 = "Radargram lens-return #N/A values are intentional. They appear only where the simulated lens is below the lens display threshold, so Excel skips those weak-lens points instead of drawing false returns."
    $formulaSheet.Cells.Item($next, 3).Value2 = "Subsurface_Radargram_Data column E, Subsurface_Live_Data column U"
    $formulaSheet.Cells.Item($next, 4).Value2 = "See Subsurface_Model_Audit"
    $formulaSheet.Range("A$next:D$next").WrapText = $true

    $excel.CalculateFullRebuild()
    $workbook.Save()
    $workbook.Close($true)
    $excel.Quit()
    Write-Output $Target
}
finally {
    if ($workbook -ne $null) {
        try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) } catch {}
    }
    if ($excel -ne $null) {
        try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) } catch {}
    }
}
