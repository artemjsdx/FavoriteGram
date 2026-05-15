package org.telegram.ui;

  import android.content.Context;
  import android.content.Intent;
  import android.net.Uri;
  import android.view.View;
  import android.widget.LinearLayout;
  import android.widget.TextView;
  import android.widget.Toast;

  import org.telegram.messenger.AndroidUtilities;
  import org.telegram.messenger.LocaleController;
  import org.telegram.ui.ActionBar.BottomSheet;
  import org.telegram.ui.ActionBar.Theme;

  import java.util.ArrayList;
  import java.util.List;

  public class SessionFormatPickerBottomSheet extends BottomSheet {

      private static final int REQUEST_SESSION_FILE = 9901;
      private final Context ctx;

      public SessionFormatPickerBottomSheet(Context context, View parent) {
          super(context, false);
          this.ctx = context;
          setTitle(LocaleController.getString("SessionImportTitle", R.string.SessionImportTitle), true);
          LinearLayout layout = new LinearLayout(context);
          layout.setOrientation(LinearLayout.VERTICAL);
          layout.setPadding(AndroidUtilities.dp(16), 0, AndroidUtilities.dp(16), AndroidUtilities.dp(16));

          String[] labels = {
              LocaleController.getString("SessionImportTelethon", R.string.SessionImportTelethon),
              LocaleController.getString("SessionImportPyrogram", R.string.SessionImportPyrogram),
              LocaleController.getString("SessionImportTdata",    R.string.SessionImportTdata),
              LocaleController.getString("SessionImportJson",     R.string.SessionImportJson)
          };
          SessionImportHelper.SessionFormat[] formats = {
              SessionImportHelper.SessionFormat.TELETHON,
              SessionImportHelper.SessionFormat.PYROGRAM,
              SessionImportHelper.SessionFormat.TDATA,
              SessionImportHelper.SessionFormat.JSON
          };

          for (int i = 0; i < labels.length; i++) {
              final SessionImportHelper.SessionFormat fmt = formats[i];
              TextView row = new TextView(context);
              row.setText(labels[i]);
              row.setTextSize(16);
              row.setTextColor(Theme.getColor(Theme.key_dialogTextBlack));
              row.setPadding(AndroidUtilities.dp(8), AndroidUtilities.dp(14),
                             AndroidUtilities.dp(8), AndroidUtilities.dp(14));
              row.setBackground(Theme.createSelectorDrawable(
                  Theme.getColor(Theme.key_listSelector), 2));
              row.setOnClickListener(v -> {
                  dismiss();
                  openFilePicker(fmt);
              });
              layout.addView(row);
          }
          setCustomView(layout);
      }

      private void openFilePicker(SessionImportHelper.SessionFormat format) {
          Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
          intent.addCategory(Intent.CATEGORY_OPENABLE);
          intent.setType("*/*");
          intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
          if (ctx instanceof android.app.Activity) {
              ((android.app.Activity) ctx).startActivityForResult(
                  intent, REQUEST_SESSION_FILE + format.ordinal());
          }
      }

      public static void handleResult(Context ctx, int requestCode, int resultCode, Intent data) {
          if (resultCode != android.app.Activity.RESULT_OK || data == null) return;
          for (SessionImportHelper.SessionFormat fmt : SessionImportHelper.SessionFormat.values()) {
              if (requestCode == REQUEST_SESSION_FILE + fmt.ordinal()) {
                  List<Uri> uris = new ArrayList<>();
                  if (data.getClipData() != null) {
                      for (int i = 0; i < data.getClipData().getItemCount(); i++)
                          uris.add(data.getClipData().getItemAt(i).getUri());
                  } else if (data.getData() != null) {
                      uris.add(data.getData());
                  }
                  importMultiple(ctx, uris, fmt, 0, new int[]{0});
                  return;
              }
          }
      }

      private static void importMultiple(Context ctx, List<Uri> uris,
              SessionImportHelper.SessionFormat fmt, int index, int[] successCount) {
          if (index >= uris.size()) {
              Toast.makeText(ctx, "Добавлено аккаунтов: " + successCount[0],
                  Toast.LENGTH_LONG).show();
              return;
          }
          SessionImportHelper.importSession(ctx, uris.get(index), fmt,
              new SessionImportHelper.ImportCallback() {
                  @Override public void onSuccess(int accountNum) {
                      successCount[0]++;
                      importMultiple(ctx, uris, fmt, index + 1, successCount);
                  }
                  @Override public void onError(String error) {
                      Toast.makeText(ctx,
                          "Ошибка (#" + (index + 1) + "): " + error,
                          Toast.LENGTH_LONG).show();
                      importMultiple(ctx, uris, fmt, index + 1, successCount);
                  }
              });
      }
  }
  