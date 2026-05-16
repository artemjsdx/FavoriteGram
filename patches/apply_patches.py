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
        for fname in files:
            if fname != "UserConfig.java":
                continue
            path = os.path.join(dirpath, fname)
            txt = open(path, encoding="utf-8", errors="ignore").read()
            orig = txt
            txt = re.sub(r"MAX_ACCOUNT_COUNT\s*=\s*\d+", "MAX_ACCOUNT_COUNT = 20", txt)
            if txt != orig:
                open(path, "w", encoding="utf-8").write(txt)
                log("  patched UserConfig.java -> MAX_ACCOUNT_COUNT = 20")
            else:
                log("  WARNING: MAX_ACCOUNT_COUNT not found!")
                for line in txt.split("\n"):
                    if "ACCOUNT" in line.upper():
                        log("    " + line.strip())

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
    for src_file in ["SessionImportHelper.java", "SessionFormatPickerBottomSheet.java"]:
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


      # FavoriteGram: inject onActivityResult so file picker result reaches handleResult
      if "SessionFormatPickerBottomSheet.handleResult" not in txt:
          if "public void onActivityResult" in txt:
              txt = re.sub(
                  r"(public void onActivityResult\(int requestCode, int resultCode, [\w. ]+data\)\s*\{)",
                  lambda m: m.group(0) + "\n        SessionFormatPickerBottomSheet.handleResult(this, requestCode, resultCode, data);",
                  txt, count=1)
              log("  injected handleResult into existing onActivityResult")
          else:
              override = (
                  "\n"
                  "    @Override\n"
                  "    public void onActivityResult(int requestCode, int resultCode, android.content.Intent data) {\n"
                  "        super.onActivityResult(requestCode, resultCode, data);\n"
                  "        SessionFormatPickerBottomSheet.handleResult(this, requestCode, resultCode, data);\n"
                  "    }\n"
              )
              last = txt.rfind("}")
              txt = txt[:last] + override + txt[last:]
              log("  added new onActivityResult override")

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
        "project_info": {
            "project_number": "123456789012",
            "project_id": "favoritegram-app",
            "storage_bucket": "favoritegram-app.appspot.com"
        },
        "client": [{
            "client_info": {
                "mobilesdk_app_id": "1:123456789012:android:abcdef123456",
                "android_client_info": {"package_name": pkg}
            },
            "api_key": [{"current_key": "AIzaSyFakeKeyForDebugBuildOnly00000000000"}],
            "services": {
                "appinvite_service": {"other_platform_oauth_client": []},
                "analytics_service": {"analytics_property": {"tracking_id": ""}}
            }
        }],
        "configuration_version": "1"
    }
    open(gs_path, "w").write(json.dumps(stub, indent=2))
    log("  created stub google-services.json for " + pkg)

# --- 7. REMOVE armeabi-v7a (build only arm64-v8a) ---
def remove_v7a():
    log("=== Removing armeabi-v7a from splits ===")
    gradle_path = "TMessagesProj/build.gradle"
    txt = open(gradle_path, encoding="utf-8", errors="ignore").read()
    orig = txt
    txt = re.sub(
        r"include\s+'armeabi-v7a'\s*,\s*'arm64-v8a'",
        "include 'arm64-v8a'",
        txt
    )
    txt = re.sub(r'\s*pickFirst\s+"lib/armeabi-v7a/[^"]*"\n?', '\n', txt)
    if txt != orig:
        open(gradle_path, "w", encoding="utf-8").write(txt)
        log("  removed armeabi-v7a from build.gradle splits")
    else:
        log("  WARNING: armeabi-v7a pattern not found in splits")

# --- 8. FIX extractNativeLibs (CRITICAL: fixes "can't load native libraries" crash) ---
def fix_extract_native_libs():
    log("=== Fix extractNativeLibs: enable useLegacyPackaging ===")
    gradle_path = "TMessagesProj/build.gradle"
    txt = open(gradle_path, encoding="utf-8", errors="ignore").read()
    orig = txt

    if "useLegacyPackaging" in txt:
        log("  already patched")
        return

    # Try existing packagingOptions block first
    patched = re.sub(
        r'(packagingOptions\s*\{)',
        r'\1\n        useLegacyPackaging true',
        txt,
        count=1
    )
    if patched == txt:
        patched = re.sub(
            r'(packaging\s*\{)',
            r'\1\n        useLegacyPackaging true',
            txt,
            count=1
        )
    # If no block found, inject one after `android {`
    if patched == txt:
        patched = re.sub(
            r'(android\s*\{)',
            r'\1\n    packagingOptions {\n        useLegacyPackaging true\n    }',
            txt,
            count=1
        )

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
    # Write a clean stub that always returns JNI_OK — avoids any regex/brace-counting bugs
    stub = (
        '#include "meth.h"\n'
        '#include "openat.h"\n'
        '#include "read_cert.h"\n'
        '#include "SHA1.h"\n'
        "\n"
        'extern "C" {\n'
        "int verifySign(JNIEnv *env) {\n"
        "    return JNI_OK;\n"
        "}\n"
        "}\n"
    )
    open(path, "w", encoding="utf-8").write(stub)
    log("  replaced integrity.cpp with JNI_OK stub")

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
    fix_google_services()
    remove_v7a()
    log("=== All patches applied ===")
