package fr.lmg.adblocklauncher;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Bloqueur de publicités et de traqueurs par nom de domaine (prototype Android).
 *
 * Il s'appuie sur des listes de domaines publiques au format « hosts », téléchargées au démarrage puis toutes les 12 h.
 * C'est moins fin que le moteur Ghostery du bureau (pas de règles par chemin, pas de masquage d'éléments) : voir docs/ANDROID.md.
 */
final class AdBlocker {
    private static final String[] SOURCES = {
            "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext",
            "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
    };
    private static final long REFRESH_MS = 12L * 60 * 60 * 1000;

    // Liste minimale embarquée : le blocage marche dès le premier lancement, même sans réseau.
    private static final String[] SEED = {
            "doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com",
            "googletagservices.com", "googletagmanager.com", "google-analytics.com", "pagead2.googlesyndication.com",
            "adnxs.com", "taboola.com", "outbrain.com", "criteo.com", "criteo.net", "scorecardresearch.com",
            "hotjar.com", "moatads.com", "amazon-adsystem.com", "adsrvr.org", "rubiconproject.com",
            "pubmatic.com", "openx.net", "smartadserver.com", "teads.tv", "casalemedia.com", "quantserve.com",
            "2mdn.net", "adform.net", "advertising.com", "yieldmo.com", "sharethrough.com"
    };

    private final File file;
    private final SharedPreferences prefs;
    private volatile Set<String> domains = new HashSet<>(Arrays.asList(SEED));
    private volatile String status = "loading";
    private volatile String error = "";
    private volatile boolean updating = false;

    AdBlocker(Context ctx) {
        file = new File(ctx.getFilesDir(), "blocklist.txt");
        prefs = ctx.getSharedPreferences("blocker", Context.MODE_PRIVATE);
    }

    /** Charge la dernière liste connue, puis la renouvelle si elle a plus de 12 h. */
    void start(Runnable onChange) {
        new Thread(() -> {
            if (file.exists()) {
                try {
                    Set<String> loaded = parse(new FileInputStream(file));
                    loaded.addAll(Arrays.asList(SEED));
                    domains = loaded;
                    status = "cached";
                } catch (IOException ignored) { /* cache illisible : on garde la liste embarquée */ }
                if (onChange != null) onChange.run();
            }
            if (System.currentTimeMillis() - prefs.getLong("updatedAt", 0) > REFRESH_MS) update(onChange);
            else if (status.equals("cached")) status = "ready";
            if (onChange != null) onChange.run();
        }, "adblock-load").start();
    }

    void update(Runnable onChange) {
        if (updating) return;
        updating = true;
        status = file.exists() ? "updating" : "loading";
        if (onChange != null) onChange.run();
        new Thread(() -> {
            try {
                Set<String> all = new HashSet<>(Arrays.asList(SEED));
                int ok = 0;
                StringBuilder lastErr = new StringBuilder();
                for (String src : SOURCES) {
                    try {
                        all.addAll(parse(open(src)));
                        ok++;
                    } catch (IOException e) {
                        lastErr.append(e.getMessage()).append(' ');
                    }
                }
                if (ok == 0) throw new IOException(lastErr.toString().trim());
                try (FileOutputStream out = new FileOutputStream(file)) {
                    StringBuilder sb = new StringBuilder();
                    for (String d : all) sb.append("0.0.0.0 ").append(d).append('\n');
                    out.write(sb.toString().getBytes(StandardCharsets.UTF_8));
                }
                domains = all;
                prefs.edit().putLong("updatedAt", System.currentTimeMillis()).apply();
                status = "ready";
                error = "";
            } catch (IOException e) {
                error = String.valueOf(e.getMessage());
                status = file.exists() ? "stale" : "error";
            } finally {
                updating = false;
                if (onChange != null) onChange.run();
            }
        }, "adblock-update").start();
    }

    private static InputStream open(String src) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(src).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "AdBlockLauncher/0.1");
        if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
        return c.getInputStream();
    }

    /** Format hosts : « 0.0.0.0 domaine » ou « 127.0.0.1 domaine ». */
    private static Set<String> parse(InputStream in) throws IOException {
        Set<String> out = new HashSet<>();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                int hash = line.indexOf('#');
                if (hash >= 0) line = line.substring(0, hash);
                line = line.trim();
                if (!(line.startsWith("0.0.0.0") || line.startsWith("127.0.0.1"))) continue;
                String[] p = line.split("\\s+");
                if (p.length < 2) continue;
                String d = p[1].toLowerCase(Locale.ROOT);
                if (d.equals("localhost") || d.equals("0.0.0.0") || !d.contains(".")) continue;
                out.add(d);
            }
        }
        return out;
    }

    /** Vrai si le domaine, ou l'un de ses parents, est dans la liste. */
    boolean isBlocked(String host) {
        if (host == null) return false;
        String h = host.toLowerCase(Locale.ROOT);
        Set<String> set = domains;
        while (true) {
            if (set.contains(h)) return true;
            int i = h.indexOf('.');
            if (i < 0) return false;
            h = h.substring(i + 1);
            if (!h.contains(".")) return false;
        }
    }

    String statusJson() {
        return "{\"status\":\"" + status + "\",\"updatedAt\":" + prefs.getLong("updatedAt", 0)
                + ",\"count\":" + domains.size() + ",\"error\":\"" + error.replace("\"", "'") + "\"}";
    }
}
