# PlazCode app steps (Windows): finds an app's windows and its buttons and fields BY NAME through Windows UI Automation, so the AI
# can say "in Notepad, click File" instead of guessing screen pixels from a picture. It only LOOKS (and, as a fallback for a
# control with no place on screen, presses it through UI Automation); PlazCode itself moves its cursor and clicks.
# One request per line on standard input (JSON), one JSON answer per line on standard output.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; [Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false } catch {}
# Screen pixels, the same ones PlazCode's mouse uses (PlazCode's window is per-monitor DPI aware too).
try {
  Add-Type -Namespace PZ -Name Dpi -MemberDefinition '[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(System.IntPtr value);'
  [void][PZ.Dpi]::SetProcessDpiAwarenessContext([System.IntPtr]::new(-4))
} catch {}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]
$True_ = [System.Windows.Automation.Condition]::TrueCondition

function Say($value) { [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress -Depth 5)); [Console]::Out.Flush() }
function Norm([string]$text) {
  if ($null -eq $text) { return '' }
  # "&File" / "_File" are keyboard markers, not part of the name.
  return (($text -replace '[&_]', '') -replace '\s+', ' ').Trim().ToLowerInvariant()
}
function ProcName([int]$id) { try { return (Get-Process -Id $id -ErrorAction Stop).ProcessName.ToLowerInvariant() } catch { return '' } }

function AppWindows($app, $proc) {
  $want = Norm $app
  $plain = $want -replace '[^a-z0-9]', ''
  $procs = @($plain)
  if ($proc) { $procs += @($proc | ForEach-Object { ([string]$_).ToLowerInvariant() }) }
  $found = @()
  foreach ($w in $AE::RootElement.FindAll($Scope::Children, $True_)) {
    try {
      $c = $w.Current
      # A minimised window has no size here; it is still the app's window (PlazCode restores it).
      $name = Norm $c.Name
      $pn = ProcName $c.ProcessId
      $score = 0
      if ($procs -contains $pn) { $score = 4 }
      elseif ($want -and $name -eq $want) { $score = 3 }
      elseif ($want -and $name.Contains($want)) { $score = 2 }
      elseif ($plain.Length -ge 3 -and $pn.Contains($plain)) { $score = 1 }
      if ($score -gt 0) { $found += [pscustomobject]@{ el = $w; score = $score; pid = $c.ProcessId; hwnd = $c.NativeWindowHandle; title = $c.Name } }
    } catch {}
  }
  return @($found | Sort-Object -Property score -Descending)
}

# Every top-level window of the app's process (menus and dialogs open as their own windows) plus the main one.
function Roots($pidValue, $hwnd) {
  $roots = @()
  foreach ($w in $AE::RootElement.FindAll($Scope::Children, $True_)) {
    try {
      $c = $w.Current
      if ($c.ProcessId -eq $pidValue -or ($hwnd -and $c.NativeWindowHandle -eq $hwnd)) { $roots += $w }
    } catch {}
  }
  # A Windows popup menu belongs to the system menu window class; it is shown on top and is searched first.
  try {
    foreach ($m in $AE::RootElement.FindAll($Scope::Children, (New-Object System.Windows.Automation.PropertyCondition($AE::ClassNameProperty, '#32768')))) { $roots = @($m) + $roots }
  } catch {}
  return $roots
}

# All the properties the search needs, fetched in ONE call per window (reading them one by one crosses into the other app
# thousands of times and took seconds).
$Cache = New-Object System.Windows.Automation.CacheRequest
foreach ($p in @($AE::NameProperty, $AE::AutomationIdProperty, $AE::HelpTextProperty, $AE::ControlTypeProperty, $AE::IsEnabledProperty, $AE::IsOffscreenProperty, $AE::BoundingRectangleProperty, $AE::ClassNameProperty)) { $Cache.Add($p) }
function Everything($root) {
  $h = $Cache.Activate()
  try { return @($root.FindAll($Scope::Descendants, $True_)) + @($root) } finally { $h.Dispose() }
}
# Chromium and Electron apps (Discord, Spotify, Teams, VS Code, ...) build their list of buttons only once something asks
# for it; ask, then give them a moment.
function Wake($root) {
  for ($i = 0; $i -lt 4; $i++) {
    $all = Everything $root
    $web = @($all | Where-Object { $_.Cached.ClassName -eq 'Chrome_RenderWidgetHostHWND' })
    if ($web.Count -eq 0 -or $all.Count -gt 60) { return $all }
    Start-Sleep -Milliseconds 700
  }
  return (Everything $root)
}
function TypeName($el) { try { return ($el.Cached.ControlType.ProgrammaticName -replace '^ControlType\.', '') } catch { return '' } }
function Labels($el) {
  $c = $el.Cached
  return @(@($c.Name, $c.AutomationId, $c.HelpText) | Where-Object { $_ } | ForEach-Object { Norm $_ })
}
function Score($el, $target, $kind) {
  $best = 0
  foreach ($label in (Labels $el)) {
    if (-not $label) { continue }
    if ($label -eq $target) { $s = 100 }
    elseif ($label.StartsWith($target)) { $s = 70 }
    elseif ((' ' + $label + ' ').Contains(' ' + $target + ' ')) { $s = 55 }
    elseif ($label.Contains($target)) { $s = 35 }
    else { $s = 0 }
    if ($s -gt $best) { $best = $s }
  }
  if ($best -eq 0) { return 0 }
  $t = TypeName $el
  if ($kind -eq 'field') { if (@('Edit', 'Document', 'ComboBox') -contains $t) { $best += 40 } else { $best -= 40 } }
  elseif (@('Button', 'MenuItem', 'Hyperlink', 'ListItem', 'TabItem', 'CheckBox', 'RadioButton', 'TreeItem', 'SplitButton', 'ComboBox', 'DataItem') -contains $t) { $best += 15 }
  elseif ($t -eq 'Text') { $best -= 5 }
  $c = $el.Cached
  if (-not $c.IsEnabled) { $best -= 50 }
  if ($c.IsOffscreen) { $best -= 60 }
  $r = $c.BoundingRectangle
  if ($r.Width -le 0 -or $r.Height -le 0) { $best -= 30 }
  return $best
}

function Search($pidValue, $hwnd, $name, $kind, [int]$nth) {
  $target = Norm $name
  $hits = New-Object System.Collections.ArrayList
  $seen = New-Object System.Collections.ArrayList
  $visited = 0
  foreach ($root in (Roots $pidValue $hwnd)) {
    foreach ($el in (Wake $root)) {
      $visited++
      try {
        $s = Score $el $target $kind
        if ($s -gt 20) { $r = $el.Cached.BoundingRectangle; [void]$hits.Add([pscustomobject]@{ el = $el; score = $s; top = $r.Top; left = $r.Left }) }
        elseif ($seen.Count -lt 40) {
          $n = $el.Cached.Name
          if ($n -and $n.Length -le 60 -and -not $el.Cached.IsOffscreen -and (@('Button', 'MenuItem', 'Hyperlink', 'TabItem', 'Edit', 'ListItem', 'CheckBox', 'ComboBox') -contains (TypeName $el))) { if (-not $seen.Contains($n)) { [void]$seen.Add($n) } }
        }
      } catch {}
    }
  }
  if ($hits.Count -eq 0) { return @{ ok = $false; seen = @($seen); visited = $visited } }
  $top = ($hits | Measure-Object -Property score -Maximum).Maximum
  $best = @($hits | Where-Object { $_.score -ge $top } | Sort-Object -Property top, left)
  $pick = $best[[Math]::Min([Math]::Max($nth, 1), $best.Count) - 1]
  $c = $pick.el.Cached
  $r = $c.BoundingRectangle
  $script:LastFound = $pick.el
  $value = $null
  try { $vp = $pick.el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); $value = $vp.Current.Value } catch {}
  return @{ ok = $true; x = [int]($r.Left + $r.Width / 2); y = [int]($r.Top + $r.Height / 2); w = [int]$r.Width; h = [int]$r.Height; name = $c.Name; type = (TypeName $pick.el); enabled = $c.IsEnabled; matches = $best.Count; value = $value }
}

# For a control with no place on screen: press it through UI Automation instead of the mouse.
function Press($el) {
  foreach ($p in @([System.Windows.Automation.InvokePattern]::Pattern, [System.Windows.Automation.TogglePattern]::Pattern, [System.Windows.Automation.SelectionItemPattern]::Pattern, [System.Windows.Automation.ExpandCollapsePattern]::Pattern)) {
    try {
      $obj = $el.GetCurrentPattern($p)
      if ($obj -is [System.Windows.Automation.InvokePattern]) { $obj.Invoke(); return 'invoked' }
      if ($obj -is [System.Windows.Automation.TogglePattern]) { $obj.Toggle(); return 'toggled' }
      if ($obj -is [System.Windows.Automation.SelectionItemPattern]) { $obj.Select(); return 'selected' }
      if ($obj -is [System.Windows.Automation.ExpandCollapsePattern]) { $obj.Expand(); return 'expanded' }
    } catch {}
  }
  return $null
}

function ReadText($pidValue, $hwnd) {
  $parts = New-Object System.Collections.ArrayList
  $size = 0
  foreach ($root in (Roots $pidValue $hwnd)) {
    foreach ($el in (Wake $root)) {
      if ($size -ge 2500) { break }
      try {
        $c = $el.Cached
        $text = $c.Name
        if (@('Edit', 'Document') -contains (TypeName $el)) { try { $v = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value; if ($v) { $text = $v } } catch {} }
        if (-not $c.IsOffscreen -and $text -and $text.Length -le 400 -and -not $parts.Contains($text)) { [void]$parts.Add($text); $size += $text.Length + 1 }
      } catch {}
    }
  }
  return ($parts -join "`n")
}

function Launch($app) {
  $want = Norm $app
  try {
    $apps = @(Get-StartApps | Where-Object { (Norm $_.Name) -eq $want })
    if ($apps.Count -eq 0) { $apps = @(Get-StartApps | Where-Object { (Norm $_.Name).StartsWith($want) }) }
    if ($apps.Count -eq 0) { $apps = @(Get-StartApps | Where-Object { (Norm $_.Name).Contains($want) }) }
    if ($apps.Count -gt 0) {
      Start-Process -FilePath 'explorer.exe' -ArgumentList ('shell:AppsFolder\' + $apps[0].AppID)
      return @{ ok = $true; how = 'start menu'; name = $apps[0].Name }
    }
  } catch {}
  try { Start-Process -FilePath $app; return @{ ok = $true; how = 'program'; name = $app } } catch {}
  return @{ ok = $false; error = "PlazCode could not find an app called '$app' in the Start menu." }
}

$script:LastFound = $null
while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
    $q = $line | ConvertFrom-Json
    switch ($q.op) {
      'window' {
        $w = @(AppWindows $q.app $q.proc)
        if ($w.Count -eq 0) { Say @{ ok = $false } }
        else { Say @{ ok = $true; pid = $w[0].pid; hwnd = $w[0].hwnd; title = $w[0].title } }
      }
      'launch' { Say (Launch $q.app) }
      'focus' {
        try { $el = $AE::FromHandle([System.IntPtr]::new([long]$q.hwnd)); $el.SetFocus() } catch {}
        Say @{ ok = $true }
      }
      'find' { Say (Search $q.pid $q.hwnd $q.name $q.kind $q.nth) }
      'press' {
        $r = Search $q.pid $q.hwnd $q.name $q.kind $q.nth
        if (-not $r.ok) { Say $r } else { $how = Press $script:LastFound; Say @{ ok = [bool]$how; how = $how; name = $r.name; type = $r.type } }
      }
      'read' {
        if ($q.name) { $r = Search $q.pid $q.hwnd $q.name 'any' 1; if ($r.ok) { $text = $r.value; if (-not $text) { $text = $r.name }; Say @{ ok = $true; text = $text; name = $r.name } } else { Say $r } }
        else { Say @{ ok = $true; text = (ReadText $q.pid $q.hwnd) } }
      }
      'title' {
        try { $el = $AE::FromHandle([System.IntPtr]::new([long]$q.hwnd)); Say @{ ok = $true; title = $el.Current.Name } } catch { Say @{ ok = $false } }
      }
      default { Say @{ ok = $false; error = 'unknown request' } }
    }
  } catch { Say @{ ok = $false; error = $_.Exception.Message } }
}
