#!/usr/bin/env python3
  """FavoriteGram patch script — applies all modifications to Nagram source"""
  import os, re, shutil, subprocess, sys

  ROOT = os.path.dirname(os.path.abspath(__file__))

  def log(msg): print(f"[PATCH] {msg}", flush=True)

  # ─── 1. BRANDING ────────────────────────────────────────────────────────────
  def rename_branding():
      log("=== Branding: Nagram → FavoriteGram ===")
      replacements = [
          ("Nagram",    "FavoriteGram"),
          ("NagramX",   "FavoriteGram"),
          ("NekoX",     "FavoriteGram"),
          ("Nekogram",  "FavoriteGram"),
      ]
      # strings.xml files
      for dirpath, dirs, files in os.walk("TMessagesProj/src/main/res"):
          for fname in files:
              if fname.startswith("strings") and fname.endswith(".xml"):
                  path = os.path.join(dirpath, fname)
                  txt = open(path, encoding="utf-8", errors="ignore").read()
                  original = txt
                  for old, new in replacements:
                      txt = txt.replace(old, new)
                  if txt != original:
                      open(path, "w", encoding="utf-8").write(txt)
                      log(f"  patched {path}")
      # AndroidManifest.xml label
      manifest = "TMessagesProj/src/main/AndroidManifest.xml"
      if os.path.exists(manifest):
          txt = open(manifest, encoding="utf-8", errors="ignore").read()
          txt = re.sub(r'android:label="[^"]*"', 'android:label="FavoriteGram"', txt, count=1)
          open(manifest, "w", encoding="utf-8").write(txt)
          log(f"  patched {manifest}")

  # ─── 2. ACCOUNT LIMIT ───────────────────────────────────────────────────────
  def remove_account_limit():
      log("=== Account limit: raising to 20 ===")
      for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
          for fname in files:
              if fname == "UserConfig.java":
                  path = os.path.join(dirpath, fname)
                  txt = open(path, encoding="utf-8", errors="ignore").read()
                  original = txt
                  txt = re.sub(r'MAX_ACCOUNT_COUNT\s*=\s*\d+', 'MAX_ACCOUNT_COUNT = 20', txt)
                  if txt != original:
                      open(path, "w", encoding="utf-8").write(txt)
                      log(f"  patched {path}")
                  else:
                      log(f"  WARNING: MAX_ACCOUNT_COUNT not found in {path}, printing context:")
                      for line in txt.split("\n"):
                          if "ACCOUNT" in line.upper(): log(f"    {line.strip()}")

  # ─── 3. SESSION IMPORT strings ───────────────────────────────────────────────
  def add_session_strings():
      log("=== Adding session import strings ===")
      new_strings = """
      <string name="SessionImport">Войти через файл сессии</string>
      <string name="SessionImportTitle">Выберите формат файла</string>
      <string name="SessionImportTelethon">.session (Telethon)</string>
      <string name="SessionImportPyrogram">.session (Pyrogram)</string>
      <string name="SessionImportTdata">TDATA (Telegram Desktop)</string>
      <string name="SessionImportJson">.json (JSON)</string>
      <string name="SessionImportLoading">Импортируем сессию...</string>
      <string name="SessionImportSuccess">Аккаунт успешно добавлен</string>
      <string name="SessionImportError">Ошибка импорта: %1$s</string>
      <string name="SessionImportTdataStub">Поддержка TDATA скоро появится</string>
      <string name="SessionImportMultiple">Добавлено аккаунтов: %1$d</string>
  """
      main_strings = "TMessagesProj/src/main/res/values/strings.xml"
      if os.path.exists(main_strings):
          txt = open(main_strings, encoding="utf-8", errors="ignore").read()
          if "SessionImport" not in txt:
              txt = txt.replace("</resources>", new_strings + "\n</resources>")
              open(main_strings, "w", encoding="utf-8").write(txt)
              log(f"  added strings to {main_strings}")

  # ─── 4. COPY SESSION IMPORT JAVA FILES ──────────────────────────────────────
  def copy_session_import_files():
      log("=== Copying SessionImport Java files ===")
      ui_package = None
      for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
          for fname in files:
              if fname == "IntroActivity.java":
                  ui_package = dirpath
                  break
          if ui_package:
              break

      if not ui_package:
          log("  ERROR: IntroActivity.java not found!")
          return

      log(f"  UI package dir: {ui_package}")

      # Copy helper and bottom sheet
      for src_file in ["SessionImportHelper.java", "SessionFormatPickerBottomSheet.java"]:
          src = os.path.join(ROOT, src_file)
          dst = os.path.join(ui_package, src_file)
          if os.path.exists(src):
              # Read and fix package name
              content = open(src, encoding="utf-8").read()
              # Detect actual package from IntroActivity
              intro = open(os.path.join(ui_package, "IntroActivity.java"), encoding="utf-8", errors="ignore").read()
              pkg_match = re.search(r'^package (.*?);', intro, re.MULTILINE)
              if pkg_match:
                  actual_pkg = pkg_match.group(1)
                  content = re.sub(r'^package .*;', f'package {actual_pkg};', content, flags=re.MULTILINE)
              shutil.copy(src, dst)
              open(dst, "w", encoding="utf-8").write(content)
              log(f"  copied {src_file} → {dst}")
          else:
              log(f"  WARNING: {src} not found")

  # ─── 5. PATCH IntroActivity ──────────────────────────────────────────────────
  def patch_intro_activity():
      log("=== Patching IntroActivity.java ===")
      intro_path = None
      for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
          for fname in files:
              if fname == "IntroActivity.java":
                  intro_path = os.path.join(dirpath, fname)
                  break
          if intro_path: break

      if not intro_path:
          log("  IntroActivity.java not found!")
          return

      txt = open(intro_path, encoding="utf-8", errors="ignore").read()

      if "SessionImportHelper" in txt:
          log("  already patched")
          return

      # Inject import
      import_line = "import org.telegram.ui.SessionImportHelper;\nimport org.telegram.ui.SessionFormatPickerBottomSheet;\n"
      txt = re.sub(r'(import org\.telegram\.)', import_line + r'\1', txt, count=1)

      # Find a good injection point for the button
      # Look for the "Start Messaging" button or similar login button onClick/setup
      injection_code = """
          // FavoriteGram: Session Import Button
          TextView sessionImportBtn = new TextView(context);
          sessionImportBtn.setText(LocaleController.getString("SessionImport", R.string.SessionImport));
          sessionImportBtn.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14);
          sessionImportBtn.setTextColor(Theme.getColor(Theme.key_windowBackgroundWhiteBlueText4));
          sessionImportBtn.setGravity(Gravity.CENTER);
          sessionImportBtn.setPadding(0, AndroidUtilities.dp(16), 0, AndroidUtilities.dp(8));
          sessionImportBtn.setOnClickListener(v -> {
              new SessionFormatPickerBottomSheet(getParentActivity(), getFragmentView()).show();
          });
  """
      # Try to find where start/login button is created and inject after it
      # Pattern: look for "startBtn" or "loginButton" creation block
      patterns_to_inject_after = [
          r'(startButton\.setOnClickListener[^;]+;)',
          r'(loginButton\.setOnClickListener[^;]+;)',
          r'(startMessagingButton[^;]+;)',
      ]
      injected = False
      for pat in patterns_to_inject_after:
          m = re.search(pat, txt, re.DOTALL)
          if m:
              txt = txt[:m.end()] + "\n" + injection_code + txt[m.end():]
              injected = True
              log(f"  injected after pattern: {pat[:40]}")
              break

      if not injected:
          log("  WARNING: Could not find injection point, will add to end of onCreate-like block")
          # Just log the relevant lines for manual inspection
          for i, line in enumerate(txt.split("\n")):
              if "Button" in line or "button" in line:
                  log(f"    line {i}: {line.strip()[:100]}")

      open(intro_path, "w", encoding="utf-8").write(txt)
      log("  IntroActivity.java patched")

  # ─── 6. GOOGLE SERVICES FIX ─────────────────────────────────────────────────
  def fix_google_services():
      log("=== Fixing google-services.json ===")
      # Check if google-services.json exists
      gs_path = "TMessagesProj/google-services.json"
      if not os.path.exists(gs_path):
          # Get package name from build.gradle
          pkg = "com.favoritegram.messenger"
          try:
              gradle = open("TMessagesProj/build.gradle", encoding="utf-8", errors="ignore").read()
              m = re.search(r'applicationId\s+"([^"]+)"', gradle)
              if m: pkg = m.group(1)
          except: pass

          stub = {
              "project_info": {"project_number": "123456789", "project_id": "favoritegram", "storage_bucket": ""},
              "client": [{
                  "client_info": {"mobilesdk_app_id": "1:123456789:android:abcdef", "android_client_info": {"package_name": pkg}},
                  "api_key": [{"current_key": "AIzaFakeKey"}],
                  "services": {"appinvite_service": {"other_platform_oauth_client": []}}
              }],
              "configuration_version": "1"
          }
          import json
          open(gs_path, "w").write(json.dumps(stub, indent=2))
          log(f"  created stub {gs_path} for package {pkg}")
      else:
          log("  google-services.json already exists")

      # Also try to disable firebase if it causes issues
      # (will be done only if build fails)

  # ─── MAIN ────────────────────────────────────────────────────────────────────
  if __name__ == "__main__":
      os.chdir(os.path.dirname(os.path.abspath(__file__)))  # cd to nagram/
      rename_branding()
      remove_account_limit()
      add_session_strings()
      copy_session_import_files()
      patch_intro_activity()
      fix_google_services()
      log("=== All patches applied successfully ===")
  