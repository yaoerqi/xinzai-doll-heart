// Diagnostic fixture only, no Bluetooth and no real location data.
// Copy ../xinzai_ble/NmeaState.h next to the sketch in the Arduino sketch directory.
#include <Adafruit_TinyUSB.h>
#include "NmeaState.h"
int passed=0,failed=0;
uint8_t golden[20];
void check(bool ok){if(ok)passed++;else failed++;}
void feed(NmeaState& state,const char* body,uint32_t now){
  uint8_t c=0;for(const char* p=body;*p;p++)c^=*p;
  char line[160];snprintf(line,sizeof(line),"$%s*%02X",body,c);check(state.parse(line,now));
}
void good(NmeaState& s,uint32_t t){
  feed(s,"GNGGA,123519.000,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,",t);
  feed(s,"GNRMC,123519.000,A,4807.038,N,01131.000,E,0,0,230394,,,A",t);
}
void setup(){
  Serial.begin(115200);NmeaState s;
  check(!s.fixed(0));good(s,1000);check(s.fixed(1000));check(s.lat==481173000);check(s.lon==115166667);
  s.packet(golden,1000,65535);check(golden[2]==3);check(NmeaState::crc((const uint8_t*)"123456789",9)==0x29B1);
  check(!s.fixed(3501));s.packet(golden,3501,1);check((golden[2]&2)==0);check(golden[6]==0&&golden[10]==0);
  good(s,4000);feed(s,"GNRMC,123519.000,V,4807.038,N,01131.000,E,0,0,230394,,,N",4000);check(!s.fixed(4000));
  good(s,5000);feed(s,"GNGGA,123519.000,4807.038,N,01131.000,E,0,00,99.99,0,M,0,M,,",5000);check(!s.fixed(5000));
  good(s,6000);feed(s,"GNRMC,123520.000,A,4807.038,N,01131.000,E,0,0,230394,,,A",6000);check(!s.fixed(6000));
  good(s,7000);feed(s,"GNRMC,123519.000,A,9100.000,N,01131.000,E,0,0,230394,,,A",7000);check(!s.fixed(7000));
  good(s,8000);feed(s,"GNRMC,123519.000,A,4860.000,N,01131.000,E,0,0,230394,,,A",8000);check(!s.fixed(8000));
  good(s,9000);feed(s,"GNRMC,123519.000,A,4807.038,S,01131.000,W,0,0,230394,,,A",9000);check(s.fixed(9000)&&s.lat<0&&s.lon<0);
  char corrupt[]="$GNRMC,123519,V,,,,,,,,,,N*00";check(!s.parse(corrupt,10000));check(s.lastNmea==9000);
  good(s,0xfffffff0);check(s.fixed(10));check(!s.fixed(3000));
  good(s,1000);s.packet(golden,1000,65535);
}
void loop(){
  if(Serial){Serial.print("NMEA_TEST passed=");Serial.print(passed);Serial.print(" failed=");Serial.println(failed);
    Serial.print("FIXTURE_FRAME=");for(uint8_t b:golden){if(b<16)Serial.print('0');Serial.print(b,HEX);}Serial.println();}
  delay(1000);
}
