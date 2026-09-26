using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace ChefCozinha.Sync
{
    public class SyncConfig
    {
        public string cloud_url { get; set; }
        public int local_port { get; set; }
        public int poll_interval_seconds { get; set; }
        public bool minimize_to_tray { get; set; }
        public bool auto_start { get; set; }

        // Dados de Ativação do Restaurante
        public bool is_activated { get; set; }
        public string activation_type { get; set; } // "key" ou "login"
        public string activation_key { get; set; }
        public string account_email { get; set; }
        public string restaurant_name { get; set; }
        public int restaurant_id { get; set; }
        public string activation_date { get; set; }
        public string instance_id { get; set; }

        public SyncConfig()
        {
            cloud_url = "https://hub.chefcozinha.com.br";
            local_port = 8080;
            poll_interval_seconds = 10;
            minimize_to_tray = true;
            auto_start = false;

            is_activated = false;
            activation_type = "";
            activation_key = "";
            account_email = "";
            restaurant_name = "";
            restaurant_id = 0;
            activation_date = "";
            instance_id = "";
        }
    }

    public class LocalStatusResponse
    {
        public bool success { get; set; }
        public bool online { get; set; }
        public string instanceId { get; set; }
        public int outboxPending { get; set; }
        public string deployMode { get; set; }
        public string version { get; set; }
        public string timestamp { get; set; }
    }

    public class ActivateResponse
    {
        public bool ok { get; set; }
        public bool success { get; set; }
        public int restaurant_id { get; set; }
        public string restaurant_name { get; set; }
        public string activation_key { get; set; }
        public string account_email { get; set; }
        public string plan { get; set; }
        public string instance_id { get; set; }
        public string message { get; set; }
        public string error { get; set; }
    }

    static class Program
    {
        private static Mutex appMutex = null;

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool syncNow = false;
            bool silent = false;

            foreach (var arg in args)
            {
                if (arg.Equals("--sync-now", StringComparison.OrdinalIgnoreCase)) syncNow = true;
                if (arg.Equals("--silent", StringComparison.OrdinalIgnoreCase) || arg.Equals("--minimized", StringComparison.OrdinalIgnoreCase)) silent = true;
            }

            // Garante uma única instância do Sync.exe
            bool createdNew;
            appMutex = new Mutex(true, "ChefCozinha_Sync_Agent_Mutex", out createdNew);
            if (!createdNew && !syncNow)
            {
                MessageBox.Show("O Sync Agent já está em execução no sistema.", "Chef Cozinha - Sync", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            if (syncNow)
            {
                ExecuteSyncNowCli();
                return;
            }

            Application.Run(new MainForm(silent));
        }

        private static void ExecuteSyncNowCli()
        {
            try
            {
                var config = ConfigManager.Load();
                string url = string.Format("http://127.0.0.1:{0}/api/sync/flush", config.local_port);
                using (var client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                    client.UploadString(url, "POST", "{}");
                }
                Environment.ExitCode = 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Erro ao sincronizar: " + ex.Message);
                Environment.ExitCode = 1;
            }
        }
    }

    public static class ConfigManager
    {
        private static string ConfigPath
        {
            get
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                return Path.Combine(baseDir, "sync_config.json");
            }
        }

        public static SyncConfig Load()
        {
            var config = new SyncConfig();
            try
            {
                // Detecta port.txt se existir no diretório base ou pai
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string portFile = Path.Combine(baseDir, "port.txt");
                if (!File.Exists(portFile))
                {
                    string parentPort = Path.Combine(Directory.GetParent(baseDir).FullName, "port.txt");
                    if (File.Exists(parentPort)) portFile = parentPort;
                }

                if (File.Exists(portFile))
                {
                    string portStr = File.ReadAllText(portFile).Trim();
                    int p;
                    if (int.TryParse(portStr, out p) && p > 0)
                    {
                        config.local_port = p;
                    }
                }

                if (File.Exists(ConfigPath))
                {
                    string json = File.ReadAllText(ConfigPath, Encoding.UTF8).Trim('\uFEFF', ' ', '\r', '\n');
                    var jss = new JavaScriptSerializer();
                    var loaded = jss.Deserialize<SyncConfig>(json);
                    if (loaded != null)
                    {
                        if (!string.IsNullOrEmpty(loaded.cloud_url)) config.cloud_url = loaded.cloud_url;
                        if (loaded.local_port > 0) config.local_port = loaded.local_port;
                        if (loaded.poll_interval_seconds > 0) config.poll_interval_seconds = loaded.poll_interval_seconds;
                        config.minimize_to_tray = loaded.minimize_to_tray;
                        config.auto_start = loaded.auto_start;

                        config.is_activated = loaded.is_activated;
                        config.activation_type = loaded.activation_type ?? "";
                        config.activation_key = loaded.activation_key ?? "";
                        config.account_email = loaded.account_email ?? "";
                        config.restaurant_name = loaded.restaurant_name ?? "";
                        config.restaurant_id = loaded.restaurant_id;
                        config.activation_date = loaded.activation_date ?? "";
                        config.instance_id = loaded.instance_id ?? "";
                    }
                }
                else
                {
                    Save(config);
                }
            }
            catch { }
            return config;
        }

        public static void Save(SyncConfig config)
        {
            try
            {
                var jss = new JavaScriptSerializer();
                string json = jss.Serialize(config);
                File.WriteAllText(ConfigPath, json, new UTF8Encoding(false));
            }
            catch { }
        }
    }

    public class MainForm : Form
    {
        private SyncConfig config;
        private System.Windows.Forms.Timer pollTimer;
        private NotifyIcon trayIcon;
        private ContextMenuStrip trayMenu;
        private bool isExiting = false;

        // UI Components
        private Label lblLocalStatus;
        private Label lblCloudStatus;
        private Label lblRestaurantStatus;
        private Label lblOutboxCount;
        private Label lblInstanceId;
        private Label lblSubtitle;
        private RichTextBox rtbLog;
        private Button btnActivate;
        private Button btnSyncNow;
        private Button btnOpenPdv;
        private Button btnSettings;
        private Button btnMinimize;
        private Label lblNextPoll;
        private int pollCountdown;

        public MainForm(bool startMinimized)
        {
            config = ConfigManager.Load();
            InitializeComponent();
            SetupTray();
            UpdateActivationUI();

            AppendLog("Sync Agent iniciado com sucesso (v1.0.0 Pro Offline-First).", Color.FromArgb(16, 185, 129));
            AppendLog("Servidor Local configurado na porta: " + config.local_port, Color.FromArgb(200, 200, 210));
            AppendLog("Hub Cloud configurado: " + config.cloud_url, Color.FromArgb(200, 200, 210));

            if (config.is_activated)
            {
                AppendLog(string.Format("Restaurante Ativado: {0} (ID #{1})", config.restaurant_name, config.restaurant_id), Color.FromArgb(16, 185, 129));
            }
            else
            {
                AppendLog("ATENÇÃO: Terminal ainda não ativado! Clique em 'Ativar Restaurante' para sincronizar com a nuvem.", Color.FromArgb(245, 158, 11));
            }

            pollCountdown = config.poll_interval_seconds;

            pollTimer = new System.Windows.Forms.Timer();
            pollTimer.Interval = 1000;
            pollTimer.Tick += PollTimer_Tick;
            pollTimer.Start();

            // Dispara verificação imediata
            PerformStatusCheck();

            if (startMinimized)
            {
                WindowState = FormWindowState.Minimized;
                ShowInTaskbar = false;
                Hide();
            }
            else if (!config.is_activated)
            {
                // Se não estiver ativado, abre automaticamente o diálogo de ativação
                this.Shown += (s, e) => OpenActivationDialog();
            }
        }

        private void InitializeComponent()
        {
            this.Text = "Chef Cozinha • Sync Agent (Offline-First)";
            this.Size = new Size(760, 580);
            this.MinimumSize = new Size(760, 580);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(20, 20, 24);
            this.ForeColor = Color.FromArgb(240, 240, 245);
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            // Carrega ícone se existir
            try
            {
                string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "installer", "icon.ico");
                if (!File.Exists(iconPath)) iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "icon.ico");
                if (File.Exists(iconPath)) this.Icon = new Icon(iconPath);
            }
            catch { }

            // Header Panel
            Panel pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 72,
                BackColor = Color.FromArgb(28, 28, 34),
                Padding = new Padding(20, 12, 20, 12)
            };

            Label lblTitle = new Label
            {
                Text = "CHEF COZINHA • SYNC AGENT",
                Font = new Font("Segoe UI", 13f, FontStyle.Bold),
                ForeColor = Color.FromArgb(252, 75, 21), // Laranja marca
                AutoSize = true,
                Location = new Point(20, 12)
            };

            lblSubtitle = new Label
            {
                Text = "Sincronizador Seguro On-Premise & Nuvem (Offline-First)",
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(160, 160, 175),
                AutoSize = true,
                Location = new Point(22, 38)
            };

            lblInstanceId = new Label
            {
                Text = "Instância: carregando...",
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(140, 140, 155),
                AutoSize = true,
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Location = new Point(500, 25)
            };

            pnlHeader.Controls.Add(lblTitle);
            pnlHeader.Controls.Add(lblSubtitle);
            pnlHeader.Controls.Add(lblInstanceId);
            this.Controls.Add(pnlHeader);

            // Dashboard Cards Container
            Panel pnlCards = new Panel
            {
                Dock = DockStyle.Top,
                Height = 105,
                BackColor = Color.FromArgb(20, 20, 24),
                Padding = new Padding(20, 10, 20, 10)
            };

            int cardWidth = 166;
            int cardGap = 12;

            // Card 1: Servidor Local
            Panel card1 = CreateCard("SERVIDOR LOCAL", 20, cardWidth);
            lblLocalStatus = new Label
            {
                Text = "Verificando...",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(234, 179, 8),
                Location = new Point(12, 38),
                AutoSize = true
            };
            card1.Controls.Add(lblLocalStatus);
            pnlCards.Controls.Add(card1);

            // Card 2: Nuvem / Hub
            Panel card2 = CreateCard("NUVEM / SYNC HUB", 20 + (cardWidth + cardGap), cardWidth);
            lblCloudStatus = new Label
            {
                Text = "Verificando...",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(234, 179, 8),
                Location = new Point(12, 38),
                AutoSize = true
            };
            card2.Controls.Add(lblCloudStatus);
            pnlCards.Controls.Add(card2);

            // Card 3: Restaurante / Ativação
            Panel card3 = CreateCard("RESTAURANTE", 20 + (cardWidth + cardGap) * 2, cardWidth);
            lblRestaurantStatus = new Label
            {
                Text = "Não Ativado",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(245, 158, 11),
                Location = new Point(12, 38),
                AutoSize = true
            };
            card3.Controls.Add(lblRestaurantStatus);
            pnlCards.Controls.Add(card3);

            // Card 4: Fila Outbox
            Panel card4 = CreateCard("FILA OUTBOX", 20 + (cardWidth + cardGap) * 3, cardWidth);
            lblOutboxCount = new Label
            {
                Text = "0 pendentes",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(16, 185, 129),
                Location = new Point(12, 38),
                AutoSize = true
            };
            card4.Controls.Add(lblOutboxCount);
            pnlCards.Controls.Add(card4);

            this.Controls.Add(pnlCards);

            // Action Buttons Panel
            Panel pnlActions = new Panel
            {
                Dock = DockStyle.Top,
                Height = 52,
                BackColor = Color.FromArgb(20, 20, 24),
                Padding = new Padding(20, 4, 20, 4)
            };

            btnActivate = CreateButton("🔑 Ativar Restaurante", Color.FromArgb(252, 75, 21), 20, 160);
            btnActivate.Click += (s, e) => OpenActivationDialog();

            btnSyncNow = CreateButton("⚡ Sincronizar", Color.FromArgb(39, 39, 42), 190, 125);
            btnSyncNow.Click += (s, e) => TriggerManualSync();

            btnOpenPdv = CreateButton("🌐 Abrir PDV", Color.FromArgb(39, 39, 42), 325, 125);
            btnOpenPdv.Click += (s, e) => OpenPdvInBrowser();

            btnSettings = CreateButton("⚙️ Configurações", Color.FromArgb(39, 39, 42), 460, 135);
            btnSettings.Click += (s, e) => OpenSettingsDialog();

            btnMinimize = CreateButton("⬇ Minimizar", Color.FromArgb(39, 39, 42), 605, 110);
            btnMinimize.Click += (s, e) => {
                this.WindowState = FormWindowState.Minimized;
                if (config.minimize_to_tray)
                {
                    this.Hide();
                    trayIcon.ShowBalloonTip(2000, "Chef Cozinha Sync", "O agente continua rodando em segundo plano.", ToolTipIcon.Info);
                }
            };

            pnlActions.Controls.Add(btnActivate);
            pnlActions.Controls.Add(btnSyncNow);
            pnlActions.Controls.Add(btnOpenPdv);
            pnlActions.Controls.Add(btnSettings);
            pnlActions.Controls.Add(btnMinimize);
            this.Controls.Add(pnlActions);

            // Bottom Status Bar
            Panel pnlBottom = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 32,
                BackColor = Color.FromArgb(28, 28, 34),
                Padding = new Padding(15, 6, 15, 6)
            };

            lblNextPoll = new Label
            {
                Text = "Próxima sincronização: 10s",
                Font = new Font("Segoe UI", 8.5f),
                ForeColor = Color.FromArgb(140, 140, 155),
                AutoSize = true,
                Location = new Point(15, 7)
            };

            Label lblVersion = new Label
            {
                Text = "Chef Cozinha Sync Engine v1.0.0 • 100% Seguro Offline-First",
                Font = new Font("Segoe UI", 8.5f),
                ForeColor = Color.FromArgb(110, 110, 125),
                Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
                AutoSize = true,
                Location = new Point(380, 7)
            };

            pnlBottom.Controls.Add(lblNextPoll);
            pnlBottom.Controls.Add(lblVersion);
            this.Controls.Add(pnlBottom);

            // Center Log Panel
            Panel pnlLogContainer = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(20, 8, 20, 8),
                BackColor = Color.FromArgb(20, 20, 24)
            };

            Label lblLogTitle = new Label
            {
                Text = "REGISTRO DE ATIVIDADES EM TEMPO REAL",
                Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(140, 140, 155),
                Dock = DockStyle.Top,
                Height = 22
            };

            rtbLog = new RichTextBox
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(14, 14, 17),
                ForeColor = Color.FromArgb(220, 220, 230),
                BorderStyle = BorderStyle.None,
                Font = new Font("Consolas", 9.2f),
                ReadOnly = true
            };

            pnlLogContainer.Controls.Add(rtbLog);
            pnlLogContainer.Controls.Add(lblLogTitle);
            this.Controls.Add(pnlLogContainer);

            // Handle minimize and close events
            this.FormClosing += MainForm_FormClosing;
            this.Resize += MainForm_Resize;
        }

        private void UpdateActivationUI()
        {
            if (config.is_activated)
            {
                lblSubtitle.Text = string.Format("Restaurante: {0} • ID #{1} (Ativado com Sucesso)", config.restaurant_name, config.restaurant_id);
                lblSubtitle.ForeColor = Color.FromArgb(16, 185, 129);

                lblRestaurantStatus.Text = config.restaurant_name;
                lblRestaurantStatus.ForeColor = Color.FromArgb(16, 185, 129);

                btnActivate.Text = "🔑 Conectado";
                btnActivate.BackColor = Color.FromArgb(16, 185, 129);
            }
            else
            {
                lblSubtitle.Text = "⚠️ Não Ativado — Insira a chave de ativação ou faça login para conectar.";
                lblSubtitle.ForeColor = Color.FromArgb(245, 158, 11);

                lblRestaurantStatus.Text = "PENDENTE";
                lblRestaurantStatus.ForeColor = Color.FromArgb(245, 158, 11);

                btnActivate.Text = "🔑 Ativar Restaurante";
                btnActivate.BackColor = Color.FromArgb(252, 75, 21);
            }
        }

        private Panel CreateCard(string title, int x, int width)
        {
            Panel card = new Panel
            {
                Location = new Point(x, 8),
                Size = new Size(width, 82),
                BackColor = Color.FromArgb(28, 28, 34),
                BorderStyle = BorderStyle.FixedSingle
            };

            Label lblTitle = new Label
            {
                Text = title,
                Font = new Font("Segoe UI", 7.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(140, 140, 155),
                Location = new Point(10, 10),
                AutoSize = true
            };

            card.Controls.Add(lblTitle);
            return card;
        }

        private Button CreateButton(string text, Color backColor, int x, int width)
        {
            Button btn = new Button
            {
                Text = text,
                Location = new Point(x, 6),
                Size = new Size(width, 38),
                BackColor = backColor,
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                Cursor = Cursors.Hand
            };
            btn.FlatAppearance.BorderSize = 0;
            return btn;
        }

        private void SetupTray()
        {
            trayMenu = new ContextMenuStrip();
            trayMenu.Items.Add("Abrir Painel", null, (s, e) => RestoreWindow());
            trayMenu.Items.Add("Ativar / Conectar Restaurante", null, (s, e) => OpenActivationDialog());
            trayMenu.Items.Add("Sincronizar Agora", null, (s, e) => TriggerManualSync());
            trayMenu.Items.Add("Abrir PDV no Navegador", null, (s, e) => OpenPdvInBrowser());
            trayMenu.Items.Add("-");
            trayMenu.Items.Add("Sair do Sync Agent", null, (s, e) => {
                isExiting = true;
                Application.Exit();
            });

            trayIcon = new NotifyIcon
            {
                Text = "Chef Cozinha - Sync Agent",
                Visible = true,
                ContextMenuStrip = trayMenu
            };

            if (this.Icon != null)
            {
                trayIcon.Icon = this.Icon;
            }
            else
            {
                trayIcon.Icon = SystemIcons.Application;
            }

            trayIcon.DoubleClick += (s, e) => RestoreWindow();
        }

        private void RestoreWindow()
        {
            this.Show();
            this.WindowState = FormWindowState.Normal;
            this.BringToFront();
            this.Focus();
        }

        private void MainForm_Resize(object sender, EventArgs e)
        {
            if (this.WindowState == FormWindowState.Minimized && config.minimize_to_tray)
            {
                this.Hide();
            }
        }

        private void MainForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            if (!isExiting && config.minimize_to_tray && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                this.WindowState = FormWindowState.Minimized;
                this.Hide();
                trayIcon.ShowBalloonTip(1500, "Chef Cozinha Sync", "Agente minimizado na bandeja do sistema.", ToolTipIcon.Info);
            }
            else
            {
                if (trayIcon != null)
                {
                    trayIcon.Visible = false;
                    trayIcon.Dispose();
                }
            }
        }

        private void PollTimer_Tick(object sender, EventArgs e)
        {
            pollCountdown--;
            if (pollCountdown <= 0)
            {
                pollCountdown = config.poll_interval_seconds;
                PerformStatusCheck();
            }
            lblNextPoll.Text = string.Format("Próxima verificação em: {0}s", pollCountdown);
        }

        private void PerformStatusCheck()
        {
            ThreadPool.QueueUserWorkItem((state) =>
            {
                CheckLocalStatus();
                CheckCloudStatus();
            });
        }

        private void CheckLocalStatus()
        {
            string url = string.Format("http://127.0.0.1:{0}/api/sync/status", config.local_port);
            try
            {
                using (var client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                    client.Encoding = Encoding.UTF8;
                    string res = client.DownloadString(url);

                    var jss = new JavaScriptSerializer();
                    var status = jss.Deserialize<LocalStatusResponse>(res);

                    this.Invoke((MethodInvoker)delegate
                    {
                        if (status != null && status.success)
                        {
                            lblLocalStatus.Text = "ONLINE (:" + config.local_port + ")";
                            lblLocalStatus.ForeColor = Color.FromArgb(16, 185, 129);

                            if (status.outboxPending > 0)
                            {
                                lblOutboxCount.Text = status.outboxPending + " pendente(s)";
                                lblOutboxCount.ForeColor = Color.FromArgb(234, 179, 8);
                            }
                            else
                            {
                                lblOutboxCount.Text = "0 pendentes";
                                lblOutboxCount.ForeColor = Color.FromArgb(16, 185, 129);
                            }

                            lblInstanceId.Text = "Instância: " + (status.instanceId ?? "local");
                        }
                        else
                        {
                            lblLocalStatus.Text = "INVÁLIDO";
                            lblLocalStatus.ForeColor = Color.FromArgb(239, 68, 68);
                        }
                    });
                }
            }
            catch (Exception)
            {
                this.Invoke((MethodInvoker)delegate
                {
                    lblLocalStatus.Text = "OFFLINE";
                    lblLocalStatus.ForeColor = Color.FromArgb(239, 68, 68);
                });
            }
        }

        private void CheckCloudStatus()
        {
            if (string.IsNullOrEmpty(config.cloud_url)) return;

            string pingUrl = config.cloud_url.TrimEnd('/') + "/api/sync/poll?instance_id=" + (config.instance_id ?? "test");
            var sw = Stopwatch.StartNew();
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(pingUrl);
                req.Timeout = 5000;
                req.Method = "GET";
                using (var resp = (HttpWebResponse)req.GetResponse())
                {
                    sw.Stop();
                    long latency = sw.ElapsedMilliseconds;

                    this.Invoke((MethodInvoker)delegate
                    {
                        lblCloudStatus.Text = string.Format("CONECTADO ({0}ms)", latency);
                        lblCloudStatus.ForeColor = Color.FromArgb(16, 185, 129);
                    });
                }
            }
            catch (WebException wex)
            {
                sw.Stop();
                // Se o servidor respondeu (mesmo 400 ou 401), a nuvem está acessível
                if (wex.Response != null)
                {
                    this.Invoke((MethodInvoker)delegate
                    {
                        lblCloudStatus.Text = string.Format("CONECTADO ({0}ms)", sw.ElapsedMilliseconds);
                        lblCloudStatus.ForeColor = Color.FromArgb(16, 185, 129);
                    });
                }
                else
                {
                    this.Invoke((MethodInvoker)delegate
                    {
                        lblCloudStatus.Text = "DESCONECTADO";
                        lblCloudStatus.ForeColor = Color.FromArgb(239, 68, 68);
                    });
                }
            }
            catch
            {
                this.Invoke((MethodInvoker)delegate
                {
                    lblCloudStatus.Text = "SEM CONEXÃO";
                    lblCloudStatus.ForeColor = Color.FromArgb(239, 68, 68);
                });
            }
        }

        private void TriggerManualSync()
        {
            btnSyncNow.Enabled = false;
            AppendLog("Disparando sincronização manual com o servidor...", Color.FromArgb(234, 179, 8));

            ThreadPool.QueueUserWorkItem((state) =>
            {
                string url = string.Format("http://127.0.0.1:{0}/api/sync/flush", config.local_port);
                try
                {
                    using (var client = new WebClient())
                    {
                        client.Headers[HttpRequestHeader.ContentType] = "application/json";
                        client.UploadString(url, "POST", "{}");
                    }

                    this.Invoke((MethodInvoker)delegate
                    {
                        AppendLog("Comando de sincronização executado com sucesso!", Color.FromArgb(16, 185, 129));
                        btnSyncNow.Enabled = true;
                        pollCountdown = 1; // dispara verificação em 1s
                    });
                }
                catch (Exception ex)
                {
                    this.Invoke((MethodInvoker)delegate
                    {
                        AppendLog("Falha ao comunicar com o servidor local: " + ex.Message, Color.FromArgb(239, 68, 68));
                        btnSyncNow.Enabled = true;
                    });
                }
            });
        }

        private void OpenPdvInBrowser()
        {
            try
            {
                string url = string.Format("http://localhost:{0}", config.local_port);
                Process.Start(url);
                AppendLog("Abrindo PDV no navegador: " + url, Color.FromArgb(140, 140, 155));
            }
            catch (Exception ex)
            {
                AppendLog("Erro ao abrir navegador: " + ex.Message, Color.FromArgb(239, 68, 68));
            }
        }

        private void OpenActivationDialog()
        {
            using (var dlg = new ActivationForm(config))
            {
                if (dlg.ShowDialog(this) == DialogResult.OK)
                {
                    // Recarrega configuração e atualiza interface
                    config = ConfigManager.Load();
                    UpdateActivationUI();
                    AppendLog(string.Format("Restaurante vinculado com sucesso: {0} (ID #{1})", config.restaurant_name, config.restaurant_id), Color.FromArgb(16, 185, 129));
                    trayIcon.ShowBalloonTip(2000, "Chef Cozinha Sync", "Restaurante ativado com sucesso!", ToolTipIcon.Info);
                    TriggerManualSync();
                }
            }
        }

        private void OpenSettingsDialog()
        {
            using (Form dlg = new Form())
            {
                dlg.Text = "Configurações de Sincronização";
                dlg.Size = new Size(460, 310);
                dlg.StartPosition = FormStartPosition.CenterParent;
                dlg.FormBorderStyle = FormBorderStyle.FixedDialog;
                dlg.MaximizeBox = false;
                dlg.MinimizeBox = false;
                dlg.BackColor = Color.FromArgb(24, 24, 28);
                dlg.ForeColor = Color.FromArgb(240, 240, 245);
                dlg.Font = new Font("Segoe UI", 9.5f);

                Label lblPort = new Label { Text = "Porta do Servidor Local:", Location = new Point(25, 20), AutoSize = true };
                TextBox txtPort = new TextBox { Text = config.local_port.ToString(), Location = new Point(25, 45), Width = 390, BackColor = Color.FromArgb(38, 38, 44), ForeColor = Color.White };

                Label lblCloud = new Label { Text = "URL do Servidor Central / Nuvem (Hub):", Location = new Point(25, 80), AutoSize = true };
                TextBox txtCloud = new TextBox { Text = config.cloud_url, Location = new Point(25, 105), Width = 390, BackColor = Color.FromArgb(38, 38, 44), ForeColor = Color.White };

                Label lblInterval = new Label { Text = "Intervalo de Verificação (segundos):", Location = new Point(25, 140), AutoSize = true };
                TextBox txtInterval = new TextBox { Text = config.poll_interval_seconds.ToString(), Location = new Point(25, 165), Width = 120, BackColor = Color.FromArgb(38, 38, 44), ForeColor = Color.White };

                CheckBox chkTray = new CheckBox { Text = "Minimizar para bandeja ao fechar", Checked = config.minimize_to_tray, Location = new Point(170, 165), AutoSize = true };

                Button btnSave = new Button { Text = "Salvar", Location = new Point(220, 215), Width = 90, Height = 34, BackColor = Color.FromArgb(252, 75, 21), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
                Button btnCancel = new Button { Text = "Cancelar", Location = new Point(325, 215), Width = 90, Height = 34, BackColor = Color.FromArgb(45, 45, 52), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };

                btnSave.Click += (s, e) =>
                {
                    int p, inv;
                    if (int.TryParse(txtPort.Text.Trim(), out p) && p > 0) config.local_port = p;
                    config.cloud_url = txtCloud.Text.Trim();
                    if (int.TryParse(txtInterval.Text.Trim(), out inv) && inv > 2) config.poll_interval_seconds = inv;
                    config.minimize_to_tray = chkTray.Checked;

                    ConfigManager.Save(config);
                    AppendLog("Configurações atualizadas e salvas.", Color.FromArgb(16, 185, 129));
                    dlg.Close();
                    PerformStatusCheck();
                };

                btnCancel.Click += (s, e) => dlg.Close();

                dlg.Controls.Add(lblPort);
                dlg.Controls.Add(txtPort);
                dlg.Controls.Add(lblCloud);
                dlg.Controls.Add(txtCloud);
                dlg.Controls.Add(lblInterval);
                dlg.Controls.Add(txtInterval);
                dlg.Controls.Add(chkTray);
                dlg.Controls.Add(btnSave);
                dlg.Controls.Add(btnCancel);

                dlg.ShowDialog(this);
            }
        }

        private void AppendLog(string message, Color color)
        {
            if (rtbLog.IsDisposed) return;
            string time = DateTime.Now.ToString("HH:mm:ss");
            string line = string.Format("[{0}] {1}\n", time, message);

            rtbLog.SelectionStart = rtbLog.TextLength;
            rtbLog.SelectionLength = 0;
            rtbLog.SelectionColor = color;
            rtbLog.AppendText(line);
            rtbLog.SelectionColor = rtbLog.ForeColor;
            rtbLog.ScrollToCaret();
        }
    }

    /// <summary>
    /// Diálogo para ativar o restaurante via Chave de Ativação OU Login e Senha
    /// </summary>
    public class ActivationForm : Form
    {
        private SyncConfig config;
        private bool isKeyMode = true;

        private Button btnTabKey;
        private Button btnTabLogin;
        private Panel pnlKeyContent;
        private Panel pnlLoginContent;

        private TextBox txtKey;
        private TextBox txtEmail;
        private TextBox txtPassword;
        private Label lblFeedback;
        private Button btnSubmit;
        private Button btnDisconnect;

        public ActivationForm(SyncConfig cfg)
        {
            this.config = cfg;
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "Ativação do Restaurante • Chef Cozinha Sync";
            this.Size = new Size(540, 470);
            this.MinimumSize = new Size(540, 470);
            this.StartPosition = FormStartPosition.CenterParent;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.BackColor = Color.FromArgb(20, 20, 24);
            this.ForeColor = Color.FromArgb(240, 240, 245);
            this.Font = new Font("Segoe UI", 9.5f);

            // Header Panel
            Panel pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 65,
                BackColor = Color.FromArgb(28, 28, 34),
                Padding = new Padding(20, 10, 20, 10)
            };

            Label lblTitle = new Label
            {
                Text = "CONECTAR RESTAURANTE AO SYNC",
                Font = new Font("Segoe UI", 11.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(252, 75, 21),
                Location = new Point(20, 10),
                AutoSize = true
            };

            Label lblSubtitle = new Label
            {
                Text = "Escolha como deseja autenticar seu restaurante para ativar a sincronização:",
                Font = new Font("Segoe UI", 8.5f),
                ForeColor = Color.FromArgb(160, 160, 175),
                Location = new Point(21, 34),
                AutoSize = true
            };

            pnlHeader.Controls.Add(lblTitle);
            pnlHeader.Controls.Add(lblSubtitle);
            this.Controls.Add(pnlHeader);

            // Tab Selector
            Panel pnlTabs = new Panel
            {
                Dock = DockStyle.Top,
                Height = 46,
                BackColor = Color.FromArgb(24, 24, 28),
                Padding = new Padding(20, 4, 20, 4)
            };

            btnTabKey = new Button
            {
                Text = "🔑 Usar Chave de Ativação",
                Location = new Point(20, 6),
                Size = new Size(240, 34),
                BackColor = Color.FromArgb(252, 75, 21),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                Cursor = Cursors.Hand
            };
            btnTabKey.FlatAppearance.BorderSize = 0;
            btnTabKey.Click += (s, e) => SwitchTab(true);

            btnTabLogin = new Button
            {
                Text = "👤 Usar Login e Senha",
                Location = new Point(270, 6),
                Size = new Size(230, 34),
                BackColor = Color.FromArgb(39, 39, 44),
                ForeColor = Color.FromArgb(200, 200, 215),
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                Cursor = Cursors.Hand
            };
            btnTabLogin.FlatAppearance.BorderSize = 0;
            btnTabLogin.Click += (s, e) => SwitchTab(false);

            pnlTabs.Controls.Add(btnTabKey);
            pnlTabs.Controls.Add(btnTabLogin);
            this.Controls.Add(pnlTabs);

            // Painel Conteúdo: Chave
            pnlKeyContent = new Panel
            {
                Location = new Point(20, 120),
                Size = new Size(485, 170),
                BackColor = Color.FromArgb(24, 24, 28)
            };

            Label lblKeyPrompt = new Label
            {
                Text = "Chave de Ativação do Restaurante:",
                Location = new Point(10, 15),
                AutoSize = true,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold)
            };

            txtKey = new TextBox
            {
                Location = new Point(12, 42),
                Width = 460,
                Font = new Font("Consolas", 12f, FontStyle.Bold),
                BackColor = Color.FromArgb(38, 38, 44),
                ForeColor = Color.FromArgb(252, 75, 21),
                Text = config.activation_key ?? ""
            };
            txtKey.CharacterCasing = CharacterCasing.Upper;

            Label lblKeyHint = new Label
            {
                Text = "A chave de ativação foi emitida pelo suporte ou gerada no painel Super Admin.\nExemplo: CHEF-LOCAL-0001 ou CHEF-ABCD-1234",
                Location = new Point(12, 80),
                Size = new Size(460, 40),
                ForeColor = Color.FromArgb(140, 140, 155),
                Font = new Font("Segoe UI", 8.5f)
            };

            pnlKeyContent.Controls.Add(lblKeyPrompt);
            pnlKeyContent.Controls.Add(txtKey);
            pnlKeyContent.Controls.Add(lblKeyHint);
            this.Controls.Add(pnlKeyContent);

            // Painel Conteúdo: Login
            pnlLoginContent = new Panel
            {
                Location = new Point(20, 120),
                Size = new Size(485, 170),
                BackColor = Color.FromArgb(24, 24, 28),
                Visible = false
            };

            Label lblEmailPrompt = new Label
            {
                Text = "E-mail ou Usuário do Restaurante:",
                Location = new Point(10, 10),
                AutoSize = true,
                Font = new Font("Segoe UI", 9f, FontStyle.Bold)
            };

            txtEmail = new TextBox
            {
                Location = new Point(12, 32),
                Width = 460,
                BackColor = Color.FromArgb(38, 38, 44),
                ForeColor = Color.White,
                Text = config.account_email ?? ""
            };

            Label lblPassPrompt = new Label
            {
                Text = "Senha do Administrador:",
                Location = new Point(10, 68),
                AutoSize = true,
                Font = new Font("Segoe UI", 9f, FontStyle.Bold)
            };

            txtPassword = new TextBox
            {
                Location = new Point(12, 90),
                Width = 460,
                UseSystemPasswordChar = true,
                BackColor = Color.FromArgb(38, 38, 44),
                ForeColor = Color.White
            };

            Label lblLoginHint = new Label
            {
                Text = "Utilize o mesmo e-mail e senha cadastrados no sistema do seu restaurante.",
                Location = new Point(12, 128),
                AutoSize = true,
                ForeColor = Color.FromArgb(140, 140, 155),
                Font = new Font("Segoe UI", 8.5f)
            };

            pnlLoginContent.Controls.Add(lblEmailPrompt);
            pnlLoginContent.Controls.Add(txtEmail);
            pnlLoginContent.Controls.Add(lblPassPrompt);
            pnlLoginContent.Controls.Add(txtPassword);
            pnlLoginContent.Controls.Add(lblLoginHint);
            this.Controls.Add(pnlLoginContent);

            // Feedback Label
            lblFeedback = new Label
            {
                Location = new Point(20, 305),
                Size = new Size(485, 45),
                ForeColor = Color.FromArgb(200, 200, 210),
                Font = new Font("Segoe UI", 9f),
                TextAlign = ContentAlignment.MiddleCenter,
                Text = config.is_activated
                    ? string.Format("Atualmente vinculado a: {0} (ID #{1})", config.restaurant_name, config.restaurant_id)
                    : "Preencha a chave ou login acima e clique em Conectar."
            };
            this.Controls.Add(lblFeedback);

            // Bottom Buttons Panel
            Panel pnlBottom = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 65,
                BackColor = Color.FromArgb(28, 28, 34),
                Padding = new Padding(20, 12, 20, 12)
            };

            btnSubmit = new Button
            {
                Text = "CONECTAR E ATIVAR SYNC",
                Location = new Point(20, 12),
                Size = new Size(260, 40),
                BackColor = Color.FromArgb(252, 75, 21),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 10f, FontStyle.Bold),
                Cursor = Cursors.Hand
            };
            btnSubmit.FlatAppearance.BorderSize = 0;
            btnSubmit.Click += (s, e) => ExecuteActivation();

            Button btnCancel = new Button
            {
                Text = "Fechar",
                Location = new Point(400, 12),
                Size = new Size(100, 40),
                BackColor = Color.FromArgb(45, 45, 52),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9.5f),
                Cursor = Cursors.Hand
            };
            btnCancel.FlatAppearance.BorderSize = 0;
            btnCancel.Click += (s, e) => this.Close();

            if (config.is_activated)
            {
                btnDisconnect = new Button
                {
                    Text = "Desconectar",
                    Location = new Point(290, 12),
                    Size = new Size(105, 40),
                    BackColor = Color.FromArgb(127, 29, 29),
                    ForeColor = Color.White,
                    FlatStyle = FlatStyle.Flat,
                    Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                    Cursor = Cursors.Hand
                };
                btnDisconnect.FlatAppearance.BorderSize = 0;
                btnDisconnect.Click += (s, e) => ExecuteDisconnect();
                pnlBottom.Controls.Add(btnDisconnect);
            }

            pnlBottom.Controls.Add(btnSubmit);
            pnlBottom.Controls.Add(btnCancel);
            this.Controls.Add(pnlBottom);
        }

        private void SwitchTab(bool useKey)
        {
            isKeyMode = useKey;
            if (useKey)
            {
                btnTabKey.BackColor = Color.FromArgb(252, 75, 21);
                btnTabKey.ForeColor = Color.White;
                btnTabLogin.BackColor = Color.FromArgb(39, 39, 44);
                btnTabLogin.ForeColor = Color.FromArgb(200, 200, 215);
                pnlKeyContent.Visible = true;
                pnlLoginContent.Visible = false;
                txtKey.Focus();
            }
            else
            {
                btnTabLogin.BackColor = Color.FromArgb(252, 75, 21);
                btnTabLogin.ForeColor = Color.White;
                btnTabKey.BackColor = Color.FromArgb(39, 39, 44);
                btnTabKey.ForeColor = Color.FromArgb(200, 200, 215);
                pnlLoginContent.Visible = true;
                pnlKeyContent.Visible = false;
                txtEmail.Focus();
            }
        }

        private void ExecuteActivation()
        {
            string key = txtKey.Text.Trim();
            string email = txtEmail.Text.Trim();
            string pass = txtPassword.Text;

            if (isKeyMode && string.IsNullOrEmpty(key))
            {
                lblFeedback.Text = "Por favor, informe a Chave de Ativação.";
                lblFeedback.ForeColor = Color.FromArgb(239, 68, 68);
                txtKey.Focus();
                return;
            }

            if (!isKeyMode && (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(pass)))
            {
                lblFeedback.Text = "Por favor, preencha o e-mail e a senha.";
                lblFeedback.ForeColor = Color.FromArgb(239, 68, 68);
                return;
            }

            btnSubmit.Enabled = false;
            lblFeedback.Text = "Conectando ao servidor e validando ativação...";
            lblFeedback.ForeColor = Color.FromArgb(234, 179, 8);

            ThreadPool.QueueUserWorkItem((state) =>
            {
                var jss = new JavaScriptSerializer();
                var payloadDict = new Dictionary<string, object>();
                payloadDict["type"] = isKeyMode ? "key" : "login";
                if (isKeyMode)
                {
                    payloadDict["chave_ativacao"] = key;
                }
                else
                {
                    payloadDict["email"] = email;
                    payloadDict["senha"] = pass;
                }
                payloadDict["instance_id"] = string.IsNullOrEmpty(config.instance_id) ? ("inst_" + Guid.NewGuid().ToString("N").Substring(0, 10)) : config.instance_id;
                payloadDict["hostname"] = Environment.MachineName;

                string jsonPayload = jss.Serialize(payloadDict);
                string hubUrl = (config.cloud_url ?? "").TrimEnd('/') + "/api/sync/activate";
                string localUrl = string.Format("http://127.0.0.1:{0}/api/sync/activate", config.local_port);

                ActivateResponse result = null;
                string errorMsg = null;

                // 1. Tenta validar no Hub Cloud
                try
                {
                    using (var client = new WebClient())
                    {
                        client.Headers[HttpRequestHeader.ContentType] = "application/json";
                        client.Encoding = Encoding.UTF8;
                        string res = client.UploadString(hubUrl, "POST", jsonPayload);
                        result = jss.Deserialize<ActivateResponse>(res);
                    }
                }
                catch (WebException wex)
                {
                    if (wex.Response != null)
                    {
                        try
                        {
                            using (var stream = wex.Response.GetResponseStream())
                            using (var reader = new StreamReader(stream, Encoding.UTF8))
                            {
                                string errRes = reader.ReadToEnd();
                                var errObj = jss.Deserialize<ActivateResponse>(errRes);
                                if (errObj != null && !string.IsNullOrEmpty(errObj.error))
                                {
                                    errorMsg = errObj.error;
                                }
                            }
                        }
                        catch { }
                    }
                }
                catch (Exception ex)
                {
                    errorMsg = ex.Message;
                }

                // 2. Se falhou na nuvem por falta de conexão, tenta validar no servidor local
                if ((result == null || (!result.ok && !result.success)) && errorMsg == null)
                {
                    try
                    {
                        using (var client = new WebClient())
                        {
                            client.Headers[HttpRequestHeader.ContentType] = "application/json";
                            client.Encoding = Encoding.UTF8;
                            string res = client.UploadString(localUrl, "POST", jsonPayload);
                            result = jss.Deserialize<ActivateResponse>(res);
                        }
                    }
                    catch { }
                }

                this.Invoke((MethodInvoker)delegate
                {
                    btnSubmit.Enabled = true;

                    if (result != null && (result.ok || result.success))
                    {
                        config.is_activated = true;
                        config.activation_type = isKeyMode ? "key" : "login";
                        config.activation_key = result.activation_key ?? (isKeyMode ? key : "");
                        config.account_email = isKeyMode ? "" : email;
                        config.restaurant_name = result.restaurant_name ?? "Restaurante";
                        config.restaurant_id = result.restaurant_id;
                        config.activation_date = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                        if (!string.IsNullOrEmpty(result.instance_id)) config.instance_id = result.instance_id;

                        ConfigManager.Save(config);

                        // Notifica servidor local em background
                        ThreadPool.QueueUserWorkItem((s2) =>
                        {
                            try
                            {
                                string notifyUrl = string.Format("http://127.0.0.1:{0}/api/sync/activate-local", config.local_port);
                                using (var c = new WebClient())
                                {
                                    c.Headers[HttpRequestHeader.ContentType] = "application/json";
                                    c.UploadString(notifyUrl, "POST", jss.Serialize(result));
                                }
                            }
                            catch { }
                        });

                        lblFeedback.Text = "Sucesso: " + (result.message ?? "Restaurante ativado!");
                        lblFeedback.ForeColor = Color.FromArgb(16, 185, 129);

                        MessageBox.Show(
                            string.Format("Restaurante ativado com sucesso!\n\nRestaurante: {0}\nCódigo/ID: #{1}\nChave: {2}", config.restaurant_name, config.restaurant_id, config.activation_key),
                            "Chef Cozinha Sync • Ativação Concluída",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information
                        );

                        this.DialogResult = DialogResult.OK;
                        this.Close();
                    }
                    else
                    {
                        string msg = errorMsg ?? (result != null && !string.IsNullOrEmpty(result.error) ? result.error : "Falha na ativação. Verifique os dados ou a conexão com a nuvem.");
                        lblFeedback.Text = "Erro: " + msg;
                        lblFeedback.ForeColor = Color.FromArgb(239, 68, 68);
                    }
                });
            });
        }

        private void ExecuteDisconnect()
        {
            var r = MessageBox.Show(
                "Deseja realmente desconectar este restaurante do Sync?\nO terminal deixará de sincronizar até que uma nova chave ou login seja inserido.",
                "Desconectar Restaurante",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            if (r == DialogResult.Yes)
            {
                config.is_activated = false;
                config.activation_key = "";
                config.account_email = "";
                config.restaurant_name = "";
                config.restaurant_id = 0;
                config.activation_date = "";
                ConfigManager.Save(config);

                MessageBox.Show("Restaurante desconectado com sucesso.", "Chef Cozinha Sync", MessageBoxButtons.OK, MessageBoxIcon.Information);
                this.DialogResult = DialogResult.OK;
                this.Close();
            }
        }
    }
}
