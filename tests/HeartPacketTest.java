package com.xinzai.app;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
public class HeartPacketTest {
    static int checks;
    static void check(boolean ok){checks++;if(!ok)throw new AssertionError("check "+checks);}
    static void seal(byte[] p){int c=HeartPacket.crc(p,18);p[18]=(byte)c;p[19]=(byte)(c>>8);}
    static byte[] hex(String text){byte[] p=new byte[text.length()/2];for(int i=0;i<p.length;i++)p[i]=(byte)Integer.parseInt(text.substring(i*2,i*2+2),16);return p;}
    public static void main(String[] args)throws Exception{
        byte[] p=new byte[20];p[0]=0x58;p[1]=1;p[2]=3;p[3]=8;p[14]=90;seal(p);
        check(HeartPacket.decode(p).valid);check(HeartPacket.decode(p).lat==0); // (0,0) is not inherently invalid.
        check(HeartPacket.crc("123456789".getBytes(StandardCharsets.US_ASCII),9)==0x29b1);
        check(HeartPacket.decode(Arrays.copyOf(p,19))==null);check(HeartPacket.decode(null)==null);
        byte[] corrupt=p.clone();corrupt[8]^=1;check(HeartPacket.decode(corrupt)==null);
        p[1]=2;seal(p);check(HeartPacket.decode(p)==null);p[1]=1;
        p[2]=1;seal(p);check(!HeartPacket.decode(p).valid);p[2]=3;
        p[16]=3;seal(p);check(!HeartPacket.decode(p).valid);p[16]=0;
        p[3]=3;seal(p);check(!HeartPacket.decode(p).valid);p[3]=8;
        p[14]=(byte)255;p[15]=(byte)255;seal(p);check(!HeartPacket.decode(p).valid);
        check(!HeartPacket.newer(10,10));check(!HeartPacket.newer(9,10));check(HeartPacket.newer(0,65535));check(HeartPacket.newer(10,-1));
        // Cross-language vector emitted by the actual nRF52840 parser test.
        if(args.length>0){
            String log=new String(Files.readAllBytes(Paths.get(args[0])),StandardCharsets.UTF_8);
            java.util.regex.Matcher match=java.util.regex.Pattern.compile("FIXTURE_FRAME=([0-9A-F]{40})").matcher(log);
            check(match.find());HeartPacket golden=HeartPacket.decode(hex(match.group(1)));
            check(golden!=null&&golden.valid);check(Math.abs(golden.lat-48.1173)<1e-7);check(Math.abs(golden.lon-11.5166667)<1e-7);check(golden.sequence==65535);
        }
        System.out.println("HeartPacket checks passed: "+checks);
    }
}
