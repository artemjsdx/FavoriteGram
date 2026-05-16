package org.telegram.ui;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.util.Base64;
import android.widget.Toast;

import org.json.JSONObject;
import org.telegram.messenger.AndroidUtilities;
import org.telegram.messenger.UserConfig;
import org.telegram.tgnet.ConnectionsManager;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

public class SessionImportHelper {

    public enum SessionFormat { TELETHON, PYROGRAM, JSON, TDATA }

    public interface ImportCallback {
        void onSuccess(int accountNum);
        void onError(String error);
    }

    private static final String[] DC_IPS = {
        "", "149.154.175.53", "149.154.167.51",
        "149.154.175.100", "149.154.167.91", "91.108.56.130"
    };

    public static void importSession(Context ctx, Uri uri, SessionFormat format, ImportCallback cb) {
        new Thread(() -> {
            try {
                switch (format) {
                    case TELETHON:  importTelethon(ctx, uri, cb); break;
                    case PYROGRAM:  importPyrogram(ctx, uri, cb); break;
                    case JSON:      importJson(ctx, uri, cb);     break;
                    case TDATA:
                        AndroidUtilities.runOnUIThread(() ->
                            Toast.makeText(ctx, "TDATA: \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430 \u0441\u043a\u043e\u0440\u043e \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f", Toast.LENGTH_LONG).show());
                        break;
                }
            } catch (Exception e) {
                cb.onError(e.getMessage() != null ? e.getMessage() : "Unknown error");
            }
        }).start();
    }

    private static void importTelethon(Context ctx, Uri uri, ImportCallback cb) throws Exception {
        File tmp = copyToTemp(ctx, uri, "tl_session.db");
        try {
            SQLiteDatabase db = SQLiteDatabase.openDatabase(
                tmp.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
            Cursor c = db.rawQuery("SELECT dc_id, auth_key FROM sessions LIMIT 1", null);
            if (!c.moveToFirst()) { c.close(); db.close(); cb.onError("sessions table is empty"); return; }
            int dcId       = c.getInt(0);
            byte[] authKey = c.getBlob(1);
            c.close(); db.close();
            if (authKey == null || authKey.length < 256) { cb.onError("auth_key too short"); return; }
            applyAuthKey(ctx, dcId, authKey, cb);
        } finally { tmp.delete(); }
    }

    private static void importPyrogram(Context ctx, Uri uri, ImportCallback cb) throws Exception {
        File tmp = copyToTemp(ctx, uri, "pyro_session.db");
        try {
            SQLiteDatabase db = SQLiteDatabase.openDatabase(
                tmp.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
            Cursor c = db.rawQuery("SELECT dc_id, auth_key FROM sessions LIMIT 1", null);
            if (!c.moveToFirst()) { c.close(); db.close(); cb.onError("sessions table is empty"); return; }
            int dcId = c.getInt(0);
            byte[] authKey;
            int colType = c.getType(1);
            if (colType == Cursor.FIELD_TYPE_BLOB) {
                authKey = c.getBlob(1);
            } else {
                String b64 = c.getString(1);
                authKey = Base64.decode(b64, Base64.DEFAULT);
            }
            c.close(); db.close();
            if (authKey == null || authKey.length < 256) { cb.onError("auth_key invalid"); return; }
            applyAuthKey(ctx, dcId, authKey, cb);
        } finally { tmp.delete(); }
    }

    private static void importJson(Context ctx, Uri uri, ImportCallback cb) throws Exception {
        InputStream is = ctx.getContentResolver().openInputStream(uri);
        if (is == null) { cb.onError("Cannot open file"); return; }
        byte[] data = readAllBytes(is);
        is.close();
        JSONObject json = new JSONObject(new String(data));
        int dcId = json.optInt("dc_id", 2);
        String b64 = json.optString("auth_key", "");
        if (b64.isEmpty()) { cb.onError("auth_key missing in JSON"); return; }
        byte[] authKey = Base64.decode(b64, Base64.DEFAULT);
        if (authKey.length < 256) { cb.onError("auth_key too short"); return; }
        applyAuthKey(ctx, dcId, authKey, cb);
    }

    private static byte[] readAllBytes(InputStream is) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int len;
        while ((len = is.read(buf)) != -1) {
            baos.write(buf, 0, len);
        }
        return baos.toByteArray();
    }

    private static void applyAuthKey(Context ctx, int dcId, byte[] authKey, ImportCallback cb) {
        int slot = findFreeSlot();
        if (slot == -1) {
            cb.onError("\u041d\u0435\u0442 \u0441\u0432\u043e\u0431\u043e\u0434\u043d\u043e\u0433\u043e \u0441\u043b\u043e\u0442\u0430. \u041c\u0430\u043a\u0441\u0438\u043c\u0443\u043c " + UserConfig.MAX_ACCOUNT_COUNT + " \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u043e\u0432");
            return;
        }
        try {
            android.content.SharedPreferences prefs = ctx.getSharedPreferences(
                "userconfing" + (slot == 0 ? "" : slot), Context.MODE_PRIVATE);
            android.content.SharedPreferences.Editor ed = prefs.edit();
            ed.putString("dc" + dcId + "_auth_key", Base64.encodeToString(authKey, Base64.NO_WRAP));
            ed.putInt("selectedDcId" + slot, dcId);
            ed.putInt("currentDcId" + slot, dcId);
            ed.apply();

            String ip = (dcId > 0 && dcId < DC_IPS.length) ? DC_IPS[dcId] : DC_IPS[2];
            ConnectionsManager cm = ConnectionsManager.getInstance(slot);
            cm.applyDatacenterAddress(dcId, ip, 443);

            UserConfig uc = UserConfig.getInstance(slot);
            uc.setCurrentUser(null);
            uc.registeredForPush = false;
            uc.saveConfig(false);

            final int finalSlot = slot;
            AndroidUtilities.runOnUIThread(() -> cb.onSuccess(finalSlot));
        } catch (Exception e) {
            cb.onError("applyAuthKey failed: " + e.getMessage());
        }
    }

    private static int findFreeSlot() {
        for (int i = 0; i < UserConfig.MAX_ACCOUNT_COUNT; i++) {
            if (!UserConfig.getInstance(i).isClientActivated()) return i;
        }
        return -1;
    }

    private static File copyToTemp(Context ctx, Uri uri, String name) throws Exception {
        File tmp = new File(ctx.getCacheDir(), name);
        InputStream is = ctx.getContentResolver().openInputStream(uri);
        if (is == null) throw new Exception("Cannot open URI");
        FileOutputStream fos = new FileOutputStream(tmp);
        byte[] buf = new byte[8192];
        int len;
        while ((len = is.read(buf)) != -1) fos.write(buf, 0, len);
        fos.close();
        is.close();
        return tmp;
    }
}
