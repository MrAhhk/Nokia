package com.nokialauncher.dumbmode;

import org.junit.Test;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

public class TotpPolicyTest {
    private static byte[] hex(String text) {byte[] result=new byte[text.length()/2];for(int i=0;i<result.length;i++)result[i]=(byte)Integer.parseInt(text.substring(i*2,i*2+2),16);return result;}
    @Test public void rfc6238Sha256Vectors() throws Exception {
        byte[] secret="12345678901234567890123456789012".getBytes(StandardCharsets.US_ASCII);
        long[] times={59,1111111109L,1111111111L,1234567890L,2000000000L,20000000000L};
        String[] expected={"46119246","68084774","67062674","91819424","90698825","77737706"};
        for(int i=0;i<times.length;i++)assertEquals(expected[i],TotpPolicy.code(secret,times[i]/30));
    }
    @Test public void rfc5869CaseOne() throws Exception {
        byte[] input=new byte[22];java.util.Arrays.fill(input,(byte)11);
        assertArrayEquals(hex("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"),
            TotpPolicy.hkdf(input,hex("000102030405060708090a0b0c"),hex("f0f1f2f3f4f5f6f7f8f9"),42));
    }
    @Test public void windowReplayAndWhitespace() throws Exception {
        byte[] secret="12345678901234567890123456789012".getBytes(StandardCharsets.US_ASCII);
        String code=TotpPolicy.code(secret,100);
        assertEquals(100,TotpPolicy.verify(secret," "+code.substring(0,4)+" "+code.substring(4)+" ",3000000,99));
        assertEquals(-1,TotpPolicy.verify(secret,code,3000000,100));
        assertEquals(-1,TotpPolicy.verify(secret,code,3060000,99));
        assertEquals(-1,TotpPolicy.verify(secret,"1234567",3000000,-1));
    }
}
