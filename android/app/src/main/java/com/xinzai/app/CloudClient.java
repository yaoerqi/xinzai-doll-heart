package com.xinzai.app;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;
import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

/** Credentials stay in native encrypted preferences; WebView can only use fixed API operations. */
final class CloudClient {
    private final Context context;
    private static final String ALIAS="xinzai-cloud-session";
    CloudClient(Context context){this.context=context.getApplicationContext();}
    private SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(!store.containsAlias(ALIAS)){KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();}
        return (SecretKey)store.getKey(ALIAS,null);
    }
    private JSONObject session() throws Exception {
        String saved=context.getSharedPreferences("cloud",Context.MODE_PRIVATE).getString("session",null);if(saved==null)return null;
        JSONObject envelope=new JSONObject(saved);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(envelope.getString("iv"),Base64.NO_WRAP)));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(envelope.getString("data"),Base64.NO_WRAP)),StandardCharsets.UTF_8));
    }
    private void store(JSONObject session) throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());JSONObject envelope=new JSONObject();envelope.put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP));envelope.put("data",Base64.encodeToString(cipher.doFinal(session.toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP));
        if(!context.getSharedPreferences("cloud",Context.MODE_PRIVATE).edit().putString("session",envelope.toString()).commit())throw new IOException("登录信息未能保存在本机");
    }
    private JSONObject status(JSONObject session) throws Exception {
        JSONObject result=new JSONObject();result.put("connected",session!=null&&session.optLong("expires")>System.currentTimeMillis());
        if(session!=null){result.put("endpoint",session.getString("endpoint"));result.put("account",session.getJSONObject("account"));result.put("expires",session.getLong("expires"));}return result;
    }
    private String endpoint(String value) throws Exception {
        URI uri=new URI(value.trim());if(!"https".equalsIgnoreCase(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getQuery()!=null||uri.getFragment()!=null||!(uri.getPath().isEmpty()||"/".equals(uri.getPath())))throw new IOException("请输入 HTTPS 服务域名，不包含账号、路径或参数");
        return new URI("https",null,uri.getHost(),uri.getPort(),null,null,null).toString();
    }
    private JSONObject request(String endpoint,String route,String method,JSONObject data,String token) throws Exception {
        HttpsURLConnection connection=(HttpsURLConnection)new URI(endpoint+route).toURL().openConnection();
        try{
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(30000);connection.setRequestMethod(method);connection.setRequestProperty("Accept","application/json");
            if(token!=null)connection.setRequestProperty("Authorization","Bearer "+token);
            if(data!=null){byte[] bytes=data.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>26*1024*1024)throw new IOException("同步资料超过 25 MB，请先整理照片");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");connection.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=connection.getOutputStream()){out.write(bytes);}}
            int code=connection.getResponseCode();InputStream stream=code>=400?connection.getErrorStream():connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream();
            if(stream!=null)try(InputStream input=stream){byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1){if(out.size()+n>26*1024*1024)throw new IOException("云端资料过大");out.write(buffer,0,n);}}
            JSONObject result;try{result=new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));}catch(Exception e){throw new IOException("服务未返回有效资料，请检查服务地址");}
            if(code<200||code>=300)throw new IOException("HTTP "+code+"："+result.optString("error","云同步请求未完成"));return result;
        }finally{connection.disconnect();}
    }
    synchronized JSONObject dispatch(String action,JSONObject params) throws Exception {
        JSONObject saved;
        try{saved=session();}catch(Exception e){if(!"cloudLogout".equals(action)&&!"cloudLogin".equals(action)&&!"cloudRegister".equals(action))throw new IOException("无法解锁保存的登录信息，请重新登录云同步");saved=null;}
        if("cloudStatus".equals(action))return status(saved);
        if("cloudLogin".equals(action)||"cloudRegister".equals(action)){
            String endpoint=endpoint(params.getString("endpoint"));JSONObject login=new JSONObject();login.put("username",params.getString("username"));login.put("password",params.getString("password"));if(params.has("invite"))login.put("invite",params.getString("invite"));
            JSONObject result=request(endpoint,"cloudRegister".equals(action)?"/api/register":"/api/login","POST",login,null);result.put("endpoint",endpoint);store(result);return status(result);
        }
        if("cloudLogout".equals(action)){
            boolean revoked=false;try{if(saved!=null){request(saved.getString("endpoint"),"/api/logout","POST",new JSONObject(),saved.getString("token"));revoked=true;}}catch(Exception ignored){}
            if(!context.getSharedPreferences("cloud",Context.MODE_PRIVATE).edit().remove("session").commit())throw new IOException("未能清除本机登录，请重试");return new JSONObject().put("connected",false).put("revoked",revoked);
        }
        if(saved==null||saved.optLong("expires")<=System.currentTimeMillis())throw new IOException("HTTP 401：登录已过期，请重新登录云同步");
        if("cloudPull".equals(action))return request(saved.getString("endpoint"),"/api/library","GET",null,saved.getString("token"));
        if("cloudPush".equals(action))return request(saved.getString("endpoint"),"/api/library","PUT",params,saved.getString("token"));
        throw new IOException("不支持的云同步操作");
    }
}
