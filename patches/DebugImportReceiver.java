package org.telegram.ui;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.widget.Toast;

import org.telegram.messenger.AndroidUtilities;

/**
 * FavoriteGram debug receiver.
 * Usage:
 *   adb shell am broadcast -a xyz.nextalone.nagram.DEBUG_IMPORT \
 *     -n xyz.nextalone.nagram/org.telegram.ui.DebugImportReceiver \
 *     --es path "/storage/emulated/0/Download/234656378.session" \
 *     --es format TELETHON
 */
public class DebugImportReceiver extends BroadcastReceiver {

    public static final String ACTION = "xyz.nextalone.nagram.DEBUG_IMPORT";
    private static final String TAG = "FavoriteGram";

    @Override
    public void onReceive(final Context ctx, Intent intent) {
        Log.i(TAG, "DebugImportReceiver.onReceive: " + intent.getAction());
        String path   = intent.getStringExtra("path");
        String fmtStr = intent.getStringExtra("format");

        if (path == null || path.isEmpty()) {
            Log.e(TAG, "DEBUG_IMPORT: missing 'path' extra");
            showToast(ctx, "DEBUG_IMPORT: missing path extra");
            return;
        }

        SessionImportHelper.SessionFormat format = SessionImportHelper.SessionFormat.TELETHON;
        if (fmtStr != null) {
            try {
                format = SessionImportHelper.SessionFormat.valueOf(fmtStr.toUpperCase());
            } catch (IllegalArgumentException e) {
                Log.w(TAG, "DEBUG_IMPORT: unknown format '" + fmtStr + "', defaulting to TELETHON");
            }
        }

        Log.i(TAG, "DEBUG_IMPORT: path=" + path + " format=" + format);
        final SessionImportHelper.SessionFormat finalFormat = format;
        final String finalPath = path;

        SessionImportHelper.importFromPath(ctx.getApplicationContext(), finalPath, finalFormat,
            new SessionImportHelper.ImportCallback() {
                @Override
                public void onSuccess(int slot) {
                    Log.i(TAG, "DEBUG_IMPORT: SUCCESS slot=" + slot);
                    showToast(ctx, "Добавлено аккаунтов: 1 (slot=" + slot + ")");
                }

                @Override
                public void onError(String error) {
                    Log.e(TAG, "DEBUG_IMPORT: ERROR " + error);
                    showToast(ctx, "Ошибка: " + error);
                }
            });
    }

    private static void showToast(Context ctx, String msg) {
        AndroidUtilities.runOnUIThread(() ->
            Toast.makeText(ctx.getApplicationContext(), msg, Toast.LENGTH_LONG).show());
    }
}
