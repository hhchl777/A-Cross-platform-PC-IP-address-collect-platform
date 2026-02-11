using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using Microsoft.UI.Dispatching;

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Windows.Foundation;
using Windows.Foundation.Collections;
using Windows.Graphics;
using Windows.Storage;
using Windows.Storage.Pickers;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace winclient
{
    /// <summary>
    /// An empty window that can be used on its own or navigated to within a Frame.
    /// </summary>
    public sealed partial class MainWindow : Window
    {
        private DispatcherTimer _timer;
        // 上报时间间隔选项
        public class ReportInterval
        {
            public string Display { get; set; }
            public int ValueInSeconds { get; set; }
        }
        public MainWindow()
        {
            this.InitializeComponent();

            IntPtr hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this); // Assuming 'this' is your Window instance

            var windowId = Win32Interop.GetWindowIdFromWindow(hwnd);

            AppWindow appWindow = AppWindow.GetFromWindowId(windowId);

            // Set the desired size using Resize()

            appWindow.Resize(new SizeInt32(800, 1170)); // Set width to 800 pixels and height to 600 pixels

            // 设置窗口图标
            this.AppWindow.SetIcon("Assets/icon.ico");

            // 初始化上报时间间隔下拉框
            InitializeReportIntervals();

            // 设置默认值（可选）
            SetDefaultValues();
        }

        private void InitializeReportIntervals()
        {
            var intervals = new List<ReportInterval>
            {
                new ReportInterval { Display = "每5秒", ValueInSeconds = 5 },
                new ReportInterval { Display = "每30秒", ValueInSeconds = 30 },
                new ReportInterval { Display = "每5分钟", ValueInSeconds = 300 },
                new ReportInterval { Display = "每30分钟", ValueInSeconds = 1800 },
                new ReportInterval { Display = "每小时", ValueInSeconds = 3600 }
            };

            ReportIntervalComboBox.ItemsSource = intervals;
            ReportIntervalComboBox.SelectedIndex = 3; // 默认选择每30秒
        }

        private void SetDefaultValues()
        {
            // 设置默认服务器地址
            ServerAddressTextBox.Text = "sserver.vanillapudding.link";

            // 设置默认用户名
            UsernameTextBox.Text = "";
        }
        public async Task<JsonDocument> PostLoginAsync(ConnectionConfig config)
        {
            using HttpClient client = new HttpClient();

            var data = new
            {
                email = config.Username,
                password = config.Password,
                devicename = config.DeviceName
            };

            string json = JsonSerializer.Serialize(data);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            HttpResponseMessage response =
                await client.PostAsync("https://" + config.ServerAddress + "/api/updatedevice", content);

            response.EnsureSuccessStatusCode();

            // 使用 JsonDocument 解析
            JsonDocument doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
            return doc;
        }

        private async void Timer_Tick(object sender, object e)
        {
            // 更新状态
            UpdateStatus("正在连接...", Colors.Blue);
            try
            {
                // 获取所有配置值
                var config = GetConnectionConfig();

                // 这里应该是实际的连接逻辑
                // bool success = await ConnectToServer(config);
                JsonDocument doc = await PostLoginAsync(config);
                int code = doc.RootElement.GetProperty("code").GetInt32();
                string message = "";
                if (code == 1)
                {
                    message = "用户名或密码错误";
                    ShowMessage("失败", message, "确定");
                }
                else if (code == 2)
                {
                    message = "当前IP被锁定，5分钟后再试";
                    ShowMessage("失败", message, "确定");
                }

                if (code == 0)
                {
                    UpdateStatus("连接成功", Colors.Green);
                }
            }
            catch (Exception ex)
            {
                ShowError("连接过程中出错", ex.Message);
                UpdateStatus("连接出错", Colors.Red);
            }
        }

        private void ConnectButton_Click(object sender, RoutedEventArgs e)
        {
            ConnectButton.IsEnabled = false;
            // 验证输入
            if (!ValidateInput())
            {
                return;
            }

            var interval = ReportIntervalComboBox.SelectedItem as ReportInterval;
            int ReportIntervalSeconds = interval?.ValueInSeconds ?? 30;

            _timer = new DispatcherTimer();
            _timer.Interval = TimeSpan.FromSeconds(ReportIntervalSeconds);
            _timer.Tick += Timer_Tick;
            _timer.Start();
        }

        private async void testconn()
        {
            try
            {
                // 获取所有配置值
                var config = GetConnectionConfig();

                // 这里应该是实际的连接逻辑
                // bool success = await ConnectToServer(config);
                JsonDocument doc = await PostLoginAsync(config);
                int code = doc.RootElement.GetProperty("code").GetInt32();
                string message = "";
                if (code == 1)
                {
                    message = "用户名或密码错误";
                    ShowMessage("失败", message, "确定");
                    UpdateStatus("连接出错", Colors.Red);
                }
                else if (code == 2)
                {
                    message = "当前IP被锁定，5分钟后再试";
                    ShowMessage("失败", message, "确定");
                    UpdateStatus("连接出错", Colors.Red);
                }
                else if (code == 474)
                {
                    message = "请禁用计算机IPv6后再试";
                    ShowMessage("失败", message, "确定");
                    UpdateStatus("连接出错", Colors.Red);
                }

                if (code == 0)
                {
                    UpdateStatus("连接成功", Colors.Green);
                }
            }
            catch (Exception ex)
            {
                ShowError("连接过程中出错", ex.Message);
                UpdateStatus("连接出错", Colors.Red);
            }
            finally
            {
                TestConnectionButton.IsEnabled = true;
            }
        }

        private void TestConnectionButton_Click(object sender, RoutedEventArgs e)
        {
            // 更新状态
            UpdateStatus("正在连接...", Colors.Blue);
            TestConnectionButton.IsEnabled = false;
            if (!ValidateInput())
            {
                return;
            }

            UpdateStatus("正在测试连接...", Colors.Blue);
            TestConnectionButton.IsEnabled = false;
            try
            {
                testconn();
            }
            catch (Exception ex)
            {
                ShowError("测试连接时出错", ex.Message);
                UpdateStatus("测试出错", Colors.Red);
            }
        }

        private bool ValidateInput()
        {
            // 验证服务器地址
            if (string.IsNullOrWhiteSpace(DevicenameTextBox.Text))
            {
                ShowMessage("验证错误", "请输入设备名称", "确定");
                ServerAddressTextBox.Focus(FocusState.Programmatic);
                return false;
            }

            // 验证服务器地址
            if (string.IsNullOrWhiteSpace(ServerAddressTextBox.Text))
            {
                ShowMessage("验证错误", "请输入服务器地址", "确定");
                ServerAddressTextBox.Focus(FocusState.Programmatic);
                return false;
            }

            // 验证用户名
            if (string.IsNullOrWhiteSpace(UsernameTextBox.Text))
            {
                ShowMessage("验证错误", "请输入用户名", "确定");
                UsernameTextBox.Focus(FocusState.Programmatic);
                return false;
            }

            // 验证提供密码
            if (string.IsNullOrEmpty(PasswordBox.Password))
            {
                ShowMessage("验证错误", "请提供密码", "确定");
                return false;
            }

            return true;
        }

        private ConnectionConfig GetConnectionConfig()
        {
            return new ConnectionConfig
            {
                DeviceName = DevicenameTextBox.Text,
                ServerAddress = ServerAddressTextBox.Text,
                Username = UsernameTextBox.Text,
                Password = PasswordBox.Password,
            };
        }

        private void UpdateStatus(string message, Windows.UI.Color color)
        {
            StatusTextBlock.Text = message;
            StatusTextBlock.Foreground = new SolidColorBrush(color);
        }

        private async void ShowMessage(string title, string message, string buttonText)
        {
            var dialog = new ContentDialog
            {
                Title = title,
                Content = message,
                CloseButtonText = buttonText,
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void ShowError(string title, string errorMessage)
        {
            var dialog = new ContentDialog
            {
                Title = title,
                Content = $"错误详情：{errorMessage}",
                CloseButtonText = "确定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }
    }

    // 配置类
    public class ConnectionConfig
    {
        public string DeviceName { get; set; }
        public string ServerAddress { get; set; }
        public string Username { get; set; }
        public string Password { get; set; }
    }
}
