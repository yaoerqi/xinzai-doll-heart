package com.xinzai.app;

/** V1 fixed 20-byte little-endian frame. Independent of Android for JVM tests. */
final class HeartPacket {
    final boolean nmea, valid;
    final int satellites, sequence, ageSeconds;
    final double lat, lon, hdop;
    private HeartPacket(byte[] p) {
        nmea=(p[2]&1)!=0; satellites=p[3]&255;sequence=u16(p,4);ageSeconds=u16(p,16);
        lat=i32(p,6)/1e7;lon=i32(p,10)/1e7;hdop=u16(p,14)==65535?Double.NaN:u16(p,14)/100.0;
        valid=(p[2]&2)!=0 && nmea && ageSeconds<=2 && satellites>=4 && Double.isFinite(hdop) && hdop<=10;
    }
    static HeartPacket decode(byte[] p) {
        if(p==null || p.length!=20 || p[0]!=0x58 || p[1]!=1 || (p[2]&~3)!=0 || (p[3]&255)>99) return null;
        if(crc(p,18)!=u16(p,18)) return null;
        HeartPacket frame=new HeartPacket(p);
        if(Math.abs(frame.lat)>90 || Math.abs(frame.lon)>180) return null;
        return frame;
    }
    static int u16(byte[] p,int i){return (p[i]&255)|((p[i+1]&255)<<8);}
    static int i32(byte[] p,int i){return (p[i]&255)|((p[i+1]&255)<<8)|((p[i+2]&255)<<16)|((p[i+3]&255)<<24);}
    static int crc(byte[] p,int size){int c=65535;for(int i=0;i<size;i++){c^=(p[i]&255)<<8;for(int b=0;b<8;b++)c=((c&0x8000)!=0?(c<<1)^0x1021:c<<1)&65535;}return c;}
    static boolean newer(int next,int previous){int delta=(next-previous)&65535;return previous<0 || (delta>0&&delta<32768);}
}
