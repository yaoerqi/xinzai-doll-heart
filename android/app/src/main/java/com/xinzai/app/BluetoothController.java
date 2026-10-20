package com.xinzai.app;

import android.bluetooth.*;
import android.bluetooth.le.*;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.*;
import java.util.*;

/** Only subscribes to our explicit V1 service; unknown devices remain read-only. */
final class BluetoothController {
    interface Listener { void event(String type, JSONObject data); }
    private final Context context;
    private Listener listener;
    private static BluetoothController shared;
    static BluetoothController get(Context context) {
        if(shared==null) shared=new BluetoothController(context.getApplicationContext());
        return shared;
    }
    void attach(Listener value){listener=value;}
    void detach(){listener=null;if(!LocationRecorder.hardwareRunning())destroy();}
    private static final UUID HEART_SERVICE=UUID.fromString("6f8a0001-7b2d-4c6a-9f41-8e65c0d2a901");
    private static final UUID HEART_VALUE=UUID.fromString("6f8a0002-7b2d-4c6a-9f41-8e65c0d2a901");
    private static final UUID CCCD=UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private long lastPacketAt;
    private int lastSequence=-1;
    private void emit(String type,JSONObject value){
        try{if(listener!=null)listener.event(type,new JSONObject(value.toString()));}catch(Exception ignored){}
        if("bleDevice".equals(type))LocationRecorder.deviceUpdate(value);
    }
    private final Runnable freshnessTask=new Runnable(){public void run(){
        if(connection==null)return;
        if(deviceState.optBoolean("trackSyncReady") && android.os.SystemClock.elapsedRealtime()-lastPacketAt>5000) {
            try{deviceState.put("fix",false);deviceState.put("gnssStatus","stale");deviceState.remove("lat");deviceState.remove("lon");emit("bleDevice",deviceState);}catch(Exception ignored){}
        }
        handler.postDelayed(this,1000);
    }};
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<String, BluetoothDevice> devices = new LinkedHashMap<>();
    private final Map<String, JSONObject> results = new LinkedHashMap<>();
    private BluetoothLeScanner scanner;
    private BluetoothGatt connection;
    private JSONObject deviceState = new JSONObject();
    private boolean scanning;
    private final Runnable stopTask = () -> stopScan();

    private BluetoothController(Context context) { this.context = context; }
    JSONObject status() { return deviceState; }
    void scan() throws Exception {
        BluetoothManager manager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
        if (adapter == null) throw new Exception("这台设备不支持蓝牙");
        if (!adapter.isEnabled()) throw new Exception("请先在手机设置中打开蓝牙");
        stopScan();
        devices.clear(); results.clear();
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) throw new Exception("蓝牙扫描不可用，请稍后重试");
        scanning = true;
        scanner.startScan(null, new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), callback);
        handler.postDelayed(stopTask, 10000);
        publish();
    }
    private final ScanCallback callback = new ScanCallback() {
        @Override public void onScanResult(int callbackType, ScanResult result) {
            if (!scanning) return;
            try {
                BluetoothDevice device = result.getDevice();
                String address = device.getAddress();
                String name = result.getScanRecord() == null ? null : result.getScanRecord().getDeviceName();
                if (name == null) name = device.getName();
                JSONObject entry = new JSONObject();
                entry.put("id", address); entry.put("name", name == null ? "未命名 BLE 设备" : name); entry.put("rssi", result.getRssi());
                if (results.size() >= 60 && !results.containsKey(address)) return;
                devices.put(address, device); results.put(address, entry); publish();
            } catch (Exception ignored) {}
        }
        @Override public void onScanFailed(int errorCode) { scanning = false; publishError("扫描未完成，错误码 " + errorCode + "。请稍后重试。"); }
    };
    private void publish() { try { JSONObject payload = new JSONObject(); payload.put("scanning", scanning); payload.put("devices", new JSONArray(results.values())); emit("bleScan", payload); } catch (Exception ignored) {} }
    private void publishError(String message) { try { JSONObject payload = new JSONObject(); payload.put("error", message); payload.put("scanning", false); emit("bleScan", payload); } catch (Exception ignored) {} }
    void stopScan() {
        handler.removeCallbacks(stopTask);
        if (scanner != null && scanning) try { scanner.stopScan(callback); } catch (Exception ignored) {}
        scanning = false; publish();
    }
    void connect(String address) throws Exception {
        if(LocationRecorder.hardwareRunning() && !address.equals(LocationRecorder.snapshot(context).optString("deviceId")))throw new Exception("请先暂停糖心旅程，再更换连接设备");
        BluetoothDevice device = devices.get(address);
        if (device == null) throw new Exception("请先扫描，再选择本轮发现的设备");
        stopScan(); disconnect();
        deviceState = new JSONObject();
        deviceState.put("id", address); deviceState.put("name", results.get(address).optString("name"));
        deviceState.put("status", "connecting"); deviceState.put("trackSyncReady", false);
        emit("bleDevice", deviceState);
        connection = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE);
        final BluetoothGatt attempt = connection;
        handler.postDelayed(() -> { if (connection == attempt && "connecting".equals(deviceState.optString("status"))) { disconnect(); publishError("连接超时，设备可能不接受连接或已被其他 App 占用"); } }, 15000);
    }
    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            handler.post(() -> {
                if (gatt != connection) return;
                try {
                    if (status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED) {
                        if (!gatt.discoverServices()) throw new Exception("服务发现未启动");
                    } else { disconnect(); }
                } catch (Exception e) { disconnect(); publishError("设备服务读取失败"); }
            });
        }
        @Override public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            handler.post(() -> {
                if (gatt != connection) return;
                try {
                    if (status != BluetoothGatt.GATT_SUCCESS) throw new Exception("服务发现失败");
                    JSONArray services = new JSONArray();
                    for (BluetoothGattService service : gatt.getServices()) services.put(service.getUuid().toString());
                    deviceState.put("status", "connected"); deviceState.put("services", services);
                    BluetoothGattService heart=gatt.getService(HEART_SERVICE);
                    BluetoothGattCharacteristic position=heart==null?null:heart.getCharacteristic(HEART_VALUE);
                    deviceState.put("detail", position==null?"此设备不支持糖心实时定位":"正在开启位置接收");
                    deviceState.put("gnssStatus",position==null?"unsupported":"subscribing");
                    emit("bleDevice", deviceState);
                    if(position!=null) {
                        BluetoothGattDescriptor cccd=position.getDescriptor(CCCD);
                        if((position.getProperties()&BluetoothGattCharacteristic.PROPERTY_NOTIFY)==0 || cccd==null || !gatt.setCharacteristicNotification(position,true))throw new Exception("无法订阅定位通知");
                        cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                        if(!gatt.writeDescriptor(cccd))throw new Exception("订阅请求未发送");
                        handler.postDelayed(()->{if(connection==gatt&&!deviceState.optBoolean("trackSyncReady")){disconnect();publishError("没有收到糖心有效数据，请检查固件后重新连接");}},15000);
                        return;
                    }
                    BluetoothGattService battery = gatt.getService(UUID.fromString("0000180f-0000-1000-8000-00805f9b34fb"));
                    BluetoothGattCharacteristic value = battery == null ? null : battery.getCharacteristic(UUID.fromString("00002a19-0000-1000-8000-00805f9b34fb"));
                    if (value != null && (value.getProperties() & BluetoothGattCharacteristic.PROPERTY_READ) != 0) gatt.readCharacteristic(value);
                } catch (Exception e) { disconnect(); publishError("没有成功读取设备服务，请重试"); }
            });
        }
        @Override public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) { byte[] value = characteristic.getValue(); batteryResult(gatt, status, value); }
        @Override public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value, int status) { batteryResult(gatt, status, value); }
        @Override public void onDescriptorWrite(BluetoothGatt gatt,BluetoothGattDescriptor descriptor,int status){handler.post(()->{
            if(gatt!=connection||!CCCD.equals(descriptor.getUuid()))return;
            if(status!=BluetoothGatt.GATT_SUCCESS){disconnect();publishError("位置通知订阅失败，请重新连接");return;}
            lastPacketAt=android.os.SystemClock.elapsedRealtime();handler.removeCallbacks(freshnessTask);handler.postDelayed(freshnessTask,1000);
        });}
        @Override public void onCharacteristicChanged(BluetoothGatt gatt,BluetoothGattCharacteristic c){if(HEART_VALUE.equals(c.getUuid()))receive(gatt,c.getValue());}
        @Override public void onCharacteristicChanged(BluetoothGatt gatt,BluetoothGattCharacteristic c,byte[] value){if(HEART_VALUE.equals(c.getUuid()))receive(gatt,value);}
    };
    private void receive(BluetoothGatt gatt,byte[] bytes){
        final HeartPacket p=HeartPacket.decode(bytes==null?null:bytes.clone());if(p==null)return;
        handler.post(()->{
            if(gatt!=connection || !HeartPacket.newer(p.sequence,lastSequence))return;
            lastSequence=p.sequence;lastPacketAt=android.os.SystemClock.elapsedRealtime();
            try{
                deviceState.put("trackSyncReady",true);deviceState.put("fix",p.valid);
                deviceState.put("gnssStatus",!p.nmea?"no_data":p.valid?"fixed":"searching");
                deviceState.put("satellites",p.satellites);deviceState.put("sequence",p.sequence);
                deviceState.put("receivedAt",System.currentTimeMillis());deviceState.put("ageSeconds",p.ageSeconds);
                deviceState.remove("hdop");if(Double.isFinite(p.hdop))deviceState.put("hdop",p.hdop);
                deviceState.remove("lat");deviceState.remove("lon");
                if(p.valid){deviceState.put("lat",p.lat);deviceState.put("lon",p.lon);}
                deviceState.put("coordinateSystem","WGS84");emit("bleDevice",deviceState);
            }catch(Exception ignored){}
        });
    }
    private void batteryResult(BluetoothGatt gatt, int status, byte[] value) {
        if (status != BluetoothGatt.GATT_SUCCESS || value == null || value.length == 0) return;
        int level = value[0] & 255;
        handler.post(() -> { if (gatt != connection || level > 100) return; try { deviceState.put("battery", level); emit("bleDevice", deviceState); } catch (Exception ignored) {} });
    }
    void disconnect() {
        handler.removeCallbacks(freshnessTask);lastSequence=-1;lastPacketAt=0;
        BluetoothGatt old = connection; connection = null;
        if (old != null) { try { old.disconnect(); old.close(); } catch (Exception ignored) {} }
        try { deviceState.put("status", "disconnected");deviceState.put("trackSyncReady",false);deviceState.put("fix",false);deviceState.put("gnssStatus","disconnected");deviceState.remove("lat");deviceState.remove("lon");deviceState.remove("battery");emit("bleDevice",deviceState); } catch (Exception ignored) {}
    }
    void destroy() { stopScan(); disconnect(); handler.removeCallbacksAndMessages(null); }
}
