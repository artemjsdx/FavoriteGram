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

    import java.io.ByteArrayOutputStream;
    import java.io.File;
    import java.io.FileInputStream;
    import java.io.FileOutputStream;
    import java.io.InputStream;

    public class SessionImportHelper {

        public enum SessionFormat { TELETHON, PYROGRAM, JSON, TDATA }

        public interface ImportCallback {
            void onSuccess(int accountNum);
            void onError(String error);
        }

        private static void errorOnUI(ImportCallback cb, String msg) {
            AndroidUtilities.runOnUIThread(() -> cb.onError(msg));
        }

        /** Entry point for normal URI-based import (from file picker) */
        public static void importSession(Context ctx, Uri uri, SessionFormat format, ImportCallback cb) {
            new Thread(() -> {
                try {
                    switch (format) {
                        case TELETHON:  importTelethon(ctx, uri, cb); break;
                        case PYROGRAM:  importPyrogram(ctx, uri, cb); break;
                        case JSON:      importJson(ctx, uri, cb);     break;
                        case TDATA:
                            AndroidUtilities.runOnUIThread(() ->
                                Toast.makeText(ctx, "TDATA: поддержка скоро появится", Toast.LENGTH_LONG).show());
                            break;
                    }
                } catch (Exception e) {
                    errorOnUI(cb, e.getMessage() != null ? e.getMessage() : "Unknown error");
                }
            }).start();
        }

        /** Entry point for direct file path import (debug/broadcast) */
        public static void importFromPath(Context ctx, String filePath, SessionFormat format, ImportCallback cb) {
            new Thread(() -> {
                try {
                    File file = new File(filePath);
                    if (!file.exists()) { errorOnUI(cb, "File not found: " + filePath); return; }
                    switch (format) {
                        case TELETHON:  importTelethonFile(ctx, file, cb); break;
                        case PYROGRAM:  importPyrogramFile(ctx, file, cb); break;
                        case JSON:      importJsonFile(file, ctx, cb);     break;
                        case TDATA:
                            AndroidUtilities.runOnUIThread(() ->
                                Toast.makeText(ctx, "TDATA: поддержка скоро появится", Toast.LENGTH_LONG).show());
                            break;
                    }
                } catch (Exception e) {
                    errorOnUI(cb, e.getMessage() != null ? e.getMessage() : "Unknown error");
                }
            }).start();
        }

        private static void importTelethon(Context ctx, Uri uri, ImportCallback cb) throws Exception {
            File tmp = copyToTemp(ctx, uri, "tl_session.db");
            try {
                importTelethonFile(ctx, tmp, cb);
            } finally { tmp.delete(); }
        }

        private static void importTelethonFile(Context ctx, File file, ImportCallback cb) throws Exception {
            SQLiteDatabase db = SQLiteDatabase.openDatabase(
                file.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
            Cursor c = db.rawQuery("SELECT dc_id, auth_key FROM sessions LIMIT 1", null);
            if (!c.moveToFirst()) { c.close(); db.close(); errorOnUI(cb, "sessions table is empty"); return; }
            int dcId       = c.getInt(0);
            byte[] authKey = c.getBlob(1);
            c.close(); db.close();
            if (authKey == null || authKey.length < 256) { errorOnUI(cb, "auth_key too short"); return; }
            applyAuthKey(ctx, dcId, authKey, cb);
        }

        private static void importPyrogram(Context ctx, Uri uri, ImportCallback cb) throws Exception {
            File tmp = copyToTemp(ctx, uri, "pyro_session.db");
            try {
                importPyrogramFile(ctx, tmp, cb);
            } finally { tmp.delete(); }
        }

        private static void importPyrogramFile(Context ctx, File file, ImportCallback cb) throws Exception {
            SQLiteDatabase db = SQLiteDatabase.openDatabase(
                file.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
            Cursor c = db.rawQuery("SELECT dc_id, auth_key FROM sessions LIMIT 1", null);
            if (!c.moveToFirst()) { c.close(); db.close(); errorOnUI(cb, "sessions table is empty"); return; }
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
            if (authKey == null || authKey.length < 256) { errorOnUI(cb, "auth_key invalid"); return; }
            applyAuthKey(ctx, dcId, authKey, cb);
        }

        private static void importJson(Context ctx, Uri uri, ImportCallback cb) throws Exception {
            InputStream is = ctx.getContentResolver().openInputStream(uri);
            if (is == null) { errorOnUI(cb, "Cannot open file"); return; }
            byte[] data = readAllBytes(is);
            is.close();
            parseAndImportJson(ctx, data, cb);
        }

        private static void importJsonFile(File file, Context ctx, ImportCallback cb) throws Exception {
            byte[] data = readAllBytes(new FileInputStream(file));
            parseAndImportJson(ctx, data, cb);
        }

        private static void parseAndImportJson(Context ctx, byte[] data, ImportCallback cb) throws Exception {
            JSONObject json = new JSONObject(new String(data));
            int dcId = json.optInt("dc_id", 2);
            String b64 = json.optString("auth_key", "");
            if (b64.isEmpty()) { errorOnUI(cb, "auth_key missing in JSON"); return; }
            byte[] authKey = Base64.decode(b64, Base64.DEFAULT);
            if (authKey.length < 256) { errorOnUI(cb, "auth_key too short"); return; }
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
                errorOnUI(cb, "Нет свободного слота. Максимум " + UserConfig.MAX_ACCOUNT_COUNT + " аккаунтов");
                return;
            }
            try {
                android.content.SharedPreferences prefs = ctx.getSharedPreferences(
                    "userconfing" + (slot == 0 ? "" : slot), Context.MODE_PRIVATE);
                android.content.SharedPreferences.Editor ed = prefs.edit();
                ed.putString("dc" + dcId + "_auth_key", Base64.encodeToString(authKey, Base64.NO_WRAP));
                ed.putInt("selectedDcId" + slot, dcId);
                ed.putInt("currentDcId" + slot, dcId);
                ed.putBoolean("account_activated" + slot, true);
                ed.apply();

                UserConfig uc = UserConfig.getInstance(slot);
                uc.registeredForPush = false;
                uc.saveConfig(false);

                final int finalSlot = slot;
                AndroidUtilities.runOnUIThread(() -> cb.onSuccess(finalSlot));
            } catch (Exception e) {
                errorOnUI(cb, "applyAuthKey failed: " + e.getMessage());
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
