package com.xinzai.app;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.location.*;
import android.os.*;
import org.json.*;

/** A user-started, visible foreground journey. No always-on/background permission. */
public class LocationRecorder extends Service implements LocationListener {
    static final String FILE = "journey.json", CHANNEL = "xinzai_journey";
    static volatile boolean running = false;
    private LocationManager manager;
    private JSONObject journey;
    private int segment = 0;

    static synchronized JSONObject snapshot(Context context) {
        try {
            String raw = LocalStore.read(context, FILE);
            JSONObject value = raw.isEmpty() ? new JSONObject() : new JSONObject(raw);
            if ("recording".equals(value.optString("status")) && !running) value.put("status", "interrupted");
            return value;
        } catch (Exception e) { return new JSONObject(); }
    }

    static synchronized void prepare(Context context, String title, boolean resume) throws JSONException {
        JSONObject value = resume ? snapshot(context) : new JSONObject();
        if (!resume || !value.has("id")) {
            value = new JSONObject();
            value.put("id", "trip-" + System.currentTimeMillis());
            value.put("title", title);
            value.put("started", System.currentTimeMillis());
            value.put("points", new JSONArray());
            value.put("segment", 0);
        } else value.put("segment", value.optInt("segment") + 1);
        value.put("status", "starting");
        value.put("source", "phone");
        value.put("coordinateSystem", "WGS84");
        if (!LocalStore.write(context, FILE, value.toString())) throw new JSONException("无法保存旅程，请检查手机储存空间");
    }

    @Override public void onCreate() {
        super.onCreate();
        manager = (LocationManager) getSystemService(LOCATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "同行路线记录", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("主动开始旅程时展示记录状态，可随时暂停。");
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? "" : intent.getAction();
        if ("pause".equals(action) || "stop".equals(action)) {
            finish("pause".equals(action) ? "paused" : "finished");
            return START_NOT_STICKY;
        }
        try {
            journey = new JSONObject(LocalStore.read(this, FILE));
            segment = journey.optInt("segment");
            Intent open = new Intent(this, MainActivity.class);
            PendingIntent activity = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Intent pause = new Intent(this, LocationRecorder.class).setAction("pause");
            PendingIntent pauseIntent = PendingIntent.getService(this, 2, pause, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification notification = new Notification.Builder(this, CHANNEL)
                    .setSmallIcon(R.drawable.ic_notification).setContentTitle("心仔 · 正在记录同行路线")
                    .setContentText("手机定位记录中，点此返回；可随时暂停。")
                    .setContentIntent(activity).setOngoing(true)
                    .addAction(new Notification.Action.Builder(null, "暂停记录", pauseIntent).build()).build();
            if (Build.VERSION.SDK_INT >= 29) startForeground(7, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(7, notification);
            boolean any = false;
            for (String provider : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                if (manager.isProviderEnabled(provider)) {
                    manager.requestLocationUpdates(provider, 5000, 5f, this, Looper.getMainLooper());
                    any = true;
                }
            }
            if (!any) throw new IllegalStateException("手机定位未开启，请开启后继续旅程");
            running = true;
            journey.put("status", "recording");
            journey.remove("error");
            persist();
        } catch (Exception e) {
            try { if (journey == null) journey = new JSONObject(); journey.put("error", "无法启动定位：" + e.getMessage()); } catch (Exception ignored) {}
            finish("interrupted");
        }
        return START_NOT_STICKY;
    }

    @Override public void onLocationChanged(Location location) {
        if (!running || location == null || journey == null) return;
        try {
            long now = System.currentTimeMillis();
            if (now - location.getTime() > 60000 || location.getTime() > now + 5000) return;
            if (!location.hasAccuracy() || location.getAccuracy() > 150) {
                journey.put("quality", "定位精度不足，正在等待更准确的位置"); persist(); return;
            }
            JSONArray points = journey.getJSONArray("points");
            if (points.length() >= 50000) { journey.put("error", "本段旅程已达到 50000 个点，请保存后开始新旅程"); finish("paused"); return; }
            if (points.length() > 0) {
                JSONObject last = points.getJSONObject(points.length() - 1);
                long delta = location.getTime() - last.getLong("time");
                if (delta < 4000) return;
                if (delta > 120000 && last.optInt("segment") == segment) segment++;
                if (delta <= 120000 && last.optInt("segment") == segment) {
                    float[] distance = new float[1];
                    Location.distanceBetween(last.getDouble("lat"), last.getDouble("lon"), location.getLatitude(), location.getLongitude(), distance);
                    if (distance[0] / (delta / 1000.0) > 150) return;
                }
            }
            JSONObject point = new JSONObject();
            point.put("lat", location.getLatitude()); point.put("lon", location.getLongitude());
            point.put("time", location.getTime()); point.put("accuracy", location.getAccuracy());
            point.put("segment", segment);
            points.put(point);
            journey.put("segment", segment);
            journey.put("lastUpdate", now);
            journey.put("quality", "精度约 " + Math.round(location.getAccuracy()) + " 米");
            persist();
        } catch (Exception e) { finish("interrupted"); }
    }

    private void persist() {
        if (!LocalStore.write(this, FILE, journey.toString())) {
            if (manager != null) manager.removeUpdates(this);
            running = false;
            stopForeground(true);
            stopSelf();
        }
    }

    private void finish(String status) {
        if (manager != null) manager.removeUpdates(this);
        running = false;
        try {
            if (journey == null) journey = new JSONObject(LocalStore.read(this, FILE));
            journey.put("status", status);
            journey.put("updated", System.currentTimeMillis());
            LocalStore.write(this, FILE, journey.toString());
        } catch (Exception ignored) {}
        stopForeground(true);
        stopSelf();
    }
    @Override public void onProviderDisabled(String provider) { try { if (journey != null) { journey.put("quality", "定位服务暂时不可用，请检查系统定位开关"); persist(); } } catch (Exception ignored) {} }
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() { if (manager != null) manager.removeUpdates(this); running = false; super.onDestroy(); }
}
