package org.telegram.ui;

    import android.content.Context;
    import android.database.Cursor;
    import android.database.sqlite.SQLiteDatabase;
    import android.net.Uri;
    import android.util.Base64;
    import android.widget.Toast;

    import org.json.JSONObject;
    import org.telegram.messenger.AndroidUtilities;
    import org.telegram.messenger.ApplicationLoader;
    import org.telegram.messenger.UserConfig;
    import org.telegram.tgnet.TLRPC;

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

        /** Entry point for URI-based import (file picker) */
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
                File tmpCopy = null;
                try {
                    File file = new File(filePath);
                    if (!file.exists()) { errorOnUI(cb, "File not found: " + filePath); return; }

                    // SELinux blocks SQLite from opening external files directly.
                    // Copy to app cache dir first so SQLite can access it.
                    tmpCopy = new File(ctx.getCacheDir(), "import_session_tmp.db");
                    try (FileInputStream fis = new FileInputStream(file);
                         FileOutputStream fos = new FileOutputStream(tmpCopy)) {
                        byte[] buf = new byte[8192]; int n;
                        while ((n = fis.read(buf)) != -1) fos.write(buf, 0, n);
                    }
                    File workFile = tmpCopy;

                    switch (format) {
                        case TELETHON:  importTelethonFile(ctx, workFile, cb); break;
                        case PYROGRAM:  importPyrogramFile(ctx, workFile, cb); break;
                        case JSON:      importJsonFile(workFile, ctx, cb);     break;
                        case TDATA:
                            AndroidUtilities.runOnUIThread(() ->
                                Toast.makeText(ctx, "TDATA: поддержка скоро появится", Toast.LENGTH_LONG).show());
                            break;
                    }
                } catch (Exception e) {
                    errorOnUI(cb, e.getMessage() != null ? e.getMessage() : "Unknown error");
                } finally {
                    if (tmpCopy != null) tmpCopy.delete();
                }
            }).start();
        }

        private static void importTelethon(Context ctx, Uri uri, ImportCallback cb) throws Exception {
            File tmp = copyToTemp(ctx, uri, "tl_session.db");
            try { importTelethonFile(ctx, tmp, cb); } finally { tmp.delete(); }
        }

        private static void importTelethonFile(Context ctx, File file, ImportCallback cb) throws Exception {
            SQLiteDatabase db = SQLiteDatabase.openDatabase(
                file.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
            Cursor c = db.rawQuery("SELECT dc_id, auth_key FROM sessions LIMIT 1", null);
            if (!c.moveToFirst()) { c.close(); db.close(); errorOnUI(cb, "sessions table is empty"); return; }
            int dcId       = c.getInt(0);
            byte[] authKey = c.getBlob(1);
            c.close();

            // Try to get user_id from entities table (Telethon stores seen entities there)
            long userId = 0;
            try {
                // update_state id=0 is the main state; entities stores users/chats.
                // The self-user entity is typically the one with the smallest positive id
                // added first (rowid=1) after the initial connection.
                Cursor ec = db.rawQuery(
                    "SELECT id FROM entities WHERE id > 0 ORDER BY rowid ASC LIMIT 1", null);
                if (ec.moveToFirst()) {
                    userId = ec.getLong(0);
                }
                ec.close();
            } catch (Exception ignored) {}

            db.close();
            if (authKey == null || authKey.length < 256) { errorOnUI(cb, "auth_key too short"); return; }
            applyAuthKey(ctx, dcId, authKey, userId, cb);
        }

        private static void importPyrogram(Context ctx, Uri uri, ImportCallback cb) throws Exception {
            File tmp = copyToTemp(ctx, uri, "pyro_session.db");
            try { importPyrogramFile(ctx, tmp, cb); } finally { tmp.delete(); }
        }

        private static void importPyrogramFile(Context ctx, File file, ImportCallback cb) throws Exception {
            SQLiteDatabase db = SQLiteDatabase.openDatabase(
                file.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
            // Pyrogram v2 stores user_id directly in sessions table
            Cursor c = db.rawQuery("SELECT dc_id, auth_key, user_id FROM sessions LIMIT 1", null);
            if (!c.moveToFirst()) {
                c.close();
                // Fallback: older Pyrogram schema without user_id column
                c = db.rawQuery("SELECT dc_id, auth_key FROM sessions LIMIT 1", null);
                if (!c.moveToFirst()) { c.close(); db.close(); errorOnUI(cb, "sessions table is empty"); return; }
            }
            int dcId = c.getInt(0);
            byte[] authKey;
            int colType = c.getType(1);
            if (colType == Cursor.FIELD_TYPE_BLOB) {
                authKey = c.getBlob(1);
            } else {
                String b64 = c.getString(1);
                authKey = Base64.decode(b64, Base64.DEFAULT);
            }
            long userId = 0;
            if (c.getColumnCount() > 2 && !c.isNull(2)) {
                userId = c.getLong(2);
            }
            c.close(); db.close();
            if (authKey == null || authKey.length < 256) { errorOnUI(cb, "auth_key invalid"); return; }
            applyAuthKey(ctx, dcId, authKey, userId, cb);
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
            long userId = json.optLong("user_id", 0);
            applyAuthKey(ctx, dcId, authKey, userId, cb);
        }

        private static byte[] readAllBytes(InputStream is) throws Exception {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int len;
            while ((len = is.read(buf)) != -1) baos.write(buf, 0, len);
            return baos.toByteArray();
        }

        private static void applyAuthKey(Context ctx, int dcId, byte[] authKey, long userId, ImportCallback cb) {
            int slot = findFreeSlot();
            if (slot == -1) {
                errorOnUI(cb, "Нет свободного слота. Максимум " + UserConfig.MAX_ACCOUNT_COUNT + " аккаунтов");
                return;
            }
            try {
                String prefsName = "userconfing" + (slot == 0 ? "" : slot);
                android.content.SharedPreferences prefs = ApplicationLoader.applicationContext
                    .getSharedPreferences(prefsName, Context.MODE_PRIVATE);
                android.content.SharedPreferences.Editor ed = prefs.edit();
                ed.putString("dc" + dcId + "_auth_key", Base64.encodeToString(authKey, Base64.NO_WRAP));
                ed.putInt("selectedDcId" + slot, dcId);
                ed.putInt("currentDcId" + slot, dcId);
                ed.putBoolean("account_activated" + slot, true);
                if (userId != 0) {
                    ed.putLong("clientUserId" + slot, userId);
                }
                ed.apply();

                UserConfig uc = UserConfig.getInstance(slot);
                uc.registeredForPush = false;

                // If we know the user ID, set a minimal user object so getCurrentUser()
                // doesn't return null until the real data arrives from Telegram servers.
                if (userId != 0) {
                    try {
                        TLRPC.TL_user minUser = new TLRPC.TL_user();
                        minUser.id = userId;
                        minUser.self = true;
                        minUser.first_name = "...";
                        uc.setCurrentUser(minUser);
                        uc.saveConfig(true);
                    } catch (Exception ignored) {
                        uc.saveConfig(false);
                    }
                } else {
                    uc.saveConfig(false);
                }

                final int finalSlot = slot;
                AndroidUtilities.runOnUIThread(() -> cb.onSuccess(finalSlot));
            } catch (Exception e) {
                errorOnUI(cb, "applyAuthKey failed: " + e.getMessage());
            }
        }

        /**
         * Find first slot that is free: not activated by Nagram AND has no
         * session-import activation flag in SharedPrefs.
         */
        private static int findFreeSlot() {
            for (int i = 0; i < UserConfig.MAX_ACCOUNT_COUNT; i++) {
                if (UserConfig.getInstance(i).isClientActivated()) continue;
                // Also check our own SharedPrefs flag to avoid re-using a slot
                // we already wrote to (e.g. after import but before restart)
                String prefsName = "userconfing" + (i == 0 ? "" : i);
                android.content.SharedPreferences prefs = ApplicationLoader.applicationContext
                    .getSharedPreferences(prefsName, Context.MODE_PRIVATE);
                if (!prefs.getBoolean("account_activated" + i, false)) {
                    return i;
                }
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
