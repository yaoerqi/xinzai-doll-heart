package com.xinzai.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.LocationManager;
import android.net.Uri;
import android.os.*;
import android.util.Base64;
import android.view.*;
import android.webkit.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int PICK = 10, EXPORT = 11, PERMISSIONS = 12;
    private WebView web;
    private BluetoothController bluetooth;
    private ValueCallback<Uri[]> chooser;
    private JSONObject pendingPermission;
    private byte[] exportBytes;
    private String exportRequest;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean pageReady;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(248,246,240));
        getWindow().setNavigationBarColor(Color.rgb(255,253,248));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(248,246,240));
        // Respect Android 15 edge-to-edge system bars, display cutouts and the keyboard.
        android.widget.FrameLayout frame = new android.widget.FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(248,246,240));
        frame.addView(web, new android.widget.FrameLayout.LayoutParams(-1,-1));
        frame.setOnApplyWindowInsetsListener((view, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                left=bars.left;top=bars.top;right=bars.right;bottom=bars.bottom;
            } else { left=insets.getSystemWindowInsetLeft();top=insets.getSystemWindowInsetTop();right=insets.getSystemWindowInsetRight();bottom=insets.getSystemWindowInsetBottom(); }
            view.setPadding(left,top,right,bottom);
            return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
        setContentView(frame);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setTextZoom(100);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        bluetooth = new BluetoothController(this, (type, data) -> event(type, data));
        web.addJavascriptInterface(new NativeBridge(), "XinZaiAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !trusted(request.getUrl()); }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!trusted(uri) || !"GET".equals(request.getMethod())) return errorResponse(403,"Blocked");
                String route = uri.getPath();
                if (route == null || !route.startsWith("/assets/") || route.contains("..") || route.contains("\\")) return errorResponse(404,"Not found");
                try {
                    String file = route.substring(8);
                    String mime = file.endsWith(".html")?"text/html":file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":file.endsWith(".png")?"image/png":file.endsWith(".jpg")?"image/jpeg":"application/octet-stream";
                    Map<String,String> headers = new HashMap<>(); headers.put("Cache-Control","no-store"); headers.put("X-Content-Type-Options","nosniff");
                    return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,getAssets().open("www/"+file));
                } catch (IOException e) { return errorResponse(404,"Not found"); }
            }
            @Override public void onPageFinished(WebView view, String url) { pageReady = trusted(Uri.parse(url)); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
                String[] types = params.getAcceptTypes();
                boolean image = false;
                for (String type : types) if (type.startsWith("image/")) image=true;
                intent.setType(image?"image/*":"application/json");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,false);
                try { startActivityForResult(intent,PICK); }
                catch (ActivityNotFoundException e) { chooser.onReceiveValue(null);chooser=null;showMessage("手机没有可用的文件选择器"); }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
        });
        web.loadUrl("https://"+HOST+"/assets/index.html");
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
    }

    private boolean trusted(Uri uri) { return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && (uri.getPort() == -1 || uri.getPort() == 443); }
    private WebResourceResponse errorResponse(int code,String message) { return new WebResourceResponse("text/plain","UTF-8",code,message,Collections.emptyMap(),new ByteArrayInputStream(message.getBytes(StandardCharsets.UTF_8))); }
    private void showMessage(String text) { android.widget.Toast.makeText(this,text,android.widget.Toast.LENGTH_LONG).show(); }

    public final class NativeBridge {
        @JavascriptInterface public String loadState() { return LocalStore.read(MainActivity.this,"state.json"); }
        @JavascriptInterface public boolean saveState(String json) { return LocalStore.write(MainActivity.this,"state.json",json); }
        @JavascriptInterface public void request(String json) {
            if (json == null || json.length() > 40*1024*1024) return;
            try { JSONObject request = new JSONObject(json); runOnUiThread(() -> dispatch(request)); } catch (JSONException ignored) {}
        }
    }
    private void dispatch(JSONObject request) {
        String id=request.optString("id"), action=request.optString("action");
        JSONObject params=request.optJSONObject("params");if(params==null)params=new JSONObject();
        try {
            switch(action) {
                case "info": { JSONObject info=new JSONObject();info.put("android",Build.VERSION.RELEASE);info.put("sdk",Build.VERSION.SDK_INT);info.put("model",Build.MANUFACTURER+" "+Build.MODEL);info.put("version","0.2.0");reply(id,info,null);break; }
                case "export": exportFile(id,params);break;
                case "haptic": { Vibrator v=(Vibrator)getSystemService(VIBRATOR_SERVICE);if(v!=null&&v.hasVibrator())v.vibrate(VibrationEffect.createWaveform(new long[]{0,35,90,55},-1));reply(id,new JSONObject(),null);break; }
                case "bleScan": if(ensurePermission(request,blePermissions())){bluetooth.scan();reply(id,new JSONObject(),null);}break;
                case "bleStop": bluetooth.stopScan();reply(id,new JSONObject(),null);break;
                case "bleConnect": if(ensurePermission(request,blePermissions())){bluetooth.connect(params.getString("device"));reply(id,new JSONObject(),null);}break;
                case "bleDisconnect": bluetooth.disconnect();reply(id,new JSONObject(),null);break;
                case "bleStatus": reply(id,bluetooth.status(),null);break;
                case "trackStatus": reply(id,LocationRecorder.snapshot(this),null);break;
                case "trackStart": {
                    if(!ensurePermission(request,new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION}))break;
                    LocationManager lm=(LocationManager)getSystemService(LOCATION_SERVICE);
                    if(lm==null||(!lm.isProviderEnabled(LocationManager.GPS_PROVIDER)&&!lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)))throw new Exception("请先在手机设置中打开定位，再开始同行");
                    if(LocationRecorder.running)throw new Exception("已经有一段旅程正在记录");
                    LocationRecorder.prepare(this,params.optString("title","一起出门"),params.optBoolean("resume"));
                    startForegroundService(new Intent(this,LocationRecorder.class).setAction("start"));
                    handler.postDelayed(()->reply(id,LocationRecorder.snapshot(this),null),300);
                    break;
                }
                case "trackPause": stopJourney(id,"paused");break;
                case "trackStop": stopJourney(id,"finished");break;
                case "trackClear": {
                    JSONObject existing=LocationRecorder.snapshot(this);
                    if(LocationRecorder.running)throw new Exception("请先停止记录");
                    if(!existing.optString("id").equals(params.optString("tripId")))throw new Exception("旅程已变化，请刷新后重试");
                    if(!LocalStore.write(this,LocationRecorder.FILE,"{}"))throw new Exception("暂时无法清除轨迹");
                    reply(id,new JSONObject(),null);break;
                }
                case "notificationPermission": if(Build.VERSION.SDK_INT<33||ensurePermission(request,new String[]{Manifest.permission.POST_NOTIFICATIONS}))reply(id,new JSONObject(),null);break;
                default: throw new Exception("不支持的手机功能");
            }
        }catch(Exception e){reply(id,null,e.getMessage()==null?"操作未完成":e.getMessage());}
    }
    private void stopJourney(String id,String status) throws Exception {
        if(LocationRecorder.running){ startService(new Intent(this,LocationRecorder.class).setAction("paused".equals(status)?"pause":"stop"));handler.postDelayed(()->reply(id,LocationRecorder.snapshot(this),null),200); }
        else { JSONObject track=LocationRecorder.snapshot(this);if(track.has("id")){track.put("status",status);if(!LocalStore.write(this,LocationRecorder.FILE,track.toString()))throw new Exception("旅程未能保存，请稍后再试");}reply(id,track,null); }
    }
    private String[] blePermissions() { return Build.VERSION.SDK_INT>=31?new String[]{Manifest.permission.BLUETOOTH_SCAN,Manifest.permission.BLUETOOTH_CONNECT}:new String[]{Manifest.permission.ACCESS_FINE_LOCATION}; }
    private boolean ensurePermission(JSONObject request,String[] permissions) throws Exception {
        List<String> missing=new ArrayList<>();for(String permission:permissions)if(checkSelfPermission(permission)!=PackageManager.PERMISSION_GRANTED)missing.add(permission);
        if(missing.isEmpty())return true;
        if(pendingPermission!=null)throw new Exception("请先完成当前权限选择");
        pendingPermission=request;requestPermissions(permissions,PERMISSIONS);return false;
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grants) {
        super.onRequestPermissionsResult(requestCode,permissions,grants);
        if(requestCode!=PERMISSIONS||pendingPermission==null)return;
        JSONObject request=pendingPermission;pendingPermission=null;
        boolean allowed=grants.length>0;for(int grant:grants)if(grant!=PackageManager.PERMISSION_GRANTED)allowed=false;
        if(allowed)dispatch(request);else {
            String action=request.optString("action");
            String message="notificationPermission".equals(action)?"通知权限未开启；可在手机设置中开启旅程状态通知。":action.startsWith("ble")?"蓝牙所需权限未开启；仍可收藏回忆，授权后再连接糖心。":"位置权限未开启；完整路线需要精确位置。仍可手动记录回忆，也可到手机设置授权后重试。";
            reply(request.optString("id"),null,message);
        }
    }
    private void exportFile(String id,JSONObject params) throws Exception {
        if(exportRequest!=null)throw new Exception("请先完成当前文件保存");
        String name=params.optString("name","心仔文件").replaceAll("[\\\\/:*?\"<>|]","_");
        String mime=params.optString("mime");
        if(!Arrays.asList("image/png","application/json","application/gpx+xml").contains(mime))throw new Exception("不支持的导出格式");
        byte[] bytes=Base64.decode(params.getString("base64"),Base64.DEFAULT);
        if(bytes.length>25*1024*1024)throw new Exception("导出文件过大，请减少照片后再试");
        Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE,name);
        exportBytes=bytes;exportRequest=id;
        try{startActivityForResult(intent,EXPORT);}catch(Exception e){exportBytes=null;exportRequest=null;throw e;}
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==PICK&&chooser!=null){Uri uri=resultCode==RESULT_OK&&data!=null?data.getData():null;chooser.onReceiveValue(uri!=null&&"content".equals(uri.getScheme())?new Uri[]{uri}:null);chooser=null;}
        if(requestCode==EXPORT&&exportRequest!=null){
            String id=exportRequest;byte[] bytes=exportBytes;exportRequest=null;exportBytes=null;
            if(resultCode!=RESULT_OK||data==null||data.getData()==null){reply(id,null,"已取消保存，回忆仍在 App 中");return;}
            Uri uri=data.getData();
            new Thread(()->{try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new IOException("不能写入所选位置");out.write(bytes);out.flush();reply(id,new JSONObject(),null);}catch(Exception e){reply(id,null,"保存失败，请选择其他文件夹或检查剩余空间");}},"xinzai-export").start();
        }
    }
    private void reply(String id,JSONObject value,String error){try{JSONObject response=new JSONObject();response.put("id",id);response.put("ok",error==null);response.put("data",value==null?new JSONObject():value);if(error!=null)response.put("error",error);runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.XinZaiNative&&window.XinZaiNative.receive("+response+")",null);});}catch(Exception ignored){}}
    private void event(String type,JSONObject data){try{JSONObject event=new JSONObject();event.put("type",type);event.put("data",data);runOnUiThread(()->{if(web!=null&&pageReady)web.evaluateJavascript("window.XinZaiNative&&window.XinZaiNative.event("+event+")",null);});}catch(Exception ignored){}}
    private void handleBack(){if(web==null){finish();return;}web.evaluateJavascript("window.xinzaiBack ? window.xinzaiBack() : false",result->{if(!"true".equals(result))finish();});}
    @Override public void onBackPressed(){handleBack();}
    @Override protected void onPause(){super.onPause();if(bluetooth!=null)bluetooth.stopScan();}
    @Override protected void onResume(){super.onResume();if(web!=null&&pageReady)web.evaluateJavascript("window.xinzaiRefreshNative&&window.xinzaiRefreshNative()",null);}
    @Override protected void onDestroy(){if(chooser!=null)chooser.onReceiveValue(null);if(bluetooth!=null)bluetooth.destroy();handler.removeCallbacksAndMessages(null);if(web!=null){web.removeJavascriptInterface("XinZaiAndroid");web.destroy();web=null;}super.onDestroy();}
}
