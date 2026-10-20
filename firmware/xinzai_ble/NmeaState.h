#pragma once
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

// No Arduino dependencies: the exact parser is also exercised by host tests.
struct NmeaState {
  uint32_t lastNmea = 0, lastRmc = 0, lastGga = 0;
  bool seen = false, rmcValid = false, ggaValid = false;
  int32_t lat = 0, lon = 0;
  uint8_t satellites = 0;
  uint16_t hdop = 65535;
  char rmcTime[7] = {}, ggaTime[7] = {};

  static bool number(const char* s, double& out) {
    if (!s || !*s) return false;
    char* end; out = strtod(s, &end);
    return *end == 0 && isfinite(out);
  }
  static bool coordinate(const char* s, const char* hemi, bool latitude, int32_t& result) {
    double v;
    if (!number(s,v) || v < 0 || strlen(hemi)!=1) return false;
    if (latitude ? (*hemi!='N' && *hemi!='S') : (*hemi!='E' && *hemi!='W')) return false;
    double degrees = floor(v/100), minutes = v-degrees*100;
    double decimal = degrees+minutes/60;
    if (minutes >= 60 || decimal > (latitude?90:180)) return false;
    if (*hemi=='S' || *hemi=='W') decimal = -decimal;
    result = (int32_t)llround(decimal*10000000); return true;
  }
  static bool utc(const char* value, char* result) {
    if (strlen(value)<6) return false;
    for (int i=0;i<6;i++) if (value[i]<'0'||value[i]>'9') return false;
    if ((value[0]-'0')*10+value[1]-'0'>23 || (value[2]-'0')*10+value[3]-'0'>59 || (value[4]-'0')*10+value[5]-'0'>60) return false;
    memcpy(result,value,6); result[6]=0; return true;
  }
  bool parse(char* line, uint32_t now) {
    if (line[0]!='$') return false;
    char* star = strchr(line,'*');
    if (!star || strlen(star+1)!=2) return false;
    char* end; long checksum = strtol(star+1,&end,16);
    if (*end || end!=star+3) return false;
    uint8_t sum=0; for(char* p=line+1;p<star;p++) sum^=(uint8_t)*p;
    if(sum!=checksum) return false;
    *star=0;
    char* fields[24]; int count=0; char* p=line+1;
    fields[count++]=p;
    while(*p && count<24) {if(*p==','){*p=0;fields[count++]=p+1;}p++;}
    if(strlen(fields[0])!=5) return false;
    seen=true;lastNmea=now;
    if(strcmp(fields[0]+2,"RMC")==0) {
      rmcValid=false;lastRmc=now;
      if(count>9 && strcmp(fields[2],"A")==0 && utc(fields[1],rmcTime)
          && coordinate(fields[3],fields[4],true,lat) && coordinate(fields[5],fields[6],false,lon)
          && !(count>12 && (strcmp(fields[12],"N")==0 || strcmp(fields[12],"E")==0))) rmcValid=true;
    } else if(strcmp(fields[0]+2,"GGA")==0) {
      ggaValid=false;lastGga=now;satellites=0;hdop=65535;
      double quality,sats,dop;
      if(count>8 && number(fields[6],quality) && number(fields[7],sats) && sats>=0 && sats<=99 && floor(sats)==sats) {
        satellites=(uint8_t)sats;
        if(number(fields[8],dop) && dop>=0 && dop<655.35) hdop=(uint16_t)lround(dop*100);
        ggaValid=(quality==1 || quality==2 || quality==4 || quality==5) && utc(fields[1],ggaTime);
      }
    }
    return true;
  }
  bool live(uint32_t now) const { return seen && (uint32_t)(now-lastNmea)<=3000; }
  bool fixed(uint32_t now) const {
    return live(now) && rmcValid && ggaValid && satellites>=4 && hdop<=1000
      && (uint32_t)(now-lastRmc)<=2500 && (uint32_t)(now-lastGga)<=2500 && strcmp(rmcTime,ggaTime)==0;
  }
  static uint16_t crc(const uint8_t* data, int size) {
    uint16_t value=0xffff;
    for(int i=0;i<size;i++){value^=(uint16_t)data[i]<<8;for(int bit=0;bit<8;bit++)value=(value&0x8000)?(value<<1)^0x1021:value<<1;}
    return value;
  }
  static void put16(uint8_t* p,uint16_t n){p[0]=n;p[1]=n>>8;}
  static void put32(uint8_t* p,int32_t n){uint32_t v=(uint32_t)n;for(int i=0;i<4;i++)p[i]=v>>(8*i);}
  void packet(uint8_t* out, uint32_t now, uint16_t sequence) const {
    memset(out,0,20);out[0]=0x58;out[1]=1;
    const bool valid=fixed(now);out[2]=(live(now)?1:0)|(valid?2:0);
    out[3]=(uint32_t)(now-lastGga)<=3000?satellites:0;put16(out+4,sequence);
    put32(out+6,valid?lat:0);put32(out+10,valid?lon:0);
    put16(out+14,(uint32_t)(now-lastGga)<=3000?hdop:65535);
    const uint32_t age=(uint32_t)(now-lastRmc)/1000;
    put16(out+16,rmcValid?(age>65534?65534:age):65535);put16(out+18,crc(out,18));
  }
};
