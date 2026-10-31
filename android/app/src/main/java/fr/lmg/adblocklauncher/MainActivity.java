package fr.lmg.adblocklauncher;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaDrm;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.provider.Settings;
import android.util.Base64;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Prototype Android : le lanceur (interface web partagée avec le bureau) et, par-dessus, les sites en direct
 * dans des WebView, un onglet par site, avec blocage des pubs, pop-ups refusés et plein écran vidéo.
 */
public class MainActivity extends Activity {
    private static final int MAX_TABS = 8;
    private static final String LAUNCHER_URL = "https://appassets.androidplatform.net/assets/launcher/index.html";
    private static final UUID WIDEVINE = new UUID(0xEDEF8BA979D64ACEL, 0xA3C827DCD51D21EDL);

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final List<Tab> tabs = new ArrayList<>();
    private Tab active;
    private int nextId = 1;
    private String profileName = "p1";
    private long lastExternal = 0;

    private AdBlocker blocker;
    private SharedPreferences prefs;
    private FrameLayout root;
    private WebView launcher;
    private LinearLayout siteLayer;
    private FrameLayout siteHost;
    private EditText address;
    private Button btnBack, btnFwd, btnShield, btnTabs;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;

    /** Un onglet : une WebView, le site ouvert et ses compteurs. */
    private static final class Tab {
        final int id;
        final WebView web;
        String home = "";
        volatile String pageHost = "";
        String title = "";
        String icon = "";
        String color = "";
        final AtomicInteger blocked = new AtomicInteger();
        int popups = 0;

        Tab(int id, WebView web) { this.id = id; this.web = web; }
    }

    // ───────────────────────────── Cycle de vie ─────────────────────────────

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("app", MODE_PRIVATE);
        blocker = new AdBlocker(this);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0E1013"));
        buildLauncher();
        buildSiteLayer();
        root.addView(launcher, new FrameLayout.LayoutParams(-1, -1));
        root.addView(siteLayer, new FrameLayout.LayoutParams(-1, -1));
        siteLayer.setVisibility(View.GONE);
        setContentView(root);

        blocker.start(this::pushBlocklist);
    }

    @Override
    protected void onDestroy() {
        for (Tab t : tabs) t.web.destroy();
        launcher.destroy();
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (customView != null) { hideCustomView(); return; }
        if (siteLayer.getVisibility() == View.VISIBLE && active != null) {
            if (active.web.canGoBack()) active.web.goBack(); else showLauncher();
            return;
        }
        launcher.evaluateJavascript("(window.__backPressed ? window.__backPressed() : false)", v -> {
            if (!"true".equals(v)) finish();
        });
    }

    // ───────────────────────────── Lanceur ──────────────────────────────────

    private void buildLauncher() {
        launcher = new WebView(this);
        launcher.setBackgroundColor(Color.parseColor("#0E1013"));
        WebSettings s = launcher.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        launcher.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return true; // le lanceur ne navigue jamais ailleurs
            }
        });
        launcher.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsConfirm(WebView v, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                        .setNegativeButton(android.R.string.cancel, (d, w) -> result.cancel())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }
        });
        launcher.addJavascriptInterface(new Bridge(), "Android");
        launcher.loadUrl(LAUNCHER_URL);
    }

    private void showLauncher() {
        if (active != null) pauseTab(active);
        siteLayer.setVisibility(View.GONE);
        launcher.setVisibility(View.VISIBLE);
        launcher.onResume();
        pushTabs();
    }

    // ───────────────────────────── Couche « site » (barre native + WebView) ───

    private Button flat(String text, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(15);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        b.setPadding(dp(10), 0, dp(10), 0);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#1B1F26"));
        bg.setCornerRadius(dp(10));
        bg.setStroke(dp(1), Color.parseColor("#2B313B"));
        b.setBackground(bg);
        b.setOnClickListener(l);
        return b;
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private void buildSiteLayer() {
        siteLayer = new LinearLayout(this);
        siteLayer.setOrientation(LinearLayout.VERTICAL);
        siteLayer.setBackgroundColor(Color.parseColor("#0E1013"));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.VERTICAL);
        bar.setPadding(dp(6), dp(4), dp(6), dp(4));
        bar.setBackgroundColor(Color.parseColor("#14171C"));

        LinearLayout row1 = new LinearLayout(this);
        row1.setGravity(Gravity.CENTER_VERTICAL);
        btnBack = flat("←", v -> { if (active != null && active.web.canGoBack()) active.web.goBack(); });
        btnFwd = flat("→", v -> { if (active != null && active.web.canGoForward()) active.web.goForward(); });
        Button reload = flat("↻", v -> { if (active != null) active.web.reload(); });
        Button home = flat("⌂", v -> showLauncher());
        btnShield = flat("🛡 0", v -> toggleBlocking());
        btnTabs = flat("⧉ 1", v -> showTabsDialog());
        Button cast = flat("📡", v -> castScreen());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(40), 1f);
        lp.setMargins(dp(2), 0, dp(2), 0);
        for (Button b : new Button[]{btnBack, btnFwd, reload, home, btnShield, btnTabs, cast}) row1.addView(b, lp);
        bar.addView(row1, new LinearLayout.LayoutParams(-1, -2));

        address = new EditText(this);
        address.setSingleLine(true);
        address.setTextColor(Color.WHITE);
        address.setHintTextColor(Color.parseColor("#98A0AC"));
        address.setHint("Coller une adresse puis Entrée");
        address.setTextSize(15);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setInputType(android.text.InputType.TYPE_TEXT_VARIATION_URI);
        address.setSelectAllOnFocus(true);
        GradientDrawable abg = new GradientDrawable();
        abg.setColor(Color.parseColor("#1B1F26"));
        abg.setCornerRadius(dp(10));
        address.setBackground(abg);
        address.setPadding(dp(12), 0, dp(12), 0);
        address.setOnEditorActionListener((v, action, e) -> {
            if (action == EditorInfo.IME_ACTION_GO || (e != null && e.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
                Urls.Result r = Urls.normalize(address.getText().toString());
                if (!r.ok) { Toast.makeText(this, r.error, Toast.LENGTH_SHORT).show(); return true; }
                if (active != null) { active.home = r.url; active.web.loadUrl(r.url); }
                address.clearFocus();
                hideKeyboard();
                return true;
            }
            return false;
        });
        LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(-1, dp(40));
        alp.setMargins(dp(2), dp(4), dp(2), 0);
        bar.addView(address, alp);

        siteHost = new FrameLayout(this);
        siteLayer.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        siteLayer.addView(siteHost, new LinearLayout.LayoutParams(-1, 0, 1f));
    }

    private void hideKeyboard() {
        android.view.inputmethod.InputMethodManager imm = (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(address.getWindowToken(), 0);
    }

    private final Runnable barUpdate = this::updateBar;

    private void scheduleBar() {
        ui.removeCallbacks(barUpdate);
        ui.postDelayed(barUpdate, 120);
    }

    private void updateBar() {
        Tab t = active;
        if (t == null) return;
        btnBack.setAlpha(t.web.canGoBack() ? 1f : 0.35f);
        btnFwd.setAlpha(t.web.canGoForward() ? 1f : 0.35f);
        boolean on = blockingEnabled(Urls.siteKey(t.pageHost.isEmpty() ? t.home : t.pageHost));
        btnShield.setText((on ? "🛡 " : "⛔ ") + t.blocked.get());
        btnShield.setTextColor(on ? Color.parseColor("#7FD49A") : Color.parseColor("#FFD45E"));
        btnTabs.setText("⧉ " + tabs.size());
        if (!address.hasFocus()) {
            String u = t.web.getUrl();
            address.setText(u == null ? t.home : u);
        }
    }

    private boolean blockingEnabled(String key) {
        return !prefs.getStringSet("disabled", new HashSet<>()).contains(key);
    }

    private void toggleBlocking() {
        if (active == null) return;
        String key = Urls.siteKey(active.pageHost.isEmpty() ? active.home : active.pageHost);
        Set<String> set = new HashSet<>(prefs.getStringSet("disabled", new HashSet<>()));
        boolean wasOn = !set.contains(key);
        if (wasOn) set.add(key); else set.remove(key);
        prefs.edit().putStringSet("disabled", set).apply();
        Toast.makeText(this, wasOn ? "Blocage désactivé sur " + key : "Blocage réactivé sur " + key, Toast.LENGTH_SHORT).show();
        active.blocked.set(0);
        active.web.reload();
        updateBar();
    }

    private void showTabsDialog() {
        if (tabs.isEmpty()) return;
        String[] labels = new String[tabs.size()];
        for (int i = 0; i < tabs.size(); i++) {
            Tab t = tabs.get(i);
            labels[i] = (t == active ? "● " : "") + (t.title.isEmpty() ? Urls.siteKey(t.home) : t.title);
        }
        new AlertDialog.Builder(this)
                .setTitle("Sites ouverts")
                .setItems(labels, (d, which) -> activate(tabs.get(which)))
                .setNeutralButton("Accueil", (d, w) -> showLauncher())
                .setNegativeButton("Fermer cet onglet", (d, w) -> { if (active != null) closeTab(active); })
                .show();
    }

    /** Cast : on ouvre le réglage système « Caster l'écran » (Chromecast, Google TV, Smart View…). */
    private void castScreen() {
        try {
            startActivity(new Intent(Settings.ACTION_CAST_SETTINGS));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Ouvre « Caster » ou « Smart View » dans les réglages rapides de ton téléphone.", Toast.LENGTH_LONG).show();
        }
    }

    // ───────────────────────────── Onglets ──────────────────────────────────

    private void applyProfile(WebView wv) {
        // Une session de navigation (cookies, connexions) par profil, si la WebView du téléphone le permet.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            try { WebViewCompat.setProfile(wv, profileName); } catch (RuntimeException ignored) { /* déjà utilisée */ }
        }
    }

    private Tab newTab(String url) {
        WebView wv = new WebView(this);
        applyProfile(wv);
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true); // nécessaire pour pouvoir refuser les pop-ups (sinon window.open charge la page courante)
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        // Un navigateur ordinaire aux yeux des sites : on retire le marqueur « ; wv » des WebView.
        s.setUserAgentString(s.getUserAgentString().replace("; wv", ""));
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true);
        wv.setBackgroundColor(Color.BLACK);

        Tab t = new Tab(nextId++, wv);
        t.home = url;
        t.pageHost = Uri.parse(url).getHost() == null ? "" : Uri.parse(url).getHost();
        wv.setWebViewClient(new SiteClient(t));
        wv.setWebChromeClient(new SiteChrome(t));
        tabs.add(t);
        return t;
    }

    private Tab findByHome(String url) {
        for (Tab t : tabs) if (url.equals(t.home)) return t;
        return null;
    }

    private Tab findBySite(String url) {
        String key = Urls.siteKey(url);
        for (Tab t : tabs) if (key.equals(Urls.siteKey(t.home))) return t;
        return null;
    }

    private void openOnUi(String url, boolean background, boolean reuse) {
        Tab t = reuse ? findBySite(url) : findByHome(url);
        boolean existed = t != null;
        if (!existed) {
            if (tabs.size() >= MAX_TABS) { Toast.makeText(this, "Huit sites au maximum : ferme-en un.", Toast.LENGTH_LONG).show(); return; }
            t = newTab(url);
            t.web.loadUrl(url);
        } else if (!reuse) {
            t.home = url;
        }
        if (!background) activate(t); else { pauseTab(t); pushTabs(); }
    }

    private void activate(Tab t) {
        if (active != null && active != t) pauseTab(active);
        active = t;
        siteHost.removeAllViews();
        if (t.web.getParent() != null) ((ViewGroup) t.web.getParent()).removeView(t.web);
        siteHost.addView(t.web, new FrameLayout.LayoutParams(-1, -1));
        t.web.onResume();
        launcher.setVisibility(View.GONE);
        siteLayer.setVisibility(View.VISIBLE);
        updateBar();
        pushTabs();
    }

    private void pauseTab(Tab t) {
        t.web.evaluateJavascript("document.querySelectorAll('video,audio').forEach(function(m){try{m.pause()}catch(e){}})", null);
        t.web.onPause();
    }

    private void closeTab(Tab t) {
        tabs.remove(t);
        if (t.web.getParent() != null) ((ViewGroup) t.web.getParent()).removeView(t.web);
        t.web.destroy();
        if (active == t) {
            active = tabs.isEmpty() ? null : tabs.get(tabs.size() - 1);
            if (active != null) activate(active); else showLauncher();
        } else {
            pushTabs();
            updateBar();
        }
    }

    private void closeAllTabs() {
        for (Tab t : new ArrayList<>(tabs)) {
            if (t.web.getParent() != null) ((ViewGroup) t.web.getParent()).removeView(t.web);
            t.web.destroy();
        }
        tabs.clear();
        active = null;
        showLauncher();
    }

    private void external(String url) {
        long now = System.currentTimeMillis();
        if (now - lastExternal < 2000) return; // les pubs enchaînent les ouvertures
        lastExternal = now;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException ignored) { /* aucune appli pour ce lien */ }
    }

    // ───────────────────────────── Clients WebView ──────────────────────────

    private final class SiteClient extends WebViewClient {
        private final Tab t;

        SiteClient(Tab t) { this.t = t; }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            if (r.isForMainFrame()) return null;
            String host = r.getUrl().getHost();
            String page = t.pageHost;
            if (host == null || !blockingEnabled(Urls.siteKey(page))) return null;
            if (Urls.siteKey(host).equals(Urls.siteKey(page))) return null; // ressources du site lui-même
            if (!blocker.isBlocked(host)) return null;
            t.blocked.incrementAndGet();
            ui.post(MainActivity.this::scheduleBar);
            return new WebResourceResponse("text/plain", "utf-8", 204, "No Content", null, new ByteArrayInputStream(new byte[0]));
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            String url = r.getUrl().toString();
            if (!Urls.isHttp(url)) return true; // intent://, mailto:… : ignorés
            if (r.isRedirect()) return false;
            if (Urls.isSameSite(url, t.home) || Urls.isAuthSite(url)) return false;
            if (r.hasGesture()) external(url); // lien externe cliqué : navigateur par défaut
            return true;
        }

        @Override
        public void onPageStarted(WebView v, String url, Bitmap favicon) {
            String h = Uri.parse(url).getHost();
            t.pageHost = h == null ? "" : h;
            t.blocked.set(0);
            t.popups = 0;
            scheduleBar();
        }

        @Override
        public void onPageFinished(WebView v, String url) {
            scheduleBar();
            v.evaluateJavascript(
                    "(function(){var m=document.querySelector('meta[name=\"theme-color\"]');return JSON.stringify({color:m?m.content:'',title:document.title})})()",
                    value -> {
                        try {
                            String json = new JSONArray("[" + value + "]").getString(0);
                            JSONObject o = new JSONObject(json);
                            t.title = o.optString("title", t.title);
                            t.color = o.optString("color", "");
                            sendIdentity(t, url);
                        } catch (Exception ignored) { /* page sans titre */ }
                    });
        }

        @Override
        public void onReceivedError(WebView v, WebResourceRequest r, android.webkit.WebResourceError e) {
            if (!r.isForMainFrame()) return;
            String html = "<meta name=viewport content='width=device-width'><body style='font:16px sans-serif;background:#14161a;color:#e8eaed;padding:24px'>"
                    + "<h2>Impossible d’afficher ce site</h2><p style='color:#9aa0a6'>" + android.text.TextUtils.htmlEncode(String.valueOf(e.getDescription()))
                    + "</p><p><a style='color:#8ab4f8' href='" + android.text.TextUtils.htmlEncode(r.getUrl().toString()) + "'>Réessayer</a></p>";
            v.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
        }
    }

    private final class SiteChrome extends WebChromeClient {
        private final Tab t;

        SiteChrome(Tab t) { this.t = t; }

        @Override
        public void onReceivedTitle(WebView v, String title) {
            t.title = title == null ? "" : title;
            pushTabsLater();
        }

        @Override
        public void onReceivedIcon(WebView v, Bitmap icon) {
            if (icon == null) return;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            Bitmap small = Bitmap.createScaledBitmap(icon, 64, 64, true);
            small.compress(Bitmap.CompressFormat.PNG, 90, out);
            if (out.size() > 100 * 1024) return;
            t.icon = "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            sendIdentity(t, v.getUrl());
        }

        /** Pop-ups refusés ; seul un clic de l'utilisateur sur un lien « nouvel onglet » est routé (même site → ici, sinon navigateur). */
        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            if (!isUserGesture || isDialog) { t.popups++; return false; }
            WebView tmp = new WebView(MainActivity.this);
            tmp.setWebViewClient(new WebViewClient() {
                private boolean done = false;

                private void route(WebView w, String url) {
                    if (done || url == null || url.equals("about:blank")) return;
                    done = true;
                    ui.post(() -> {
                        if (Urls.isHttp(url)) {
                            if (Urls.isSameSite(url, t.home) || Urls.isAuthSite(url)) t.web.loadUrl(url); else external(url);
                        }
                        w.stopLoading();
                        w.destroy();
                    });
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest r) { route(w, r.getUrl().toString()); return true; }

                @Override
                public void onPageStarted(WebView w, String url, Bitmap f) { route(w, url); }
            });
            ((WebView.WebViewTransport) resultMsg.obj).setWebView(tmp);
            resultMsg.sendToTarget();
            return true;
        }

        /** Seul l'identifiant de média protégé est accordé (nécessaire au DRM Widevine) ; caméra, micro, etc. : refusés. */
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            for (String res : request.getResources()) {
                if (PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(res)) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID});
                    return;
                }
            }
            request.deny();
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, android.webkit.GeolocationPermissions.Callback callback) {
            callback.invoke(origin, false, false);
        }

        // Plein écran du lecteur vidéo
        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (customView != null) { callback.onCustomViewHidden(); return; }
            customView = view;
            customCallback = callback;
            view.setBackgroundColor(Color.BLACK);
            root.addView(view, new FrameLayout.LayoutParams(-1, -1));
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            immersive(true);
        }

        @Override
        public void onHideCustomView() { hideCustomView(); }
    }

    private void hideCustomView() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        if (customCallback != null) customCallback.onCustomViewHidden();
        customCallback = null;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        immersive(false);
    }

    @SuppressWarnings("deprecation")
    private void immersive(boolean on) {
        getWindow().getDecorView().setSystemUiVisibility(on
                ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                : View.SYSTEM_UI_FLAG_VISIBLE);
    }

    // ───────────────────────────── Vers l'interface ─────────────────────────

    private void js(String code) {
        ui.post(() -> launcher.evaluateJavascript(code, null));
    }

    private void pushTabsLater() {
        ui.removeCallbacks(pushTabsRun);
        ui.postDelayed(pushTabsRun, 200);
    }

    private final Runnable pushTabsRun = this::pushTabs;

    private void pushTabs() {
        JSONArray arr = new JSONArray();
        try {
            for (Tab t : tabs) {
                JSONObject o = new JSONObject();
                o.put("id", t.id);
                o.put("title", t.title.isEmpty() ? Urls.siteKey(t.home) : t.title);
                o.put("url", t.web.getUrl() == null ? t.home : t.web.getUrl());
                o.put("key", Urls.siteKey(t.home));
                o.put("icon", t.icon);
                o.put("color", t.color);
                o.put("audible", false);
                o.put("blocked", t.blocked.get());
                arr.put(o);
            }
        } catch (Exception ignored) { /* JSON toujours valide ici */ }
        js("window.__native && window.__native.tabs(" + arr + ")");
    }

    private void pushBlocklist() {
        js("window.__native && window.__native.blocklist(" + blocker.statusJson() + ")");
    }

    private void sendIdentity(Tab t, String url) {
        try {
            JSONObject o = new JSONObject();
            o.put("key", Urls.siteKey(t.home));
            o.put("url", url == null ? "" : url);
            o.put("title", t.title);
            o.put("color", t.color);
            o.put("icon", t.icon);
            js("window.__native && window.__native.identity(" + o + ")");
        } catch (Exception ignored) { /* rien à envoyer */ }
        pushTabsLater();
    }

    // ───────────────────────────── Pont JavaScript ──────────────────────────

    /** Appelé depuis l'interface web (page chargée uniquement depuis les ressources de l'appli). */
    private final class Bridge {
        @JavascriptInterface
        public String open(String input, boolean background, boolean reuse) {
            Urls.Result r = Urls.normalize(input);
            if (!r.ok) return "{\"ok\":false,\"error\":" + JSONObject.quote(r.error) + "}";
            ui.post(() -> openOnUi(r.url, background, reuse));
            return "{\"ok\":true,\"url\":" + JSONObject.quote(r.url) + "}";
        }

        @JavascriptInterface
        public void activateTab(int id) {
            ui.post(() -> { for (Tab t : tabs) if (t.id == id) { MainActivity.this.activate(t); return; } });
        }

        @JavascriptInterface
        public void closeTab(int id) {
            ui.post(() -> { for (Tab t : new ArrayList<>(tabs)) if (t.id == id) { MainActivity.this.closeTab(t); return; } });
        }

        /** Change de profil : ferme les sites ouverts et ouvre les prochains dans la session de ce profil. */
        @JavascriptInterface
        public void setProfile(String id) {
            ui.post(() -> {
                closeAllTabs();
                profileName = "p_" + id.replaceAll("[^A-Za-z0-9_-]", "");
            });
        }

        @JavascriptInterface
        public void deleteProfile(String id) {
            final String name = "p_" + id.replaceAll("[^A-Za-z0-9_-]", "");
            ui.post(() -> {
                if (WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
                    try { ProfileStore.getInstance().deleteProfile(name); } catch (RuntimeException ignored) { /* profil en cours d'usage */ }
                }
            });
        }

        @JavascriptInterface
        public void updateBlocklist() { blocker.update(MainActivity.this::pushBlocklist); }

        @JavascriptInterface
        public String blocklist() { return blocker.statusJson(); }

        /** État Widevine réel de l'appareil : présent et niveau de sécurité (L1 : HD possible, L3 : SD). */
        @JavascriptInterface
        public String drm() {
            try {
                if (!MediaDrm.isCryptoSchemeSupported(WIDEVINE)) return "{\"status\":\"missing\",\"detail\":\"Widevine non pris en charge\"}";
                MediaDrm drm = new MediaDrm(WIDEVINE);
                String level = drm.getPropertyString("securityLevel");
                drm.close();
                return "{\"status\":\"available\",\"detail\":" + JSONObject.quote(level) + "}";
            } catch (Exception e) {
                return "{\"status\":\"missing\",\"detail\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}";
            }
        }

        @JavascriptInterface
        public void cast() { ui.post(MainActivity.this::castScreen); }

        @JavascriptInterface
        public boolean profilesSupported() { return WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE); }
    }
}
