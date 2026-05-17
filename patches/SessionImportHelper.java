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
    import java.security.MessageDigest;

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

                // FG_FIX10: write tgnet.dat binary so native ConnectionsManager loads
                // datacenter with hasAuthKey=1. Without this the account stays "Deleted Account".
                try {
                    writeTgnetDat(ctx, slot, dcId, authKey);
                } catch (Exception e) {
                    try { org.telegram.messenger.FileLog.e(e); } catch (Throwable ignored) {}
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

        // ===== FG_FIX10: tgnet.dat binary writer =====
        // Native tgnet (Datacenter.cpp / ConnectionsManager.cpp) serializes config to a binary
        // file at files/tgnet.dat (slot 0) or files/account{slot}/tgnet.dat (slot>0).
        // We re-create that exact format so the native layer sees hasAuthKey=1 for our DC and can
        // authorize the user. Without this, requests fail with "can't do request without login".

        private static final int CONFIG_VERSION_OUTER = 5;
        private static final int CONFIG_VERSION_DC = 13;
        private static final int BOOL_TRUE  = 0xbc799737;
        private static final int BOOL_FALSE = 0x997275b5;

        /** Telegram production DC addresses (from ConnectionsManager::initDatacenters). */
        private static final String[][] DC_IPV4 = new String[][] {
            null,
            new String[] {"149.154.175.50"},
            new String[] {"149.154.167.51", "95.161.76.100"},
            new String[] {"149.154.175.100"},
            new String[] {"149.154.167.91"},
            new String[] {"149.154.171.5"},
        };
        private static final String[][] DC_IPV6 = new String[][] {
            null,
            new String[] {"2001:b28:f23d:f001:0000:0000:0000:000a"},
            new String[] {"2001:67c:4e8:f002:0000:0000:0000:000a"},
            new String[] {"2001:b28:f23d:f003:0000:0000:0000:000a"},
            new String[] {"2001:67c:4e8:f004:0000:0000:0000:000a"},
            new String[] {"2001:b28:f23f:f005:0000:0000:0000:000a"},
        };

        private static void writeTgnetDat(Context ctx, int slot, int dcId, byte[] authKey) throws Exception {
            File baseDir;
            if (slot == 0) {
                baseDir = ctx.getFilesDir();
            } else {
                baseDir = new File(ctx.getFilesDir(), "account" + slot);
                if (!baseDir.exists()) baseDir.mkdirs();
            }
            File target = new File(baseDir, "tgnet.dat");

            ByteArrayOutputStream inner = new ByteArrayOutputStream();
            writeInt32(inner, CONFIG_VERSION_OUTER);
            writeBool(inner, false);                // testBackend
            writeBool(inner, false);                // clientBlocked
            writeTLString(inner, "");               // lastInitSystemLangcode
            writeBool(inner, true);                 // has current dc
            writeInt32(inner, dcId);                // currentDatacenterId
            writeInt32(inner, 0);                   // timeDifference
            writeInt32(inner, 0);                   // lastDcUpdateTime
            writeInt64(inner, 0L);                  // pushSessionId
            writeBool(inner, false);                // registeredForInternalPush
            writeInt32(inner, (int)(System.currentTimeMillis() / 1000L));  // lastServerTime
            writeInt32(inner, 0);                   // sessionsToDestroy count

            // datacenters: write all 5 production DCs, with authKey only on ours
            writeInt32(inner, 5);
            for (int dc = 1; dc <= 5; dc++) {
                boolean ours = (dc == dcId);
                writeDatacenter(inner, dc, ours ? authKey : null);
            }

            byte[] innerBytes = inner.toByteArray();
            // Outer wrapper: 4-byte size + inner buffer (matches Config::writeConfig in native)
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            writeInt32(out, innerBytes.length);
            out.write(innerBytes);

            // Atomic write
            File tmp = new File(target.getParentFile(), "tgnet.dat.tmp");
            try (FileOutputStream fos = new FileOutputStream(tmp)) {
                fos.write(out.toByteArray());
                fos.getFD().sync();
            }
            if (target.exists()) target.delete();
            if (!tmp.renameTo(target)) {
                try (FileInputStream fis = new FileInputStream(tmp);
                     FileOutputStream fos = new FileOutputStream(target)) {
                    byte[] b = new byte[4096]; int n;
                    while ((n = fis.read(b)) != -1) fos.write(b, 0, n);
                }
                tmp.delete();
            }
        }

        private static void writeDatacenter(ByteArrayOutputStream s, int dcNum, byte[] authKey) throws Exception {
            writeInt32(s, CONFIG_VERSION_DC);       // configVersion (datacenter)
            writeInt32(s, dcNum);                   // datacenterId
            writeInt32(s, 0);                       // lastInitVersion
            writeInt32(s, 0);                       // lastInitMediaVersion

            String[] ipv4 = DC_IPV4[dcNum];
            String[] ipv6 = DC_IPV6[dcNum];
            writeInt32(s, ipv4.length);
            for (String addr : ipv4) {
                writeTLString(s, addr);
                writeInt32(s, 443);
                writeInt32(s, 0);
                writeTLString(s, "");
            }
            writeInt32(s, ipv6.length);
            for (String addr : ipv6) {
                writeTLString(s, addr);
                writeInt32(s, 443);
                writeInt32(s, 1);                   // ipv6 flag
                writeTLString(s, "");
            }
            writeInt32(s, 0);                       // ipv4Download (empty)
            writeInt32(s, 0);                       // ipv6Download (empty)

            writeBool(s, false);                    // isCdnDatacenter

            if (authKey != null) {
                writeInt32(s, authKey.length);
                s.write(authKey);
                writeInt64(s, computeAuthKeyId(authKey));
            } else {
                writeInt32(s, 0);
                writeInt64(s, 0L);
            }
            writeInt32(s, 0);                       // authKeyTemp_len
            writeInt64(s, 0L);                      // authKeyTempId
            writeInt32(s, 0);                       // authKeyMediaTemp_len
            writeInt64(s, 0L);                      // authKeyMediaTempId

            writeInt32(s, authKey != null ? 1 : 0); // authorized (int32)

            writeInt32(s, 0);                       // serverSalts count
            writeInt32(s, 0);                       // mediaServerSalts count
        }

        private static long computeAuthKeyId(byte[] authKey) throws Exception {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] hash = md.digest(authKey);
            long id = 0L;
            for (int i = 7; i >= 0; i--) {
                id = (id << 8) | (hash[12 + i] & 0xFFL);
            }
            return id;
        }

        private static void writeInt32(ByteArrayOutputStream s, int v) {
            s.write(v & 0xFF);
            s.write((v >>> 8) & 0xFF);
            s.write((v >>> 16) & 0xFF);
            s.write((v >>> 24) & 0xFF);
        }

        private static void writeInt64(ByteArrayOutputStream s, long v) {
            for (int i = 0; i < 8; i++) {
                s.write((int)((v >>> (i * 8)) & 0xFF));
            }
        }

        private static void writeBool(ByteArrayOutputStream s, boolean v) {
            writeInt32(s, v ? BOOL_TRUE : BOOL_FALSE);
        }

        private static void writeTLString(ByteArrayOutputStream s, String str) throws Exception {
            byte[] b = str.getBytes("UTF-8");
            writeTLByteArray(s, b);
        }

        private static void writeTLByteArray(ByteArrayOutputStream s, byte[] b) throws Exception {
            int len = b.length;
            int prefixLen;
            if (len <= 253) {
                s.write(len & 0xFF);
                prefixLen = 1;
            } else {
                s.write(254);
                s.write(len & 0xFF);
                s.write((len >>> 8) & 0xFF);
                s.write((len >>> 16) & 0xFF);
                prefixLen = 4;
            }
            s.write(b);
            int total = len + prefixLen;
            int padding = (4 - (total % 4)) % 4;
            for (int i = 0; i < padding; i++) s.write(0);
        }
    }
