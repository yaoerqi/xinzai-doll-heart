// USB-only check for Seeed XIAO nRF52840, Seeed nRF52 Boards core.
// Flashes the built-in LED and reports that the main loop is running.
#include <Adafruit_TinyUSB.h>

unsigned long lastTick = 0;
bool light = false;

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.begin(115200);
}

void loop() {
  const unsigned long now = millis();
  if (now - lastTick >= 500) {
    lastTick = now;
    light = !light;
    digitalWrite(LED_BUILTIN, light ? LOW : HIGH);
    if (Serial) {
      Serial.print("XINZAI_XIAO_OK uptime_ms=");
      Serial.println(now);
    }
  }
}
