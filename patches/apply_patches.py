#!/usr/bin/env python3
import os, re, shutil, sys, json

ROOT = os.path.dirname(os.path.abspath(__file__))

def log(msg):
    print("[PATCH] " + str(msg), flush=True)

# --- 1. BRANDING ---
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
            def replace_in_content(m):
                content = m.group(1)
                for old in old_names:
                    content = content.replace(old, "FavoriteGram")
                return ">" + content + "<"
            txt = re.sub(r">([^<]+)<", replace_in_content, txt)
            if txt != orig:
                open(path, "w", encoding="utf-8").write(txt)
                log("  patched " + path)
    manifest = "TMessagesProj/src/main/AndroidManifest.xml"
    if os.path.exists(manifest):
        txt = open(manifest, encoding="utf-8", errors="ignore").read()
        for old in old_names:
            txt = re.sub(r'android:label="' + old + r'"', 'android:label="FavoriteGram"', txt)
        open(manifest, "w", encoding="utf-8").write(txt)
        log("  patched AndroidManifest.xml")
    log("  branding done")

# --- 2. ACCOUNT LIMIT ---
def remove_account_limit():
    log("=== Account limit -> 20 ===")
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
        if "UserConfig.java" not in files:
            continue
        path = os.path.join(dirpath, "UserConfig.java")
        txt = open(path, encoding="utf-8", errors="ignore").read()
        orig = txt
        txt = re.sub(r"MAX_ACCOUNT_COUNT\s*=\s*\d+", "MAX_ACCOUNT_COUNT = 20", txt)
        if txt != orig:
            open(path, "w", encoding="utf-8").write(txt)
            log("  patched UserConfig.java -> MAX_ACCOUNT_COUNT = 20")
        else:
            log("  WARNING: MAX_ACCOUNT_COUNT not found!")

# --- 3. SESSION IMPORT STRINGS ---
def add_session_strings():
    log("=== Adding session import strings ===")
    new_strings = (
        '    <string name="SessionImport">\u0412\u043e\u0439\u0442\u0438 \u0447\u0435\u0440\u0435\u0437 \u0444\u0430\u0439\u043b \u0441\u0435\u0441\u0441\u0438\u0438</string>\n'
        '    <string name="SessionImportTitle">\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0444\u043e\u0440\u043c\u0430\u0442 \u0444\u0430\u0439\u043b\u0430</string>\n'
        '    <string name="SessionImportTelethon">.session (Telethon)</string>\n'
        '    <string name="SessionImportPyrogram">.session (Pyrogram)</string>\n'
        '    <string name="SessionImportTdata">TDATA (Telegram Desktop)</string>\n'
        '    <string name="SessionImportJson">.json (JSON)</string>\n'
    )
    main_strings = "TMessagesProj/src/main/res/values/strings.xml"
    if not os.path.exists(main_strings):
        log("  strings.xml not found!")
        return
    txt = open(main_strings, encoding="utf-8", errors="ignore").read()
    if "SessionImport" in txt:
        log("  already added")
        return
    txt = txt.replace("</resources>", new_strings + "</resources>")
    open(main_strings, "w", encoding="utf-8").write(txt)
    log("  strings added to strings.xml")

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
    log("  package: " + actual_pkg)
    for src_file in ["SessionImportHelper.java", "SessionFormatPickerBottomSheet.java", "DebugImportReceiver.java"]:
        src = os.path.join(ROOT, src_file)
        dst = os.path.join(ui_package, src_file)
        if not os.path.exists(src):
            log("  WARNING: " + src + " not found")
            continue
        content = open(src, encoding="utf-8").read()
        content = re.sub(r"^package .*;", "package " + actual_pkg + ";", content, flags=re.MULTILINE)
        open(dst, "w", encoding="utf-8").write(content)
        log("  copied " + src_file)

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

    session_btn_code = (
        "\n"
        "        // FavoriteGram: Session Import Button\n"
        "        try {\n"
        "            android.widget.TextView sessionImportBtn = new android.widget.TextView(context);\n"
        '            sessionImportBtn.setText("\u0412\u043e\u0439\u0442\u0438 \u0447\u0435\u0440\u0435\u0437 \u0444\u0430\u0439\u043b \u0441\u0435\u0441\u0441\u0438\u0438");\n'
        "            sessionImportBtn.setTextSize(android.util.TypedValue.COMPLEX_UNIT_DIP, 15);\n"
        "            sessionImportBtn.setGravity(android.view.Gravity.CENTER);\n"
        "            sessionImportBtn.setPadding(dp(16), dp(10), dp(16), dp(10));\n"
        "            sessionImportBtn.setTextColor(0xFF2196F3);\n"
        "            sessionImportBtn.setOnClickListener(sv -> {\n"
        "                android.app.Activity parentAct = getParentActivity();\n"
        "                if (parentAct != null) {\n"
        "                    new SessionFormatPickerBottomSheet(parentAct, frameContainerView).show();\n"
        "                }\n"
        "            });\n"
        "            frameContainerView.addView(sessionImportBtn,\n"
        "                org.telegram.ui.Components.LayoutHelper.createFrame(\n"
        "                    org.telegram.ui.Components.LayoutHelper.MATCH_PARENT, 40,\n"
        "                    android.view.Gravity.CENTER_HORIZONTAL | android.view.Gravity.BOTTOM, 16, 0, 16, 30));\n"
        "        } catch (Exception _fgEx) {\n"
        '            android.util.Log.e("FavoriteGram", "session btn inject failed", _fgEx);\n'
        "        }\n"
    )

    marker = re.search(r"destroyed\s*=\s*true;(\s*\n\s*\}\);)", txt)
    if marker:
        pos = marker.end()
        txt = txt[:pos] + session_btn_code + txt[pos:]
        log("  injected session button after startMessagingButton lambda")
    else:
        log("  WARNING: 'destroyed = true' marker not found -- skipping button injection")

    open(intro_path, "w", encoding="utf-8").write(txt)
    log("  IntroActivity done")

# --- 6. GOOGLE SERVICES FIX ---
def fix_google_services():
    log("=== Fixing google-services.json ===")
    gs_path = "TMessagesProj/google-services.json"
    if os.path.exists(gs_path):
        log("  already exists")
        return
    pkg = "xyz.nextalone.nagram"
    try:
        gradle = open("TMessagesProj/build.gradle", encoding="utf-8", errors="ignore").read()
        m = re.search(r'applicationId\s*[=\s]\s*"([^"]+)"', gradle)
        if m:
            pkg = m.group(1)
            log("  detected applicationId: " + pkg)
    except Exception as e:
        log("  could not read build.gradle: " + str(e))
    stub = {
        "project_info": {"project_number": "123456789012", "project_id": "favoritegram-app",
                         "storage_bucket": "favoritegram-app.appspot.com"},
        "client": [{"client_info": {"mobilesdk_app_id": "1:123456789012:android:abcdef123456",
                                    "android_client_info": {"package_name": pkg}},
                    "api_key": [{"current_key": "AIzaSyFakeKeyForDebugBuildOnly00000000000"}],
                    "services": {"appinvite_service": {"other_platform_oauth_client": []},
                                 "analytics_service": {"analytics_property": {"tracking_id": ""}}}}],
        "configuration_version": "1"
    }
    open(gs_path, "w").write(json.dumps(stub, indent=2))
    log("  created stub google-services.json for " + pkg)

# --- 7. REMOVE armeabi-v7a ---
def remove_v7a():
    log("=== Removing armeabi-v7a from splits ===")
    gradle_path = "TMessagesProj/build.gradle"
    txt = open(gradle_path, encoding="utf-8", errors="ignore").read()
    orig = txt
    txt = re.sub(r"include\s+'armeabi-v7a'\s*,\s*'arm64-v8a'", "include 'arm64-v8a'", txt)
    txt = re.sub(r'\s*pickFirst\s+"lib/armeabi-v7a/[^"]*"\n?', '\n', txt)
    if txt != orig:
        open(gradle_path, "w", encoding="utf-8").write(txt)
        log("  removed armeabi-v7a from build.gradle splits")
    else:
        log("  WARNING: armeabi-v7a pattern not found in splits")

# --- 8. FIX extractNativeLibs ---
def fix_extract_native_libs():
    log("=== Fix extractNativeLibs: enable useLegacyPackaging ===")
    gradle_path = "TMessagesProj/build.gradle"
    txt = open(gradle_path, encoding="utf-8", errors="ignore").read()
    orig = txt
    if "useLegacyPackaging" in txt:
        log("  already patched")
        return
    patched = re.sub(r'(packagingOptions\s*\{)', r'\1\n        useLegacyPackaging true', txt, count=1)
    if patched == txt:
        patched = re.sub(r'(packaging\s*\{)', r'\1\n        useLegacyPackaging true', txt, count=1)
    if patched == txt:
        patched = re.sub(r'(android\s*\{)', r'\1\n    packagingOptions {\n        useLegacyPackaging true\n    }', txt, count=1)
    if patched != orig:
        open(gradle_path, "w", encoding="utf-8").write(patched)
        log("  patched build.gradle: useLegacyPackaging true")
    else:
        log("  WARNING: could not patch build.gradle for useLegacyPackaging")

# --- 9. INTEGRITY CHECK BYPASS ---
def bypass_integrity_check():
    log("=== Bypassing native integrity check ===")
    path = "TMessagesProj/jni/integrity/integrity.cpp"
    if not os.path.exists(path):
        log("  integrity.cpp not found, skipping")
        return
    txt = open(path, encoding="utf-8", errors="ignore").read()
    if "return JNI_OK;" in txt and "getApplication" not in txt:
        log("  already bypassed")
        return
    stub = ('#include "meth.h"\n#include "openat.h"\n#include "read_cert.h"\n#include "SHA1.h"\n\n'
            'extern "C" {\nint verifySign(JNIEnv *env) {\n    return JNI_OK;\n}\n}\n')
    open(path, "w", encoding="utf-8").write(stub)
    log("  replaced integrity.cpp with JNI_OK stub")

# --- 10. PATCH LaunchActivity (onActivityResult) ---
def patch_launch_activity():
    log("=== Patching LaunchActivity.java (onActivityResult) ===")
    launch_path = None
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
        if "LaunchActivity.java" in files:
            launch_path = os.path.join(dirpath, "LaunchActivity.java")
            break
    if not launch_path:
        log("  ERROR: LaunchActivity.java not found!")
        return
    txt = open(launch_path, encoding="utf-8", errors="ignore").read()
    if "SessionFormatPickerBottomSheet.handleResult" in txt:
        log("  already patched")
        return
    if "void onActivityResult" in txt:
        txt = re.sub(
            r"((?:public|protected)\s+void\s+onActivityResult\s*\(int\s+requestCode,\s*int\s+resultCode,\s*[\w.@\s]+\s+data\)\s*\{)",
            lambda m: m.group(0) + "\n        SessionFormatPickerBottomSheet.handleResult(this, requestCode, resultCode, data);",
            txt, count=1)
        log("  injected handleResult into existing LaunchActivity.onActivityResult")
    else:
        override = (
            "\n    @Override\n"
            "    public void onActivityResult(int requestCode, int resultCode, android.content.Intent data) {\n"
            "        super.onActivityResult(requestCode, resultCode, data);\n"
            "        SessionFormatPickerBottomSheet.handleResult(this, requestCode, resultCode, data);\n"
            "    }\n"
        )
        last = txt.rfind("}")
        txt = txt[:last] + override + txt[last:]
        log("  added onActivityResult to LaunchActivity")
    open(launch_path, "w", encoding="utf-8").write(txt)
    log("  LaunchActivity done")

# --- 11. REGISTER DebugImportReceiver IN MANIFEST ---
def register_debug_receiver():
    log("=== Registering DebugImportReceiver in AndroidManifest.xml ===")
    manifest = "TMessagesProj/src/main/AndroidManifest.xml"
    if not os.path.exists(manifest):
        log("  ERROR: AndroidManifest.xml not found!")
        return
    txt = open(manifest, encoding="utf-8", errors="ignore").read()
    if "DebugImportReceiver" in txt:
        log("  already registered")
        return
    java_pkg = "org.telegram.ui"
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
        if "IntroActivity.java" in files:
            intro_txt = open(os.path.join(dirpath, "IntroActivity.java"), encoding="utf-8", errors="ignore").read()
            m = re.search(r"^package (.*?);", intro_txt, re.MULTILINE)
            if m:
                java_pkg = m.group(1)
            break
    receiver_xml = (
        '\n        <!-- FavoriteGram: Debug import receiver -->'
        '\n        <receiver android:name="' + java_pkg + '.DebugImportReceiver" android:exported="true">'
        '\n            <intent-filter>'
        '\n                <action android:name="xyz.nextalone.nagram.DEBUG_IMPORT" />'
        '\n            </intent-filter>'
        '\n        </receiver>'
    )
    if "</application>" in txt:
        txt = txt.replace("</application>", receiver_xml + "\n    </application>")
        open(manifest, "w", encoding="utf-8").write(txt)
        log("  DebugImportReceiver registered in AndroidManifest.xml")
    else:
        log("  ERROR: </application> tag not found!")

# --- 12. FIX 1: Patch UserConfig.isClientActivated() to check our flag ---
def patch_user_config_is_activated():
    log("=== Patching UserConfig.isClientActivated() for session-import ===")
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
        if "UserConfig.java" not in files:
            continue
        path = os.path.join(dirpath, "UserConfig.java")
        txt = open(path, encoding="utf-8", errors="ignore").read()
        if "account_activated" in txt:
            log("  already patched")
            return
        # Try pattern: public boolean isClientActivated() {
        injection = (
            '\n        // FavoriteGram: check session-import activated flag\n'
            '        try {\n'
            '            String _fgPName = "userconfing" + (currentAccount == 0 ? "" : currentAccount);\n'
            '            android.content.SharedPreferences _fgP = ApplicationLoader.applicationContext\n'
            '                .getSharedPreferences(_fgPName, android.content.Context.MODE_PRIVATE);\n'
            '            if (_fgP.getBoolean("account_activated" + currentAccount, false)) return true;\n'
            '        } catch (Exception _fgE) { /* ignore */ }\n'
        )
        patched = re.sub(
            r'(public\s+boolean\s+isClientActivated\s*\(\s*\)\s*\{)',
            r'\1' + injection,
            txt, count=1
        )
        if patched == txt:
            # Try with synchronized block
            patched = re.sub(
                r'(boolean\s+isClientActivated\s*\(\s*\)\s*\{\s*\n\s*)(synchronized)',
                r'\1' + injection.lstrip('\n') + r'        \2',
                txt, count=1
            )
        if patched != txt:
            open(path, "w", encoding="utf-8").write(patched)
            log("  patched UserConfig.isClientActivated()")
        else:
            log("  WARNING: could not find isClientActivated() pattern!")
        return

# --- 13. FIX 2: Patch LoginActivity phone view (Add Account screen) ---
def patch_login_phone_view():
    log("=== Patching LoginActivity phone view (Add Account button) ===")
    login_path = None
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
        if "LoginActivity.java" in files:
            login_path = os.path.join(dirpath, "LoginActivity.java")
            break
    if not login_path:
        log("  ERROR: LoginActivity.java not found!")
        return
    txt = open(login_path, encoding="utf-8", errors="ignore").read()
    if "FavoriteGram: Session Import" in txt:
        log("  already patched")
        return

    session_btn_code = (
        '\n                // FavoriteGram: Session Import Button\n'
        '                try {\n'
        '                    android.widget.TextView _fgSessBtn = new android.widget.TextView(context);\n'
        '                    _fgSessBtn.setText("\\u0412\\u043e\\u0439\\u0442\\u0438 \\u0447\\u0435\\u0440\\u0435\\u0437 \\u0444\\u0430\\u0439\\u043b \\u0441\\u0435\\u0441\\u0441\\u0438\\u0438");\n'
        '                    _fgSessBtn.setGravity(android.view.Gravity.CENTER);\n'
        '                    _fgSessBtn.setTextSize(android.util.TypedValue.COMPLEX_UNIT_DIP, 15);\n'
        '                    _fgSessBtn.setPadding(AndroidUtilities.dp(16), AndroidUtilities.dp(12), AndroidUtilities.dp(16), AndroidUtilities.dp(12));\n'
        '                    _fgSessBtn.setTextColor(0xFF2196F3);\n'
        '                    _fgSessBtn.setOnClickListener(_fgV -> {\n'
        '                        android.app.Activity _fgAct = (context instanceof android.app.Activity) ?\n'
        '                            (android.app.Activity) context : null;\n'
        '                        if (_fgAct != null) new SessionFormatPickerBottomSheet(_fgAct, _fgSessBtn).show();\n'
        '                    });\n'
        '                    linearLayout.addView(_fgSessBtn,\n'
        '                        LayoutHelper.createLinear(LayoutHelper.MATCH_PARENT, LayoutHelper.WRAP_CONTENT,\n'
        '                            0, 8, 0, 8));\n'
        '                } catch (Exception _fgEx4) {\n'
        '                    android.util.Log.e("FavoriteGram", "session btn login failed", _fgEx4);\n'
        '                }\n'
    )

    # Try multiple injection points — one of these will exist in LoginActivityPhoneView
    patterns = [
        r'(linearLayout\.addView\(syncContactsCheckBox[^;]*;)',
        r'(linearLayout\.addView\(syncContacts[^;]*;)',
        r'(linearLayout\.addView\(checkBox[^;]*;)',
        r'(linearLayout\.addView\(syncContactsBox[^;]*;)',
        # Fallback: after addView for the phone number field
        r'(linearLayout\.addView\(phoneField[^;]*;)',
        r'(linearLayout\.addView\(editText[^;]*;)',
    ]
    patched = txt
    for p in patterns:
        result = re.sub(p, lambda m: m.group(0) + session_btn_code, patched, count=1)
        if result != patched:
            patched = result
            log("  injected session button in phone view (pattern: " + p[:60] + ")")
            break
    else:
        log("  WARNING: could not find any injection point in LoginActivity phone view")

    if patched != txt:
        open(login_path, "w", encoding="utf-8").write(patched)
        log("  LoginActivity patched")


# --- 13. FIX11: Patch MessagesController.updateTimerProc() null-check (BULLETPROOF) ---
def patch_messages_controller_timer():
    log("=== FIX11: Patching MessagesController.updateTimerProc() null-check ===")
    import re
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
        if "MessagesController.java" not in files:
            continue
        path = os.path.join(dirpath, "MessagesController.java")
        txt = open(path, encoding="utf-8", errors="ignore").read()
        changed = False

        # Strategy A: local-variable replacement (race-condition-safe)
        SA_RE = re.compile(
            r'([ \t]*)(if\s*\(\s*getUserConfig\(\)\.isClientActivated\(\)\s*&&\s*!getUserConfig\(\)\.getCurrentUser\(\)\.bot\s*\)\s*\{)',
            re.DOTALL
        )
        if "FG11_LOCAL" not in txt:
            def sa_replace(m):
                indent = m.group(1)
                return (
                    indent + "final org.telegram.tgnet.TLRPC.User _fgU11 = getUserConfig().getCurrentUser(); // FG11_LOCAL\n"
                    + indent + "if (getUserConfig().isClientActivated() && _fgU11 != null && !_fgU11.bot) {"
                )
            patched = SA_RE.sub(sa_replace, txt, count=1)
            if patched != txt:
                txt = patched
                changed = True
                log("  Strategy A OK: local-var race-safe replacement applied")
            else:
                log("  Strategy A: regex miss, trying A2 plain-string fallback")
                PAT_A2 = "getUserConfig().isClientActivated() && !getUserConfig().getCurrentUser().bot"
                FIX_A2 = "getUserConfig().isClientActivated() && getUserConfig().getCurrentUser() != null && !getUserConfig().getCurrentUser().bot"
                if PAT_A2 in txt:
                    txt = txt.replace(PAT_A2, FIX_A2)
                    changed = True
                    log("  Strategy A2 OK: inline null-check applied")
                else:
                    log("  Strategy A2 FAILED: isClientActivated pattern not found")
        else:
            log("  Strategy A: FG11_LOCAL already present")

        # Strategy B: guard at start of updateTimerProc() — flexible regex
        if "FG11_GUARD" not in txt:
            SB_RE = re.compile(
                r'((?:@\w+\s+)*(?:public|protected|private)?\s*void\s+updateTimerProc\s*\(\s*\))\s*(\{)',
                re.MULTILINE | re.DOTALL
            )
            GUARD = "\n        if (getUserConfig().getCurrentUser() == null) return; // FG11_GUARD"
            patched = SB_RE.sub(lambda m: m.group(1) + " " + m.group(2) + GUARD, txt, count=1)
            if patched != txt:
                txt = patched
                changed = True
                log("  Strategy B OK: early-return guard at updateTimerProc() start")
            else:
                log("  Strategy B FAILED: updateTimerProc signature not matched")
        else:
            log("  Strategy B: FG11_GUARD already present")

        # Strategy C: nuclear — any !getCurrentUser().bot without null-check
        if "FG11_LOCAL" not in txt and "FG11_GUARD" not in txt:
            C_PAT = "!getUserConfig().getCurrentUser().bot"
            C_FIX = "(getUserConfig().getCurrentUser() == null || !getUserConfig().getCurrentUser().bot)"
            if C_PAT in txt:
                txt = txt.replace(C_PAT, C_FIX)
                changed = True
                log("  Strategy C OK: nuclear null-safe replacement applied")
            else:
                log("  Strategy C: !getCurrentUser().bot not found")

        if changed:
            open(path, "w", encoding="utf-8").write(txt)
            log("  FIX11 MessagesController.java written OK")
        else:
            log("  WARNING FIX11: NO changes made")
        return

# --- 14. FIX: Patch MediaDataController.loadStickers() null-check ---
def patch_media_data_controller_null_check():
    log("=== Patching MediaDataController.loadStickers() null-check ===")
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
        if "MediaDataController.java" not in files:
            continue
        path = os.path.join(dirpath, "MediaDataController.java")
        txt = open(path, encoding="utf-8", errors="ignore").read()
        if txt.count("getCurrentUser() != null && !getUserConfig().getCurrentUser().bot") >= 2:
            log("  already patched (found 2+ null-checks)")
            return
        PATTERN = "getUserConfig().isClientActivated() && !getUserConfig().getCurrentUser().bot"
        FIXED   = "getUserConfig().isClientActivated() && getUserConfig().getCurrentUser() != null && !getUserConfig().getCurrentUser().bot"
        count = txt.count(PATTERN)
        patched = txt.replace(PATTERN, FIXED)
        if patched != txt:
            open(path, "w", encoding="utf-8").write(patched)
            log(f"  patched MediaDataController.java: fixed {count} occurrence(s)")
        else:
            log("  WARNING: pattern not found in MediaDataController.java!")
        return

# --- 15. FIX: Universal null-check scan — patch ANY file with getCurrentUser().bot without guard ---
def patch_all_get_current_user_bot():
    log("=== Universal scan: patching all getCurrentUser().bot without null-check ===")
    import re
    PATTERN = "getUserConfig().isClientActivated() && !getUserConfig().getCurrentUser().bot"
    FIXED   = "getUserConfig().isClientActivated() && getUserConfig().getCurrentUser() != null && !getUserConfig().getCurrentUser().bot"
    total = 0
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
        for fname in files:
            if not fname.endswith(".java"):
                continue
            path = os.path.join(dirpath, fname)
            txt = open(path, encoding="utf-8", errors="ignore").read()
            if PATTERN in txt:
                count = txt.count(PATTERN)
                patched = txt.replace(PATTERN, FIXED)
                open(path, "w", encoding="utf-8").write(patched)
                log(f"  patched {fname}: {count} occurrence(s)")
                total += count
    if total == 0:
        log("  no remaining unguarded occurrences found")
    else:
        log(f"  total fixed: {total} occurrence(s) across all files")


# --- 16. FIX: SharedMediaLayout preloader null-check (Profile crash) ---
def patch_shared_media_layout_null_check():
    log("=== Patching SharedMediaLayout: preloader null-check ===")
    path = None
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
        if "SharedMediaLayout.java" in files:
            path = os.path.join(dirpath, "SharedMediaLayout.java")
            break
    if not path:
        log("  ERROR: SharedMediaLayout.java not found!")
        return
    txt = open(path, encoding="utf-8", errors="ignore").read()
    if "preloader != null ? preloader.getLastMediaCount()" in txt:
        log("  already patched")
        return
    # Fix line ~1556: int[] mediaCount = preloader.getLastMediaCount();
    # Fix line ~1557: topicId = sharedMediaPreloader.topicId;
    patched = txt.replace(
        "int[] mediaCount = preloader.getLastMediaCount();\n        topicId = sharedMediaPreloader.topicId;",
        "int[] mediaCount = preloader != null ? preloader.getLastMediaCount() : new int[]{0,0,0,0,0,0,0,0,0};\n        topicId = sharedMediaPreloader != null ? sharedMediaPreloader.topicId : 0;"
    )
    if patched == txt:
        # Try with different whitespace
        patched = re.sub(
            r'int\[\] mediaCount = preloader\.getLastMediaCount\(\);(\s*)topicId = sharedMediaPreloader\.topicId;',
            r'int[] mediaCount = preloader != null ? preloader.getLastMediaCount() : new int[]{0,0,0,0,0,0,0,0,0};\1topicId = sharedMediaPreloader != null ? sharedMediaPreloader.topicId : 0;',
            txt, count=1
        )
    if patched != txt:
        open(path, "w", encoding="utf-8").write(patched)
        log("  patched SharedMediaLayout.java: preloader null-check at getLastMediaCount()")
    else:
        log("  WARNING: could not find preloader.getLastMediaCount() pattern!")


# --- 17. FIX: ProfileActivity sharedMediaPreloader null-check (line ~8384) ---
def patch_profile_activity_preloader_null_check():
    log("=== Patching ProfileActivity: sharedMediaPreloader null-check ===")
    path = None
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
        if "ProfileActivity.java" in files:
            path = os.path.join(dirpath, "ProfileActivity.java")
            break
    if not path:
        log("  ERROR: ProfileActivity.java not found!")
        return
    txt = open(path, encoding="utf-8", errors="ignore").read()
    if "FavoriteGram: sharedMediaPreloader null-check" in txt:
        log("  already patched")
        return
    # Fix: guard the block that starts with
    #   if (sharedMediaLayout == null || mediaCounterTextView == null) {
    #       return;
    #   }
    #   int id = sharedMediaLayout.getClosestTab();
    #   int[] mediaCount = sharedMediaPreloader.getLastMediaCount();
    OLD = (
        "if (sharedMediaLayout == null || mediaCounterTextView == null) {\n"
        "            return;\n"
        "        }\n"
        "        int id = sharedMediaLayout.getClosestTab();\n"
        "        int[] mediaCount = sharedMediaPreloader.getLastMediaCount();"
    )
    NEW = (
        "if (sharedMediaLayout == null || mediaCounterTextView == null) {\n"
        "            return;\n"
        "        }\n"
        "        if (sharedMediaPreloader == null) return; // FavoriteGram: sharedMediaPreloader null-check\n"
        "        int id = sharedMediaLayout.getClosestTab();\n"
        "        int[] mediaCount = sharedMediaPreloader.getLastMediaCount();"
    )
    patched = txt.replace(OLD, NEW, 1)
    if patched == txt:
        # Try regex fallback with flexible whitespace
        patched = re.sub(
            r'(if\s*\(sharedMediaLayout\s*==\s*null\s*\|\|\s*mediaCounterTextView\s*==\s*null\)\s*\{\s*\n\s*return;\s*\}\s*\n)(\s*)(int id = sharedMediaLayout\.getClosestTab\(\);\s*\n\s*int\[\] mediaCount = sharedMediaPreloader\.getLastMediaCount\(\);)',
            r'\1\2if (sharedMediaPreloader == null) return; // FavoriteGram: sharedMediaPreloader null-check\n\2\3',
            txt, count=1
        )
    if patched != txt:
        open(path, "w", encoding="utf-8").write(patched)
        log("  patched ProfileActivity.java: added sharedMediaPreloader null-check before getLastMediaCount()")
    else:
        log("  WARNING: could not find ProfileActivity pattern for preloader null-check!")



# --- 18. FIX8: SharedMediaLayout.fillMediaData() — sharedMediaPreloader NPE ---
def patch_shared_media_layout_fill_media_data():
    log("=== FIX8: Patching SharedMediaLayout.fillMediaData() sharedMediaPreloader null-check ===")
    import re as _re
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
        if "SharedMediaLayout.java" not in files:
            continue
        path = os.path.join(dirpath, "SharedMediaLayout.java")
        txt = open(path, encoding="utf-8", errors="ignore").read()
        if "FG_FIX8" in txt:
            log("  already patched")
            return

        changed = False

        # Pattern A: guard sharedMediaPreloader.getSharedMediaData() inline
        # Real source: SharedMediaData[] mediaData = sharedMediaPreloader.getSharedMediaData();
        if "sharedMediaPreloader.getSharedMediaData()" in txt:
            txt = txt.replace(
                "sharedMediaPreloader.getSharedMediaData()",
                "(sharedMediaPreloader != null ? sharedMediaPreloader.getSharedMediaData() : null) /* FG_FIX8 */",
            )
            changed = True
            log("  Pattern A: guarded sharedMediaPreloader.getSharedMediaData()")

        # Pattern B: early return false at start of fillMediaData (returns boolean, not void)
        txt2 = _re.sub(
            r'(private\s+boolean\s+fillMediaData\b[^{]*\{)',
            lambda m: m.group(0) + "\n        if (sharedMediaPreloader == null) { return false; } // FG_FIX8",
            txt, count=1
        )
        if txt2 != txt:
            txt = txt2
            changed = True
            log("  Pattern B: early return false added to fillMediaData()")

        if changed:
            open(path, "w", encoding="utf-8").write(txt)
            log("  SharedMediaLayout.java patched with FIX8")
        else:
            log("  WARNING: none of the patterns matched in SharedMediaLayout.java")
        return




# --- 19. FIX9: ProfileActivity.createView() — currentChat NPE at line ~5986 ---
def patch_profile_activity_current_chat_null_check():
    log("=== FIX9: Patching ProfileActivity.createView() currentChat null-check ===")
    for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
        if "ProfileActivity.java" not in files:
            continue
        path = os.path.join(dirpath, "ProfileActivity.java")
        txt = open(path, encoding="utf-8", errors="ignore").read()
        # FIX9: replace ALL bare `if (currentChat.megagroup) {` with null-guarded version.
        # The original patch only replaced the first occurrence (line 2245), but the
        # crash actually fires from line 5986 which has the same pattern. The null-guarded
        # form is safe even when currentChat is already known to be non-null.
        old = "            if (currentChat.megagroup) {"
        new = "            if (currentChat != null && currentChat.megagroup) { // FG_FIX9"
        # Idempotency: only replace lines that still match the bare form (so re-running won't double-patch).
        bare_count = txt.count(old)
        if bare_count == 0:
            log("  no bare matches left (already patched)")
            return
        new_txt = txt.replace(old, new)
        open(path, "w", encoding="utf-8").write(new_txt)
        log(f"  patched ProfileActivity.java: currentChat null-check before .megagroup ({bare_count} occurrence(s))")
        return


  # --- 20. FIX12: MessagesController — fetch current user when null after session import ---
  def patch_messages_controller_fetch_user():
      log("=== FIX12: MessagesController — auto-fetch user when null after session import ===")
      import re as _re
      for dirpath, dirs, files in os.walk("TMessagesProj/src/main/java"):
          if "MessagesController.java" not in files:
              continue
          path = os.path.join(dirpath, "MessagesController.java")
          txt = open(path, encoding="utf-8", errors="ignore").read()
          if "FG12_START" in txt:
              log("  already patched (FG12_START found)")
              return

          FG12_BLOCK = (
              "if (getUserConfig().getCurrentUser() == null) { // FG12_START\n"
              "            if (getUserConfig().isClientActivated()) {\n"
              "                try {\n"
              "                    org.telegram.tgnet.TLRPC.TL_users_getUsers _fgReq12 =\n"
              "                            new org.telegram.tgnet.TLRPC.TL_users_getUsers();\n"
              "                    _fgReq12.id = new java.util.ArrayList<>();\n"
              "                    _fgReq12.id.add(new org.telegram.tgnet.TLRPC.TL_inputUserSelf());\n"
              "                    getConnectionsManager().sendRequest(_fgReq12, (_fgR12, _fgE12) -> {\n"
              "                        try {\n"
              "                            java.util.ArrayList<?> _fgUL = null;\n"
              "                            if (_fgR12 instanceof org.telegram.tgnet.TLRPC.TL_users_users) {\n"
              "                                _fgUL = ((org.telegram.tgnet.TLRPC.TL_users_users) _fgR12).users;\n"
              "                            } else if (_fgR12 instanceof org.telegram.tgnet.TLRPC.TL_users_usersSlice) {\n"
              "                                _fgUL = ((org.telegram.tgnet.TLRPC.TL_users_usersSlice) _fgR12).users;\n"
              "                            }\n"
              "                            if (_fgUL != null && !_fgUL.isEmpty()\n"
              "                                    && _fgUL.get(0) instanceof org.telegram.tgnet.TLRPC.TL_user) {\n"
              "                                org.telegram.tgnet.TLRPC.TL_user _fgMe =\n"
              "                                        (org.telegram.tgnet.TLRPC.TL_user) _fgUL.get(0);\n"
              "                                if (!_fgMe.deleted) {\n"
              "                                    getUserConfig().setCurrentUser(_fgMe);\n"
              "                                    getUserConfig().saveConfig(true);\n"
              "                                    org.telegram.messenger.AndroidUtilities.runOnUIThread(\n"
              "                                        () -> getNotificationCenter().postNotificationName(\n"
              "                                            org.telegram.messenger.NotificationCenter.currentUserChanged));\n"
              "                                }\n"
              "                            }\n"
              "                        } catch (Exception _fg12inner) { /* ignore */ }\n"
              "                    });\n"
              "                } catch (Exception _fg12e) { /* ignore */ }\n"
              "            }\n"
              "            return; // FG12_END\n"
              "        }"
          )

          changed = False

          # Strategy A: replace existing FG11_GUARD with FG12 block
          OLD_GUARD = "if (getUserConfig().getCurrentUser() == null) return; // FG11_GUARD"
          if OLD_GUARD in txt:
              # Find indentation
              idx = txt.find(OLD_GUARD)
              line_start = txt.rfind("\n", 0, idx) + 1
              indent = ""
              for ch in txt[line_start:idx]:
                  if ch in (" ", "\t"):
                      indent += ch
                  else:
                      break
              new_block = indent + FG12_BLOCK.replace("\n", "\n" + indent)
              # Remove trailing indent from last line
              patched = txt.replace(indent + OLD_GUARD, new_block, 1)
              if patched != txt:
                  txt = patched
                  changed = True
                  log("  FG12-A: replaced FG11_GUARD with user-fetch block")

          # Strategy B: inject at start of updateTimerProc (if no FG11_GUARD found)
          if not changed:
              SB_RE = _re.compile(
                  r'((?:@\w+\s+)*(?:public|protected|private)?\s*void\s+updateTimerProc\s*\(\s*\))\s*(\{)',
                  _re.MULTILINE | _re.DOTALL
              )
              inject = "\n        " + FG12_BLOCK.replace("\n", "\n        ")
              patched2 = SB_RE.sub(lambda m: m.group(1) + " " + m.group(2) + inject, txt, count=1)
              if patched2 != txt:
                  txt = patched2
                  changed = True
                  log("  FG12-B: injected at start of updateTimerProc (fallback)")
              else:
                  log("  WARNING: could not inject FG12 into MessagesController.java!")

          if changed:
              open(path, "w", encoding="utf-8").write(txt)
              log("  MessagesController.java FG12 applied")
          return

  
  # --- MAIN ---
if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    bypass_integrity_check()
    fix_extract_native_libs()
    rename_branding()
    remove_account_limit()
    add_session_strings()
    copy_session_import_files()
    patch_intro_activity()
    patch_launch_activity()
    register_debug_receiver()
    patch_user_config_is_activated()          # FIX 1: isClientActivated check
    patch_login_phone_view()                  # FIX 2: button in Add Account
    patch_messages_controller_timer()         # FIX 3: null-check in MessagesController
    patch_media_data_controller_null_check()  # FIX 4: null-check in MediaDataController
    patch_all_get_current_user_bot()          # FIX 5: universal scan — any remaining file
    patch_shared_media_layout_null_check()    # FIX 6: SharedMediaLayout preloader NPE
    patch_profile_activity_preloader_null_check()  # FIX 7: ProfileActivity preloader NPE
    patch_shared_media_layout_fill_media_data()       # FIX 8: SharedMediaLayout fillMediaData NPE
    patch_profile_activity_current_chat_null_check()   # FIX 9: ProfileActivity currentChat NPE
    patch_messages_controller_fetch_user()            # FIX12: auto-fetch user after session import
    fix_google_services()
    remove_v7a()
    log("=== All patches applied ===")
