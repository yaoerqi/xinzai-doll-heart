# LC76G → XIAO → 电脑：桌面接线诊断

2026-10-07，依据用户采购截图：Seeed XIAO nRF52840 普通版、Waveshare LC76G GNSS 完整开发板、USB 数据线、MB-102 面包板与跳线。

2026-10-14 更新：已在用户电脑安装 Arduino IDE 2.3.10 和 Seeed nRF52 Boards 1.1.13，使用 `Seeeduino:nrf52:xiaonRF52840` 编译并上传到 USB 连接的 XIAO。先上传 USB 测试程序，10 秒内收到 20 条 `XINZAI_XIAO_OK`；随后上传本诊断程序，串口已返回启动提示和 `No UART bytes`。当前运行端口为 **COM11**，重新插拔后应重新确认端口。

**主控烧录、USB 串口及 LC76G → XIAO 的数据传输已验证；有效卫星定位尚未验证。** 2026-10-14 用户完成接线并重新接入 USB 后，从 COM11 连续读取 20 秒，收到 240 条校验通过的 NMEA 报文，没有 `No UART bytes` 提示。该次采样的 RMC 状态为 `V`、GGA 定位质量为 `0`、参与定位及可见卫星数均为 `0`，说明模块在输出数据，但尚未获得有效位置。接收速率 115200 已实测可用，无需改为 9600。原始测试日志为 `.tooling/arduino-install/gnss-connected-serial.log`，可能含位置数据，应保留在本地。

本程序不包含蓝牙广播、定位解析或心仔 App 接收协议，不能作为完整定位器固件。编译时已修复 `ledOn` 与板包函数重名的问题。下一步是把陶瓷天线朝向开阔天空进行搜星测试；持续无卫星时需断电检查天线插接和供电，不能仅凭串口通畅认定所有硬件都已正常。

Arduino 标准草稿副本：`C:\Users\THUNDEROBOT\Documents\Arduino\gnss_usb_check\gnss_usb_check.ino`。当前副本与本目录源码一致；后续修改需同步，避免上传旧副本。编译占用程序空间 44,208 字节，动态内存 7,336 字节。本次编译、上传和串口日志保存在项目的 `.tooling/arduino-install/` 目录。

## 接线前

- 从包装泡棉、防静电袋中取出电路板，在绝缘桌面操作。先不装外壳，不接三节 AA 电池盒。
- 确认 XIAO 是普通 nRF52840，并有已焊牢、可插入面包板的排针；只有焊盘／孔不能靠压住跳线长期接触。
- 确认 GNSS 是微雪完整 LC76G 开发板，有配套天线及 8Pin 线束。不要把接法用于裸模组或其他型号。
- 接线、换线前拔掉 USB。按板上丝印及原配线束针序识别，不能按颜色猜 VCC、GND。

## 第一轮只接三根线

| LC76G 完整开发板 | XIAO nRF52840 | 用途 |
| --- | --- | --- |
| VCC | 3V3 | 从 XIAO 的 3.3V 电源输出给定位板供电 |
| GND | GND | 共地 |
| TX／TXD | D7／RX | 把定位板发出的串口数据送进主控 |

GNSS 的 RX、PPS、RST、SDA、SCL 暂不连接，各线头分别避开其他引脚。D6/TX 只有以后需要向 GNSS 发送配置命令时才接到 GNSS RX，本程序不发送命令。

XIAO 两排针跨在面包板中央沟槽两侧，USB 朝便于插线的边缘。同一编号下 a–e 五孔互通，f–j 五孔互通，两组不跨沟相通；不要按整条横行十孔互通来接。这次直接使用排针所在五孔组的空孔，不使用两侧电源长轨。母头线可直接套排针，或用公对公跳线转接到对应孔组。

若不能确认哪根线是 VCC、GND、TX，先不要上电，补拍定位板正反面、接口丝印及线束两端核对。GNSS 原配陶瓷天线应连接好，测试时正面朝开阔天空。

## 下载程序

1. 安装 Arduino IDE 2，首选项的「附加开发板管理器网址」加入 Seeed 官方地址：`https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json`。
2. 开发板管理器搜索 `Seeed nRF52`，本程序使用 `Seeed nRF52 Boards`，选择 `Seeed XIAO nRF52840` 普通版。
3. 先只用 USB 连接 XIAO，选中它的 COM 端口。本次已上传 `firmware/xiao_usb_check/xiao_usb_check.ino` 并读回运行信息，无需重复上传测试程序。程序会驱动板载灯闪烁，但本次远程验证依据是串口读回，未目视验证灯光。
4. 拔掉 USB，按表接定位板三根线；检查后再插 USB。
5. 用 Arduino IDE 打开同目录 `gnss_usb_check.ino`，上传，然后打开串口监视器，选择 115200。本次已将该程序上传，接线后重新上电即可运行，无需再次上传；在 IDE 中选择 `Seeed XIAO nRF52840` 和当前端口，再通过「工具 → 串口监视器」查看输出。
6. 程序闪灯表示主控在运行；监视器输出 NMEA 表示串口有数据，不代表已有有效位置。本程序的 LED 也不表示定位成功。

LC76G 产品规格的默认串口速率为 115200。厂商 Wiki 部分旧示例写 9600；若有乱码，在确认型号、供电与接线无误后，把源码 `GNSS_BAUD` 改为 `9600`，重新上传。电脑串口监视器仍选 115200。两侧串口是不同的接口，不能仅改电脑监视器来改变 GNSS 接收速率。

## 验收

- 首先应能看见程序提示；完全没有提示，先处理 COM 端口、上传及 USB 数据线。
- 持续提示 `No UART bytes`：检查供电、共地、TX→D7 接线和模块串口配置，不能直接认定只是没搜到卫星。
- 正常数据可包含 `$GNRMC`、`$GNGGA` 等句子，前缀也可能不同。在户外开阔处静置，冷启动留出数分钟。
- RMC 的状态字段 `A` 表示有效，`V` 表示无效；GGA 的定位质量字段 `0` 表示无定位。不要将空坐标或历史坐标视为实时位置。
- NMEA 原始经纬度常用度分形式，不能直接当十进制度数粘进地图；App 后续还需解析、校验与坐标体系处理。

接到心仔还需单独实现 XIAO 的 BLE 固件与 App 的通知订阅、坐标解析和过期处理。当前 App 的手机定位不等于已收到这个 GNSS 模块的坐标。

## 电池和外壳放到下一阶段

照片中的三节 AA 电池盒不是锂电池配套电源。三节普通 1.5V 电池串联标称 4.5V，不要接 3V3、GPIO 或锂电 BAT 焊盘，也不要在本接线中与 USB 并联。它可以暂时不用，不需要为了用上它强行改电路。

便携版需要核对单节锂电池、保护、允许充电电流、开关、极性和实际整机功耗；已焊排针不代表电池接口也已焊好。XIAO 仅靠电池供电时 5V 脚不输出 5V。电池接线确认后再做固定、绝缘和非金属外壳；不要把面包板和松动杜邦线作为随身携带的最终装配。

## 厂商依据

- [Seeed 入门、板包与供电资料](https://wiki.seeedstudio.com/XIAO_BLE/)
- [Seeed UART 引脚与 Serial1](https://wiki.seeedstudio.com/XIAO-BLE-Sense-Pin-Multiplexing/)
- [微雪 LC76G 引脚与接线注意事项](https://www.waveshare.com/wiki/LC76G_GNSS_Module)
- [微雪 LC76G 产品规格：默认 115200](https://www.waveshare.com/product/ai/expansions/lc76g-gnss-module.htm)
- [仅电池供电时没有 5V 输出](https://wiki.seeedstudio.com/bat_5vNo_OUTPUT/)
