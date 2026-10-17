$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'Updater-Progress.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing,System
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Windows.Forms;
public static class UpdateCapture {
 public static void Capture(Form window,string path) {
  window.Invoke(new Action(delegate {using(Bitmap bitmap=new Bitmap(window.ClientSize.Width,window.ClientSize.Height)){window.DrawToBitmap(bitmap,new Rectangle(Point.Empty,window.ClientSize));bitmap.Save(path,System.Drawing.Imaging.ImageFormat.Png);}}));
 }
}
'@ -ReferencedAssemblies System.Windows.Forms,System.Drawing,System
$flags=[System.Reflection.BindingFlags]'NonPublic,Static'
$type=[PlazCode.UpdateProgress]
$palette=$type.GetNestedType('Palette',[System.Reflection.BindingFlags]::NonPublic)
$themes=@{default='#e9ba53';amethyst='#a571ff';cyan='#27c1e7';rose='#f17097';emerald='#29c894';graphite='#9caac0';crimson='#ef5569';ocean='#4692f6';copper='#db9066';aurora='#66d3b8';orchid='#cd89eb';solar='#e9ba53'}
foreach($theme in $themes.Keys){
 $value=$palette.GetMethod('ForTheme').Invoke($null,@($theme))
 $accent=$palette.GetField('Accent').GetValue($value)
 if($accent.ToArgb() -ne [System.Drawing.ColorTranslator]::FromHtml($themes[$theme]).ToArgb()){throw "Palette mismatch: $theme"}
}
try{
 [PlazCode.UpdateProgress]::Open('1.19.30','ocean',$true,'off',$false)
 $window=$type.GetField('currentWindow',$flags).GetValue($null)
 if($null -eq $window -or $window.TopMost -or $window.WindowState -ne [System.Windows.Forms.FormWindowState]::Minimized){throw 'Background updater must remain minimized and non-topmost'}
 $instance=[System.Reflection.BindingFlags]'NonPublic,Instance'
 if(-not $window.GetType().GetProperty('ShowWithoutActivation',$instance).GetValue($window,$null)){throw 'Background updater allows activation'}
 $params=$window.GetType().GetProperty('CreateParams',$instance).GetValue($window,$null)
 if(($params.ExStyle -band 0x08000000) -eq 0){throw 'WS_EX_NOACTIVATE missing'}
 if($type.GetField('glow',$flags).GetValue($null) -or $type.GetField('gradients',$flags).GetValue($null)){throw 'Appearance switches were ignored'}
}finally{[PlazCode.UpdateProgress]::Close()}
New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot 'visual-checks') | Out-Null
foreach($theme in @('default','ocean','orchid')){
 try{
  [PlazCode.UpdateProgress]::Open('1.19.30',$theme,$false,'subtle',$true)
  [PlazCode.UpdateProgress]::Set(60,'Installing update','Checking the verified release package.')
  $window=$type.GetField('currentWindow',$flags).GetValue($null)
  [UpdateCapture]::Capture($window,(Join-Path $PSScriptRoot "visual-checks/updater-$theme.png"))
 }finally{[PlazCode.UpdateProgress]::Close()}
}
Write-Output 'PASS real Windows Forms updater: 12 palettes, minimized non-activating background mode, glow/gradient preferences and three rendered screenshots. Real-user foreground installation/relaunch is not exercised.'
