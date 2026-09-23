package com.xinzai.app;

import android.content.Context;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** All state stays in the application's private directory; never an external URL. */
final class LocalStore {
    static synchronized String read(Context context, String name) {
        try { return new String(new AtomicFile(new File(context.getFilesDir(), name)).readFully(), StandardCharsets.UTF_8); }
        catch (IOException e) { return ""; }
    }
    static synchronized boolean write(Context context, String name, String value) {
        AtomicFile file = new AtomicFile(new File(context.getFilesDir(), name));
        FileOutputStream stream = null;
        try {
            if (value.length() > 32 * 1024 * 1024) return false;
            new JSONObject(value);
            stream = file.startWrite();
            stream.write(value.getBytes(StandardCharsets.UTF_8));
            file.finishWrite(stream);
            return true;
        } catch (Exception e) { if (stream != null) file.failWrite(stream); return false; }
    }
}
