package com.xinzai.app;

import android.bluetooth.*;
import android.bluetooth.le.*;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.*;
import java.util.*;

/** Discovery and read-only GATT inspection; no guessed writes to an unknown tracker. */
final class BluetoothController {
    interface Listener { void event(String type, JSONObject data); }
    private final Context context;
    private final Listener listener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<String, BluetoothDevice> devices = new LinkedHashMap<>();
    private final Map<String, JSONObject> results = new LinkedHashMap<>();
    private BluetoothLeScanner scanner;
    private BluetoothGatt connection;
    private JSONObject deviceState = new JSONObject();
    private boolean scanning;
    private final Runnable stopTask = () -> stopScan();

    BluetoothController(Context context, Listener listener) { this.context = context; this.listener = listener; }
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
    private void publish() { try { JSONObject payload = new JSONObject(); payload.put("scanning", scanning); payload.put("devices", new JSONArray(results.values())); listener.event("bleScan", payload); } catch (Exception ignored) {} }
    private void publishError(String message) { try { JSONObject payload = new JSONObject(); payload.put("error", message); payload.put("scanning", false); listener.event("bleScan", payload); } catch (Exception ignored) {} }
    void stopScan() {
        handler.removeCallbacks(stopTask);
        if (scanner != null && scanning) try { scanner.stopScan(callback); } catch (Exception ignored) {}
        scanning = false; publish();
    }
    void connect(String address) throws Exception {
        BluetoothDevice device = devices.get(address);
        if (device == null) throw new Exception("请先扫描，再选择本轮发现的设备");
        stopScan(); disconnect();
        deviceState = new JSONObject();
        deviceState.put("id", address); deviceState.put("name", results.get(address).optString("name"));
        deviceState.put("status", "connecting"); deviceState.put("trackSyncReady", false);
        listener.event("bleDevice", deviceState);
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
                    } else { deviceState.put("status", "disconnected"); deviceState.put("detail", "设备已断开，状态码 " + status); listener.event("bleDevice", deviceState); gatt.close(); connection = null; }
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
                    deviceState.put("detail", "BLE 连接已建立；糖心轨迹协议尚未接入");
                    listener.event("bleDevice", deviceState);
                    BluetoothGattService battery = gatt.getService(UUID.fromString("0000180f-0000-1000-8000-00805f9b34fb"));
                    BluetoothGattCharacteristic value = battery == null ? null : battery.getCharacteristic(UUID.fromString("00002a19-0000-1000-8000-00805f9b34fb"));
                    if (value != null && (value.getProperties() & BluetoothGattCharacteristic.PROPERTY_READ) != 0) gatt.readCharacteristic(value);
                } catch (Exception e) { disconnect(); publishError("没有成功读取设备服务，请重试"); }
            });
        }
        @Override public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) { byte[] value = characteristic.getValue(); batteryResult(gatt, status, value); }
        @Override public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value, int status) { batteryResult(gatt, status, value); }
    };
    private void batteryResult(BluetoothGatt gatt, int status, byte[] value) {
        if (status != BluetoothGatt.GATT_SUCCESS || value == null || value.length == 0) return;
        int level = value[0] & 255;
        handler.post(() -> { if (gatt != connection || level > 100) return; try { deviceState.put("battery", level); listener.event("bleDevice", deviceState); } catch (Exception ignored) {} });
    }
    void disconnect() {
        BluetoothGatt old = connection; connection = null;
        if (old != null) { try { old.disconnect(); old.close(); } catch (Exception ignored) {} }
        try { deviceState.put("status", "disconnected"); deviceState.remove("battery"); listener.event("bleDevice", deviceState); } catch (Exception ignored) {}
    }
    void destroy() { stopScan(); disconnect(); handler.removeCallbacksAndMessages(null); }
}
