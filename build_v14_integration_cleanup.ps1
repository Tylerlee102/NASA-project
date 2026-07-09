$ErrorActionPreference = "Stop"

$Source = "C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\europa_ice_subsurface_simulation\v13.xlsx"
$Target = "C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\europa_ice_subsurface_simulation\v14.xlsx"
Copy-Item -LiteralPath $Source -Destination $Target -Force

function ExcelRgb([int]$r, [int]$g, [int]$b) {
    return $r + ($g -shl 8) + ($b -shl 16)
}

function Set-Value($sheet, [int]$row, [int]$col, [object]$value) {
    $sheet.Cells.Item($row, $col).Value2 = $value
}

function Set-Formula($sheet, [int]$row, [int]$col, [string]$formula) {
    $sheet.Cells.Item($row, $col).Formula = $formula
}

$excel = $null
$workbook = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Open($Target)

    $radar = $workbook.Worksheets.Item("Subsurface_Radargram_Data")
    for ($r = 2; $r -le 242; $r++) {
        $radar.Cells.Item($r, 5).Formula = "=IF(Subsurface_Live_Data!H$r>=Subsurface_Inputs!`$C`$42,Subsurface_Live_Data!N$r+Subsurface_Inputs!`$C`$56*SIN(2*PI()*A$r/27),"""")"
    }

    $subsurface = $workbook.Worksheets.Item("Subsurface_Dashboard")
    for ($i = 1; $i -le $subsurface.ChartObjects().Count; $i++) {
        $subsurface.ChartObjects($i).Chart.DisplayBlanksAs = 1
    }

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
    $audit.Range("A2").Value2 = "Live Excel checks for graph integration, formula-driven calculations, and visible workbook errors."
    $audit.Range("A2").WrapText = $true

    $headers = @("Area", "Check", "What the check verifies", "Result", "Notes")
    for ($c = 1; $c -le $headers.Count; $c++) {
        $cell = $audit.Cells.Item(3, $c)
        $cell.Value2 = $headers[$c - 1]
        $cell.Font.Bold = $true
        $cell.Font.Color = 16777215
        $cell.Interior.Color = ExcelRgb 31 78 121
        $cell.WrapText = $true
    }

    $rows = @(
        @{
            Area = "Workbook health"
            Check = "No visible calculation errors in subsurface sheets"
            What = "Uses ISERROR across the live data, scenario, radargram, chart-data, and evidence sheets."
            Formula = '=IF(SUMPRODUCT(--ISERROR(Subsurface_Live_Data!A2:AA242))+SUMPRODUCT(--ISERROR(Subsurface_Scenario_Data!A2:J242))+SUMPRODUCT(--ISERROR(Subsurface_Radargram_Data!A2:G242))+SUMPRODUCT(--ISERROR(Subsurface_Chart_Data!A3:H1495))+SUMPRODUCT(--ISERROR(Subsurface_Materials_Evidence!A1:J14))=0,"PASS","CHECK")'
            Notes = "Weak-lens radargram gaps are now blanks, not visible error values."
        },
        @{
            Area = "Graph links"
            Check = "All plotted chart-source cells are formulas"
            What = "Counts formula cells in every plotted block of Subsurface_Chart_Data."
            Formula = '=IF(SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A3:H243))+SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A248:F488))+SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A493:F733))+SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A738:F978))+SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A983:H1223))+SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A1228:F1468))+SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A1473:B1477))+SUMPRODUCT(--ISFORMULA(Subsurface_Chart_Data!A1492:B1495))=9658,"PASS","CHECK")'
            Notes = "Confirms chart sources are live formulas, not pasted values."
        },
        @{
            Area = "Graph links"
            Check = "Main simulation output is formula-driven"
            What = "Counts formulas in Subsurface_Live_Data."
            Formula = '=IF(SUMPRODUCT(--ISFORMULA(Subsurface_Live_Data!A2:AA242))>=6200,"PASS","CHECK")'
            Notes = "The model outputs are calculated inside Excel."
        },
        @{
            Area = "Layer logic"
            Check = "Depth order is shallow ice < lens < ocean"
            What = "Checks every row for physically ordered depths below the surface."
            Formula = '=IF(SUMPRODUCT(--(Subsurface_Live_Data!F2:F242<Subsurface_Live_Data!I2:I242),--(Subsurface_Live_Data!I2:I242<Subsurface_Live_Data!K2:K242))=ROWS(Subsurface_Live_Data!F2:F242),"PASS","CHECK")'
            Notes = "Larger depth means deeper below the icy topography."
        },
        @{
            Area = "Layer logic"
            Check = "Elevation order is surface > shallow ice > lens > ocean"
            What = "Checks every row for correct plotted vertical order."
            Formula = '=IF(SUMPRODUCT(--(Subsurface_Live_Data!B2:B242>Subsurface_Live_Data!G2:G242),--(Subsurface_Live_Data!G2:G242>Subsurface_Live_Data!J2:J242),--(Subsurface_Live_Data!J2:J242>Subsurface_Live_Data!L2:L242))=ROWS(Subsurface_Live_Data!B2:B242),"PASS","CHECK")'
            Notes = "Matches the icy-layer graph."
        },
        @{
            Area = "Layer formulas"
            Check = "Layer elevations equal surface height minus depth"
            What = "Checks shallow, lens, and ocean-boundary elevation formulas."
            Formula = '=IF(AND(SUMPRODUCT(--(ABS(Subsurface_Live_Data!G2:G242-(Subsurface_Live_Data!B2:B242-Subsurface_Live_Data!F2:F242))<0.000001))=ROWS(Subsurface_Live_Data!G2:G242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!J2:J242-(Subsurface_Live_Data!B2:B242-Subsurface_Live_Data!I2:I242))<0.000001))=ROWS(Subsurface_Live_Data!J2:J242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!L2:L242-(Subsurface_Live_Data!B2:B242-Subsurface_Live_Data!K2:K242))<0.000001))=ROWS(Subsurface_Live_Data!L2:L242)),"PASS","CHECK")'
            Notes = "Confirms the first graph's y-values are calculated correctly."
        },
        @{
            Area = "Radar timing"
            Check = "Deeper reflectors return later"
            What = "Checks shallow delay < lens delay < ocean-boundary delay."
            Formula = '=IF(SUMPRODUCT(--(Subsurface_Live_Data!M2:M242<Subsurface_Live_Data!N2:N242),--(Subsurface_Live_Data!N2:N242<Subsurface_Live_Data!O2:O242))=ROWS(Subsurface_Live_Data!M2:M242),"PASS","CHECK")'
            Notes = "Matches the radargram graph."
        },
        @{
            Area = "Radar timing"
            Check = "Delay formula equals 2*n*depth/c*1e6"
            What = "Checks shallow, lens, and ocean-boundary radar delays."
            Formula = '=IF(AND(SUMPRODUCT(--(ABS(Subsurface_Live_Data!M2:M242-(2*Subsurface_Inputs!$C$34*Subsurface_Live_Data!F2:F242/Subsurface_Inputs!$C$35*1000000))<0.000001))=ROWS(Subsurface_Live_Data!M2:M242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!N2:N242-(2*Subsurface_Inputs!$C$34*Subsurface_Live_Data!I2:I242/Subsurface_Inputs!$C$35*1000000))<0.000001))=ROWS(Subsurface_Live_Data!N2:N242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!O2:O242-(2*Subsurface_Inputs!$C$34*Subsurface_Live_Data!K2:K242/Subsurface_Inputs!$C$35*1000000))<0.000001))=ROWS(Subsurface_Live_Data!O2:O242)),"PASS","CHECK")'
            Notes = "Confirms radar timing is calculated in Excel."
        },
        @{
            Area = "Echo strength"
            Check = "Echo formulas match attenuation and roughness assumptions"
            What = "Checks shallow echo, lens echo, and ocean-boundary echo."
            Formula = '=IF(AND(SUMPRODUCT(--(ABS(Subsurface_Live_Data!P2:P242-(Subsurface_Inputs!$C$37-2*Subsurface_Inputs!$C$36*(Subsurface_Live_Data!F2:F242/1000)))<0.000001))=ROWS(Subsurface_Live_Data!P2:P242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!Q2:Q242-(Subsurface_Inputs!$C$38+Subsurface_Inputs!$C$39*Subsurface_Live_Data!H2:H242-2*Subsurface_Inputs!$C$36*(Subsurface_Live_Data!I2:I242/1000)))<0.000001))=ROWS(Subsurface_Live_Data!Q2:Q242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!R2:R242-(Subsurface_Inputs!$C$40-2*Subsurface_Inputs!$C$36*(Subsurface_Live_Data!K2:K242/1000)-Subsurface_Inputs!$C$41*ABS(Subsurface_Live_Data!L2:L242-AVERAGE(Subsurface_Live_Data!L2:L242))))<0.000001))=ROWS(Subsurface_Live_Data!R2:R242)),"PASS","CHECK")'
            Notes = "Confirms echo strength is calculated in Excel."
        },
        @{
            Area = "Detectability"
            Check = "Margins equal echo strength minus detection threshold"
            What = "Checks lens margin, ocean margin, and zero reference."
            Formula = '=IF(AND(SUMPRODUCT(--(ABS(Subsurface_Live_Data!X2:X242-(Subsurface_Live_Data!Q2:Q242-Subsurface_Live_Data!W2:W242))<0.000001))=ROWS(Subsurface_Live_Data!X2:X242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!Y2:Y242-(Subsurface_Live_Data!R2:R242-Subsurface_Live_Data!W2:W242))<0.000001))=ROWS(Subsurface_Live_Data!Y2:Y242),SUMPRODUCT(--(ABS(Subsurface_Live_Data!AA2:AA242)<0.000001))=ROWS(Subsurface_Live_Data!AA2:AA242)),"PASS","CHECK")'
            Notes = "Checks the detectability-margin graph."
        },
        @{
            Area = "Scenario logic"
            Check = "Thin < medium < thick shell scenarios"
            What = "Checks scenario depth ordering across every row."
            Formula = '=IF(SUMPRODUCT(--(Subsurface_Scenario_Data!E2:E242<Subsurface_Scenario_Data!F2:F242),--(Subsurface_Scenario_Data!F2:F242<Subsurface_Scenario_Data!G2:G242))=ROWS(Subsurface_Scenario_Data!E2:E242),"PASS","CHECK")'
            Notes = "Checks the scenario comparison chart."
        },
        @{
            Area = "Uncertainty logic"
            Check = "Lower <= mean <= upper boundary band"
            What = "Checks the uncertainty range around the mean boundary."
            Formula = '=IF(SUMPRODUCT(--(Subsurface_Scenario_Data!C2:C242<=Subsurface_Scenario_Data!B2:B242),--(Subsurface_Scenario_Data!B2:B242<=Subsurface_Scenario_Data!D2:D242))=ROWS(Subsurface_Scenario_Data!B2:B242),"PASS","CHECK")'
            Notes = "Checks the uncertainty-band graph."
        },
        @{
            Area = "Radargram logic"
            Check = "Weak lens returns are skipped as blanks"
            What = "Counts blank lens-return cells and compares them with weak-lens flags."
            Formula = '=IF(SUMPRODUCT(--(Subsurface_Radargram_Data!E2:E242=""))=COUNTIF(Subsurface_Live_Data!U2:U242,"Weak/no lens"),"PASS","CHECK")'
            Notes = "Blank cells prevent false weak-lens returns without showing spreadsheet errors."
        },
        @{
            Area = "Evidence logic"
            Check = "Evidence scores stay between 0 and 100 percent"
            What = "Checks evidence-score inputs used by the evidence graph."
            Formula = '=IF(AND(MIN(Subsurface_Materials_Evidence!B10:B13)>=0,MAX(Subsurface_Materials_Evidence!B10:B13)<=100),"PASS","CHECK")'
            Notes = "Checks the cross-instrument evidence graph."
        }
    )

    $startRow = 4
    for ($i = 0; $i -lt $rows.Count; $i++) {
        $rowNum = $startRow + $i
        Set-Value $audit $rowNum 1 $rows[$i].Area
        Set-Value $audit $rowNum 2 $rows[$i].Check
        Set-Value $audit $rowNum 3 $rows[$i].What
        Set-Formula $audit $rowNum 4 $rows[$i].Formula
        Set-Value $audit $rowNum 5 $rows[$i].Notes
    }

    $lastRow = $startRow + $rows.Count - 1
    $used = $audit.Range("A3:E$lastRow")
    $used.Borders.LineStyle = 1
    $used.Borders.Color = ExcelRgb 212 218 227
    $used.WrapText = $true
    $audit.Columns.Item("A").ColumnWidth = 18
    $audit.Columns.Item("B").ColumnWidth = 38
    $audit.Columns.Item("C").ColumnWidth = 58
    $audit.Columns.Item("D").ColumnWidth = 12
    $audit.Columns.Item("E").ColumnWidth = 62
    $audit.Range("D4:D$lastRow").Font.Bold = $true
    $audit.Range("D4:D$lastRow").HorizontalAlignment = -4108

    $green = ExcelRgb 226 244 234
    $red = ExcelRgb 252 228 214
    $audit.Range("D4:D$lastRow").FormatConditions.Delete()
    $passRule = $audit.Range("D4:D$lastRow").FormatConditions.Add(1, 3, "PASS")
    $passRule.Interior.Color = $green
    $checkRule = $audit.Range("D4:D$lastRow").FormatConditions.Add(1, 3, "CHECK")
    $checkRule.Interior.Color = $red

    $formulaSheet = $workbook.Worksheets.Item("Subsurface_Formulas")
    $formulaSheet.Cells.Replace("#N/A here is intentional so Excel does not draw false weak-lens returns.", "Blank weak-lens radargram cells are intentional so Excel skips those weak-lens points without showing error values.", 2)
    $formulaSheet.Cells.Replace("Radargram lens-return #N/A values are intentional.", "Radargram lens-return blanks are intentional.", 2)
    $next = $formulaSheet.Cells.Item($formulaSheet.Rows.Count, 1).End(-4162).Row + 2
    Set-Value $formulaSheet $next 1 "Integration cleanup"
    Set-Value $formulaSheet $next 2 "Weak lens radargram points now return blanks instead of visible error values. Subsurface_Chart_Data still uses live formulas, so graphs update when inputs change."
    Set-Value $formulaSheet $next 3 "Subsurface_Radargram_Data column E, Subsurface_Chart_Data radargram block"
    Set-Value $formulaSheet $next 4 "See Subsurface_Model_Audit"
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
