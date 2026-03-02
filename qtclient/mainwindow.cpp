#include "mainwindow.h"
#include "./ui_mainwindow.h"
#include <QMessageBox>
#include <QNetworkAccessManager>
#include <QNetworkRequest>
#include <QNetworkReply>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTimer>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
    , ui(new Ui::MainWindow)
{
    ui->setupUi(this);
    SetDefaultValues();
    UpdateStatus("就绪", Qt::gray);
    ui->reportIntervalComboBox->addItem("每5秒", 5);
    ui->reportIntervalComboBox->addItem("每30秒", 30);
    ui->reportIntervalComboBox->addItem("每5分钟", 300);
    ui->reportIntervalComboBox->addItem("每30分钟", 1800);
    ui->reportIntervalComboBox->addItem("每小时", 3600);
}

MainWindow::~MainWindow()
{
    delete ui;
}

void MainWindow::SetDefaultValues()
{
    // 设置默认服务器地址
    ui->serverAddressTextBox->setText("192.168.113.139");

    // 设置默认用户名
    ui->usernameTextBox->setText("test@test.com");
}

void MainWindow::UpdateStatus(QString message, QColor color)
{
    ui->statusLabel->setText(message);
    ui->statusLabel->setStyleSheet("color:" + color.name());
}

void MainWindow::showMessage(const QString &title,
                             const QString &message,
                             const QString &buttonText)
{
    QMessageBox msgBox(this);
    msgBox.setWindowTitle(title);
    msgBox.setText(message);

    // 设置按钮文本
    msgBox.setStandardButtons(QMessageBox::Ok);
    msgBox.button(QMessageBox::Ok)->setText(buttonText);

    // 模态显示（阻塞，类似await）
    msgBox.exec();

    // 或者非模态显示（非阻塞）
    // msgBox.setModal(false);
    // msgBox.show();
}

bool MainWindow::validateInput()
{
    // 验证设备名称
    if (ui->deviceNameTextBox->text().trimmed().isEmpty())
    {
        showMessage("验证错误", "请输入设备名称", "确定");
        return false;
    }

    // 验证服务器地址
    if (ui->serverAddressTextBox->text().trimmed().isEmpty())
    {
        showMessage("验证错误", "请输入服务器地址", "确定");
        return false;
    }

    // 验证用户名
    if (ui->usernameTextBox->text().trimmed().isEmpty())
    {
        showMessage("验证错误", "请输入用户名", "确定");
        return false;
    }

    // 验证密码 - 假设使用QLineEdit或QLineEdit设置为密码模式
    if (ui->passwordBox->text().isEmpty())
    {
        showMessage("验证错误", "请提供密码", "确定");
        return false;
    }

    // 所有验证通过
    return true;
}

void MainWindow::postLogin()
{
    ConnectionConfig config;
    config.Username = ui->usernameTextBox->text();
    config.Password = ui->passwordBox->text();
    config.DeviceName = ui->deviceNameTextBox->text();
    config.ServerAddress = ui->serverAddressTextBox->text();
    QNetworkAccessManager* manager = new QNetworkAccessManager();

    // URL
    QUrl url("http://" + config.ServerAddress + "/api/updatedevice");
    QNetworkRequest request(url);

    // 设置请求头
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");

    // 构造 JSON 数据
    QJsonObject json;
    json["email"] = config.Username;
    json["password"] = config.Password;
    json["devicename"] = config.DeviceName;

    QJsonDocument doc(json);
    QByteArray data = doc.toJson(QJsonDocument::Compact);

    // 发送 POST
    QNetworkReply* reply = manager->post(request, data);

    // 处理返回
    QObject::connect(reply, &QNetworkReply::finished, [reply, this]() {
        if (reply->error() != QNetworkReply::NoError) {
            qDebug() << "POST failed:" << reply->errorString();
            reply->deleteLater();
            return;
        }

        QByteArray responseData = reply->readAll();
        QJsonDocument responseDoc = QJsonDocument::fromJson(responseData);
        QJsonObject obj = responseDoc.object();
        int code = obj.value("code").toInt();
        if (code == 0)
            UpdateStatus("连接成功", Qt::blue);
        else if (code == 1)
            showMessage("错误", "用户名或密码错误", "确定");
        else if (code == 2)
            showMessage("错误", "当前ip被锁定，五分钟后再试", "确定");

        if (!responseDoc.isNull()) {
            qDebug() << "Response JSON:" << responseDoc;
        } else {
            qDebug() << "Invalid JSON response";
        }

        reply->deleteLater();
    });
}


void MainWindow::on_connectButton_clicked()
{
    if(!validateInput())
        return;

    ui->connectButton->setEnabled(false);  // 禁用
    int timeout_index = ui->reportIntervalComboBox->currentData().toInt();

    QTimer *timer = new QTimer(this);
    // 每 1000 ms 触发一次
    connect(timer, &QTimer::timeout, this, &MainWindow::postLogin);
    timer->start(timeout_index * 1000);
}


void MainWindow::on_testButton_clicked()
{
    if(!validateInput())
        return;
    postLogin();
}

