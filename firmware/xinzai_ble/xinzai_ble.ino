// XIAO nRF52840 + Waveshare LC76G: VCC->3V3, GND->GND, TX->D7/RX.
// Application firmware only. USB powered prototype; no battery percentage guessed.
#include <Adafruit_TinyUSB.h>
#include <bluefruit.h>
#include "NmeaState.h"

BLEService heartService("6f8a0001-7b2d-4c6a-9f41-8e65c0d2a901");
BLECharacteristic positionValue("6f8a0002-7b2d-4c6a-9f41-8e65c0d2a901");
NmeaState gnss;
char lineBuffer[160];
size_t lineSize=0;
uint32_t lastPublish=0;
uint16_t sequence=0;
bool serialWasOpen=false;

void setup() {
  pinMode(LED_BUILTIN,OUTPUT);digitalWrite(LED_BUILTIN,HIGH);
  Serial.begin(115200);Serial1.begin(115200);
  Bluefruit.begin(1,0);
  Bluefruit.setTxPower(0);
  Bluefruit.setName("XinZai-Heart");
  heartService.begin();
  positionValue.setProperties(CHR_PROPS_READ|CHR_PROPS_NOTIFY);
  positionValue.setPermission(SECMODE_OPEN,SECMODE_NO_ACCESS);
  positionValue.setFixedLen(20);positionValue.begin();
  uint8_t initial[20];gnss.packet(initial,millis(),sequence);positionValue.write(initial,20);
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();Bluefruit.Advertising.addService(heartService);
  Bluefruit.ScanResponse.addName();Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(160,800);Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);
}
void loop() {
  bool opened=(bool)Serial;
  if(opened&&!serialWasOpen)Serial.println("XINZAI_BLE_READY firmware=0.5.0 protocol=1 name=XinZai-Heart");
  serialWasOpen=opened;
  while(Serial1.available()) {
    char c=(char)Serial1.read();
    if(c=='$'){lineSize=0;lineBuffer[lineSize++]=c;}
    else if(c=='\n') {
      if(lineSize){lineBuffer[lineSize]=0;gnss.parse(lineBuffer,millis());}lineSize=0;
    } else if(c!='\r' && lineSize) {
      if(lineSize<sizeof(lineBuffer)-1)lineBuffer[lineSize++]=c;else lineSize=0;
    }
  }
  uint32_t now=millis();
  if((uint32_t)(now-lastPublish)>=1000) {
    lastPublish=now;uint8_t data[20];gnss.packet(data,now,++sequence);
    positionValue.write(data,20);
    if(Bluefruit.connected())positionValue.notify(data,20);
    if(Serial){
      Serial.print("XINZAI_STATUS nmea=");Serial.print(gnss.live(now));
      Serial.print(" fix=");Serial.print(gnss.fixed(now));Serial.print(" sats_used=");Serial.print(data[3]);
      Serial.print(" ble=");Serial.print(Bluefruit.connected());Serial.print(" frame=");
      for(uint8_t b:data){if(b<16)Serial.print('0');Serial.print(b,HEX);}Serial.println();
    }
  }
  digitalWrite(LED_BUILTIN,gnss.fixed(now)?LOW:((now%2000)<100?LOW:HIGH));
  delay(1);
}
