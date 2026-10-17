// Uses the same Windows Forms runtime as the updater. The UI owns its STA loop.
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Threading;
using System.Windows.Forms;

namespace PlazCode {
    public static class UpdateProgress {
        private static readonly object Gate = new object();
        private static Thread uiThread;
        private static int amount;
        private static string phase = "Verifying update", detail = "Preparing your PlazCode installation", version = "";
        private static bool closing;
        private static Exception startError;
        private static Palette colors = Palette.ForTheme("default");
        private static bool backgroundUpdate, gradients = true, glow = true;
        private static ProgressWindow currentWindow;
        private static string applicationIconPath;
        public static void Open(string release) { Open(release,"default",false,"subtle",true); }
        public static void Open(string release, string theme, bool background, string glowSetting, bool useGradients) { Open(release,theme,background,glowSetting,useGradients,null); }
        public static void Open(string release, string theme, bool background, string glowSetting, bool useGradients, string iconPath) {
            applicationIconPath = iconPath;
            colors = Palette.ForTheme(theme); backgroundUpdate = background;
            gradients = useGradients; glow = glowSetting != "off";
            lock (Gate) { version = release ?? ""; amount = -1; closing = false; startError = null; }
            using (ManualResetEvent ready = new ManualResetEvent(false)) {
                uiThread = new Thread(delegate() {
                    try {
                        using (ProgressWindow window = new ProgressWindow()) {
                            currentWindow = window;
                            window.Shown += delegate { try { ready.Set(); } catch (ObjectDisposedException) { } };
                            Application.Run(window);
                            currentWindow = null;
                        }
                    } catch (Exception error) { lock (Gate) { startError = error; } try { ready.Set(); } catch (ObjectDisposedException) { } }
                });
                uiThread.IsBackground = true;
                uiThread.SetApartmentState(ApartmentState.STA);
                uiThread.Start();
                // Keep the readiness handle alive until the window signals it.
                if (!ready.WaitOne(5000)) { lock (Gate) { closing = true; } throw new TimeoutException("Update window took too long to open"); }
                lock (Gate) { if (startError != null) throw new InvalidOperationException("Update window could not open", startError); }
            }
        }
        public static void Set(int percent, string title, string description) {
            lock (Gate) {
                amount = percent < 0 ? -1 : Math.Min(100, Math.Max(0, percent));
                phase = title ?? "Updating PlazCode"; detail = description ?? "";
            }
        }
        public static void Close() {
            lock (Gate) { closing = true; }
            if (uiThread != null && uiThread != Thread.CurrentThread) uiThread.Join(1500);
        }
        public static void NotifyFailure() {
            ProgressWindow window = currentWindow;
            if (window != null && window.IsHandleCreated) window.BeginInvoke(new Action(window.ShowFailureNotice));
        }
        private sealed class Palette {
            public Color Accent, Light, Background, Surface;
            public static Palette ForTheme(string name) {
                switch (name) {
                    case "amethyst": return Create("#a571ff","#d7b8ff","#0c0918");
                    case "cyan": return Create("#27c1e7","#a5eaff","#041017");
                    case "rose": return Create("#f17097","#ffbdd1","#160912");
                    case "emerald": return Create("#29c894","#a6f3d1","#05130f");
                    case "graphite": return Create("#9caac0","#e0e7f2","#0a0d13");
                    case "crimson": return Create("#ef5569","#ffb0bb","#16080c");
                    case "ocean": return Create("#4692f6","#a5ceff","#091323");
                    case "copper": return Create("#db9066","#f4c4a3","#17110f");
                    case "aurora": return Create("#66d3b8","#b4f6e7","#0c151b");
                    case "orchid": return Create("#cd89eb","#edc6ff","#150e1c");
                    case "solar": return Create("#e9ba53","#ffe0a1","#18140d");
                    default: return Create("#e9ba53","#ffe0a1","#18140d");
                }
            }
            private static Palette Create(string accent, string light, string background) {
                Color bg=ColorTranslator.FromHtml(background), ink=ColorTranslator.FromHtml(accent);
                return new Palette {Accent=ink,Light=ColorTranslator.FromHtml(light),Background=bg,Surface=Color.FromArgb((bg.R*7+ink.R)/8,(bg.G*7+ink.G)/8,(bg.B*7+ink.B)/8)};
            }
        }
        private sealed class ProgressWindow : Form {
            private readonly NotifyIcon notice = new NotifyIcon();
            private bool allowActivation;
            private Icon applicationIcon;
            protected override bool ShowWithoutActivation { get { return backgroundUpdate && !allowActivation; } }
            protected override CreateParams CreateParams {
                get { CreateParams value=base.CreateParams; if(backgroundUpdate && !allowActivation)value.ExStyle |= 0x08000000;return value; }
            }
            internal void ShowFailureNotice() {
                notice.BalloonTipTitle="PlazCode update failed";notice.BalloonTipText="Open PlazCode Updates to review the error and retry.";notice.ShowBalloonTip(5000);
            }
            private readonly System.Windows.Forms.Timer animation = new System.Windows.Forms.Timer();
            private readonly System.Diagnostics.Stopwatch clock = System.Diagnostics.Stopwatch.StartNew();
            private readonly Font brand = new Font("Segoe UI", 11, FontStyle.Bold);
            private readonly Font title = new Font("Segoe UI", 23, FontStyle.Bold);
            private readonly Font body = new Font("Segoe UI", 10);
            private readonly Font small = new Font("Segoe UI", 9);
            private float displayed;
            public ProgressWindow() {
                if (!String.IsNullOrEmpty(applicationIconPath) && System.IO.File.Exists(applicationIconPath)) {
                    // Clone before releasing the stream so installing the new icon never hits a file lock.
                    using (var stream = System.IO.File.OpenRead(applicationIconPath))
                    using (var loaded = new Icon(stream))
                    using (var native = Icon.FromHandle(loaded.Handle)) applicationIcon = (Icon)native.Clone();
                    Icon = applicationIcon;
                }
                Text = "Updating PlazCode"; ClientSize = new Size(560, 330);
                FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.CenterScreen;
                MaximizeBox = false; MinimizeBox = false; ControlBox = false;
                BackColor = colors.Background; DoubleBuffered = true; TopMost = false;
                if(backgroundUpdate) {
                    WindowState=FormWindowState.Minimized;
                    notice.Icon=applicationIcon ?? SystemIcons.Information;notice.Text="PlazCode is updating";notice.Visible=true;
                    notice.BalloonTipTitle="PlazCode update";notice.BalloonTipText="Installing v"+version+". PlazCode will restart in the background.";
                    Shown += delegate { notice.ShowBalloonTip(5000); };
                    notice.Click += delegate { allowActivation=true;UpdateStyles();WindowState=FormWindowState.Normal;Show();Activate(); };
                }
                SetStyle(ControlStyles.ResizeRedraw, true);
                using (GraphicsPath path = Rounded(new RectangleF(0, 0, 560, 330), 18)) { Region = new Region(path); }
                animation.Interval = 33;
                animation.Tick += delegate {
                    int target; bool close;
                    lock (Gate) { target = amount; close = closing; }
                    if (close) { animation.Stop(); Close(); return; }
                    if (target >= 0) displayed += (target - displayed) * 0.18f;
                    Invalidate();
                };
                animation.Start();
                MouseDown += delegate(object sender, MouseEventArgs e) {
                    if (e.Button == MouseButtons.Left && e.Y < 90 && Environment.OSVersion.Platform == PlatformID.Win32NT) {
                        ReleaseCapture(); SendMessage(Handle, 0xA1, new IntPtr(2), IntPtr.Zero);
                    }
                };
            }
            protected override void OnPaint(PaintEventArgs e) {
                base.OnPaint(e); Graphics g = e.Graphics;
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
                int percent; string heading, description, release;
                lock (Gate) { percent = amount; heading = phase; description = detail; release = version; }
                Color orange = colors.Accent, light = colors.Light;
                using (GraphicsPath shell = Rounded(new RectangleF(1, 1, 558, 328), 18))
                using (LinearGradientBrush bg = new LinearGradientBrush(new Rectangle(0, 0, 560, 330), gradients ? colors.Surface : colors.Background, colors.Background, 45f))
                using (Pen border = new Pen(Color.FromArgb(glow ? 100 : 65, orange))) { g.FillPath(bg, shell); g.DrawPath(border, shell); }
                using (SolidBrush muted = new SolidBrush(Color.FromArgb(159, 169, 184)))
                using (SolidBrush white = new SolidBrush(Color.FromArgb(242, 244, 248)))
                using (SolidBrush accent = new SolidBrush(light)) {
                    g.FillEllipse(accent, 32, 32, 8, 8);
                    g.DrawString("PLAZCODE", brand, accent, 49, 25);
                    using (StringFormat right = new StringFormat()) {
                        right.Alignment = StringAlignment.Far;
                        g.DrawString(release.Length > 0 ? "VERSION v" + release : "DESKTOP UPDATE", small, muted, new RectangleF(270, 26, 258, 24), right);
                    }
                    g.DrawString("Making things better.", title, white, 30, 67);
                    g.DrawString(heading, body, accent, 33, 125);
                    using (StringFormat wrap = new StringFormat()) {
                        wrap.Trimming = StringTrimming.EllipsisCharacter;
                        g.DrawString(description, body, muted, new RectangleF(33, 152, 470, 42), wrap);
                    }
                    RectangleF track = new RectangleF(33, 211, 494, 12);
                    using (GraphicsPath trackPath = Rounded(track, 6))
                    using (SolidBrush dark = new SolidBrush(colors.Surface)) { g.FillPath(dark, trackPath); }
                    float seconds = (float)clock.Elapsed.TotalSeconds;
                    float width = percent < 0 ? 130 : Math.Max(0, 494 * displayed / 100f);
                    float left = percent < 0 ? 33 + (float)((Math.Sin(seconds * 2) + 1) / 2) * (494 - width) : 33;
                    if (width > 1) {
                        RectangleF fill = new RectangleF(left, 211, width, 12);
                        using (GraphicsPath fillPath = Rounded(fill, Math.Min(6, width / 2)))
                        using (LinearGradientBrush progressBrush = new LinearGradientBrush(new RectangleF(left, 211, Math.Max(2, width), 12), orange, gradients ? light : orange, 0f)) {
                            g.FillPath(progressBrush, fillPath);
                            GraphicsState saved = g.Save(); g.SetClip(fillPath);
                            float shine = left + (seconds % 2f) / 2f * (width + 90) - 90;
                            if(glow && gradients) using (LinearGradientBrush shimmer = new LinearGradientBrush(new RectangleF(shine, 211, 90, 12), Color.Transparent, Color.FromArgb(130, Color.White), 0f)) { g.FillRectangle(shimmer, shine, 211, 90, 12); }
                            g.Restore(saved);
                        }
                    }
                    string state = percent < 0 ? "IN PROGRESS" : percent.ToString() + "% COMPLETE";
                    g.DrawString(state, small, muted, 33, 238);
                    using (Pen swirl = new Pen(orange, 2.3f)) { swirl.StartCap = LineCap.Round; swirl.EndCap = LineCap.Round; g.DrawArc(swirl, 509, 237, 15, 15, seconds * 210 % 360, 255); }
                    using (Pen divider = new Pen(Color.FromArgb(40, 49, 62))) { g.DrawLine(divider, 33, 276, 527, 276); }
                    g.DrawString("Your saved settings, memory and templates stay with you.", small, muted, 33, 289);
                }
            }
            private static GraphicsPath Rounded(RectangleF rectangle, float radius) {
                GraphicsPath path = new GraphicsPath(); float diameter = radius * 2;
                path.AddArc(rectangle.Left, rectangle.Top, diameter, diameter, 180, 90);
                path.AddArc(rectangle.Right - diameter, rectangle.Top, diameter, diameter, 270, 90);
                path.AddArc(rectangle.Right - diameter, rectangle.Bottom - diameter, diameter, diameter, 0, 90);
                path.AddArc(rectangle.Left, rectangle.Bottom - diameter, diameter, diameter, 90, 90);
                path.CloseFigure(); return path;
            }
            protected override void Dispose(bool disposing) {
                if (disposing) { notice.Dispose(); if(applicationIcon != null) applicationIcon.Dispose(); animation.Dispose(); brand.Dispose(); title.Dispose(); body.Dispose(); small.Dispose(); if (Region != null) Region.Dispose(); }
                base.Dispose(disposing);
            }
            [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern bool ReleaseCapture();
            [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr window, int message, IntPtr wparam, IntPtr lparam);
        }
    }
}
