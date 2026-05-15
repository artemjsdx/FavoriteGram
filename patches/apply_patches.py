#!/usr/bin/env python3
import os, re, shutil, subprocess, sys, json

ROOT = os.path.dirname(os.path.abspath(__file__))

def log(msg):
    print("[PATCH] " + str(msg), flush=True)

# --- 1. BRANDING (only replace TEXT content inside tags, not name= attributes) ---
def rename_branding():
    log("=== Branding: Nagram -> FavoriteGram ===")
    old_names = ["Nagram", "NagramX", "NekoX", "Nekogram"]
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/res"):
        for fname in files:
            if not (fname.startswith("strings") and fname.endswith(".xml")):
                continue
            path = os.path.join(dirpath, fname)
            txt = open(path, encoding="utf-8", errors="ignore").read()
            orig = txt
            # ONLY replace inside tag content (between > and <), not in name= attributes
            def replace_in_content(m):
                content = m.group(1)
                for old in old_names:
                    content = content.replace(old, "FavoriteGram")
                return ">" + content + "<"
            txt = re.sub(r">([^<]+)<", replace_in_content, txt)
            if txt != orig:
                open(path, "w", encoding="utf-8").write(txt)
                log("  patched " + path)
    # Fix AndroidManifest label (android:label="Nagram" -> "FavoriteGram")
    # This is safe to replace in attribute value specifically for label
    manifest = "TMessagesProj/src/main/AndroidManifest.xml"
    if os.path.exists(manifest):
        txt = open(manifest, encoding="utf-8", errors="ignore").read()
        for old in old_names:
            txt = re.sub(r'android:label="' + old + r'"', 'android:label="FavoriteGram"', txt)
        open(manifest, "w", encoding="utf-8").write(txt)
        log("  patched " + manifest)
    # Fix notification channel names in Java (display strings only)
    log("  branding done")

# --- 2. ACCOUNT LIMIT ---
def remove_account_limit():
    log("=== Account limit -> 20 ===")
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
        for fname in files:
            if fname != "UserConfig.java":
                continue
            path = os.path.join(dirpath, fname)
            txt = open(path, encoding="utf-8", errors="ignore").read()
            orig = txt
            txt = re.sub(r"MAX_ACCOUNT_COUNT\s*=\s*\d+", "MAX_ACCOUNT_COUNT = 20", txt)
            if txt != orig:
                open(path, "w", encoding="utf-8").write(txt)
                log("  patched " + path)
            else:
                log("  WARNING: MAX_ACCOUNT_COUNT not found, dumping ACCOUNT lines:")
                for line in txt.split("\n"):
                    if "ACCOUNT" in line.upper(): log("    " + line.strip())

# --- 3. SESSION IMPORT STRINGS ---
def add_session_strings():
    log("=== Adding session import strings ===")
    new_strings = ("""
    <string name="SessionImport">Войти через файл сессии</string>
    <string name="SessionImportTitle">Выберите формат файла</string>
    <string name="SessionImportTelethon">.session (Telethon)</string>
    <string name="SessionImportPyrogram">.session (Pyrogram)</string>
    <string name="SessionImportTdata">TDATA (Telegram Desktop)</string>
    <string name="SessionImportJson">.json (JSON)</string>
    <string name="SessionImportTdataStub">Поддержка TDATA скоро появится</string>
""")
    main_strings = "TMessagesProj/src/main/res/values/strings.xml"
    if not os.path.exists(main_strings):
        log("  strings.xml not found!")
        return
    txt = open(main_strings, encoding="utf-8", errors="ignore").read()
    if "SessionImport" in txt:
        log("  already added")
        return
    txt = txt.replace("</resources>", new_strings + "\n</resources>")
    open(main_strings, "w", encoding="utf-8").write(txt)
    log("  strings added")

# --- 4. COPY SESSION IMPORT JAVA FILES ---
def copy_session_import_files():
    log("=== Copying SessionImport Java files ===")
    ui_package = None
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
        if "IntroActivity.java" in files:
            ui_package = dirpath
            break
    if not ui_package:
        log("  ERROR: IntroActivity.java not found!")
        return
    log("  UI dir: " + ui_package)
    intro_txt = open(os.path.join(ui_package, "IntroActivity.java"), encoding="utf-8", errors="ignore").read()
    pkg_match = re.search(r"^package (.*?);", intro_txt, re.MULTILINE)
    actual_pkg = pkg_match.group(1) if pkg_match else "org.telegram.ui"
    for src_file in ["SessionImportHelper.java", "SessionFormatPickerBottomSheet.java"]:
        src = os.path.join(ROOT, src_file)
        dst = os.path.join(ui_package, src_file)
        if not os.path.exists(src):
            log("  WARNING: " + src + " not found")
            continue
        content = open(src, encoding="utf-8").read()
        content = re.sub(r"^package .*;", "package " + actual_pkg + ";", content, flags=re.MULTILINE)
        open(dst, "w", encoding="utf-8").write(content)
        log("  copied " + src_file + " -> " + dst)

# --- 5. PATCH IntroActivity ---
def patch_intro_activity():
    log("=== Patching IntroActivity.java ===")
    intro_path = None
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
        if "IntroActivity.java" in files:
            intro_path = os.path.join(dirpath, "IntroActivity.java")
            break
    if not intro_path:
        log("  ERROR: IntroActivity.java not found!")
        return
    txt = open(intro_path, encoding="utf-8", errors="ignore").read()
    if "SessionImportHelper" in txt:
        log("  already patched")
        return
    import_line = "import org.telegram.ui.SessionImportHelper;\nimport org.telegram.ui.SessionFormatPickerBottomSheet;\n"
    txt = re.sub(r"(import org\.telegram\.)", import_line + r"\1", txt, count=1)
    injection = """
        // FavoriteGram: Session Import Button
        android.widget.TextView sessionImportBtn = new android.widget.TextView(context);
        sessionImportBtn.setText(org.telegram.messenger.LocaleController.getString("SessionImport", R.string.SessionImport));
        sessionImportBtn.setTextSize(android.util.TypedValue.COMPLEX_UNIT_DIP, 14);
        sessionImportBtn.setGravity(android.view.Gravity.CENTER);
        sessionImportBtn.setPadding(0, org.telegram.messenger.AndroidUtilities.dp(16), 0, org.telegram.messenger.AndroidUtilities.dp(8));
        sessionImportBtn.setOnClickListener(v -> new SessionFormatPickerBottomSheet(getParentActivity(), getFragmentView()).show());
"""
    patterns = [
        r"(startButton\.setOnClickListener[^;]+;)",
        r"(loginButton\.setOnClickListener[^;]+;)",
        r"(startMessagingButton[^;]+setOnClickListener[^;]+;)",
        r"(startBtn\.setOnClickListener[^;]+;)",
    ]
    injected = False
    for pat in patterns:
        m = re.search(pat, txt, re.DOTALL)
        if m:
            txt = txt[:m.end()] + "\n" + injection + txt[m.end():]
            injected = True
            log("  injected after: " + pat[:50])
            break
    if not injected:
        log("  WARNING: No injection point found. Listing button lines:")
        for i, line in enumerate(txt.split("\n")):
            if "Button" in line and ("set" in line or "new" in line):
                log("    " + str(i) + ": " + line.strip()[:120])
    open(intro_path, "w", encoding="utf-8").write(txt)
    log("  IntroActivity patched")

# --- 6. GOOGLE SERVICES FIX ---
def fix_google_services():
    log("=== Fixing google-services.json ===")
    gs_path = "TMessagesProj/google-services.json"
    if os.path.exists(gs_path):
        log("  already exists")
        return
    pkg = "org.telegram.messenger"
    try:
        gradle = open("TMessagesProj/build.gradle", encoding="utf-8", errors="ignore").read()
        m = re.search(r'applicationId\s+"([^"]+)"', gradle)
        if m: pkg = m.group(1)
    except: pass
    stub = {
        "project_info": {"project_number":"123456789","project_id":"favoritegram","storage_bucket":""},
        "client": [{"client_info":{"mobilesdk_app_id":"1:123456789:android:abcdef",
            "android_client_info":{"package_name":pkg}},
            "api_key":[{"current_key":"AIzaFakeKey"}],
            "services":{"appinvite_service":{"other_platform_oauth_client":[]}}}],
        "configuration_version":"1"
    }
    open(gs_path, "w").write(json.dumps(stub, indent=2))
    log("  created stub google-services.json for " + pkg)

# --- MAIN ---
if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    rename_branding()
    remove_account_limit()
    add_session_strings()
    copy_session_import_files()
    patch_intro_activity()
    fix_google_services()
    log("=== All patches applied ===")
