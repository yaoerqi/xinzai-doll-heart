// Desk test only: LC76G UART -> USB serial monitor. No BLE or App protocol.
// Target: Seeed XIAO nRF52840 (ordinary version), Seeed nRF52 Boards core.
// Disconnect USB while wiring; do not connect the 3-AA battery holder.
// Waveshare complete LC76G board: VCC -> XIAO 3V3, GND -> GND, TX -> D7/RX.
// The unused GNSS RX, PPS, RST, SDA, SCL leads stay disconnected and insulated.
// Confirm the real board labels and cable pin order; colors are not pin names.
#include <Adafruit_TinyUSB.h>

constexpr unsigned long GNSS_BAUD = 115200;
unsigned long lastByteAt = 0;
unsigned long lastNoticeAt = 0;
unsigned long lastBlinkAt = 0;
bool heartbeatLedOn = false;
bool usbWasOpen = false;

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.begin(115200);
  Serial1.begin(GNSS_BAUD);  // Board UART: D7 RX, D6 TX. Only RX is wired here.
}

void loop() {
  const unsigned long now = millis();
  const bool usbOpen = static_cast<bool>(Serial);
  if (usbOpen && !usbWasOpen) {
    Serial.println("\nXinZai LC76G USB diagnostic (NO Bluetooth)");
    Serial.print("GNSS UART baud: ");
    Serial.println(GNSS_BAUD);
    Serial.println("Waiting for raw NMEA. Text arriving does NOT itself mean a valid fix.");
  }
  usbWasOpen = usbOpen;

  while (Serial1.available()) {
    const int value = Serial1.read();
    if (value >= 0) {
      lastByteAt = millis();
      if (usbOpen) Serial.write(static_cast<uint8_t>(value));
    }
  }

  if (now - lastBlinkAt >= 500) {
    lastBlinkAt = now;
    heartbeatLedOn = !heartbeatLedOn;
    digitalWrite(LED_BUILTIN, heartbeatLedOn ? LOW : HIGH);
  }
  if (usbOpen && millis() - lastByteAt >= 5000 && now - lastNoticeAt >= 5000) {
    lastNoticeAt = now;
    Serial.println("\n[No UART bytes for 5s] Check power, shared GND, GNSS TX -> D7 RX and baud.");
  }
}
