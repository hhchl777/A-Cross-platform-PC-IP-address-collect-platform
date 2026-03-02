#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QMainWindow>

QT_BEGIN_NAMESPACE
namespace Ui {
class MainWindow;
}
QT_END_NAMESPACE

// 定义配置结构体
struct ConnectionConfig {
    QString Username;
    QString Password;
    QString DeviceName;
    QString ServerAddress;
    int ReportIntervalSeconds;
};


class MainWindow : public QMainWindow
{
    Q_OBJECT

public:
    MainWindow(QWidget *parent = nullptr);
    ~MainWindow();

private slots:
    void on_connectButton_clicked();

    void on_testButton_clicked();

private:
    Ui::MainWindow *ui;
    void SetDefaultValues();
    void UpdateStatus(QString message, QColor color);
    bool validateInput();
    void showMessage(const QString &title, const QString &message, const QString &buttonText);
    void postLogin();
};
#endif // MAINWINDOW_H
