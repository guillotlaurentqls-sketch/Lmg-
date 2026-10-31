package fr.lmg.adblocklauncher;

import android.net.Uri;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Équivalent Java de src/url.js : adresses http(s), « même site », fournisseurs de connexion. */
final class Urls {
    private Urls() {}

    private static final Set<String> MULTI_SUFFIX = new HashSet<>(Arrays.asList(
            "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz",
            "co.jp", "com.br", "com.mx", "co.in", "co.za", "com.tr", "com.cn", "com.ar"));

    // Fournisseurs d'identité : les connexions « Se connecter avec… » restent dans l'appli.
    private static final Set<String> AUTH_SITES = new HashSet<>(Arrays.asList(
            "google.com", "microsoftonline.com", "live.com", "microsoft.com", "apple.com",
            "facebook.com", "okta.com", "auth0.com", "france.tv", "francetelevisions.fr"));

    private static final Pattern BLOCKED_SCHEME = Pattern.compile(
            "^(javascript|data|file|about|blob|chrome|view-source|mailto|tel|ftp|ws|wss|intent):", Pattern.CASE_INSENSITIVE);
    private static final Pattern ANY_SCHEME = Pattern.compile("^[a-z][a-z0-9+.-]*://", Pattern.CASE_INSENSITIVE);
    private static final Pattern HTTP = Pattern.compile("^https?://", Pattern.CASE_INSENSITIVE);

    static final class Result {
        final boolean ok;
        final String url;
        final String error;

        Result(boolean ok, String url, String error) { this.ok = ok; this.url = url; this.error = error; }
    }

    /** Transforme ce que l'utilisateur a collé en URL http(s) valide. */
    static Result normalize(String input) {
        if (input == null) return new Result(false, null, "Adresse vide.");
        String s = input.trim().replaceAll("^[<\"'`(]+|[>\"'`),.;]+$", "").replaceAll("\\s+", "");
        if (s.isEmpty()) return new Result(false, null, "Adresse vide.");
        if (s.length() > 4096) return new Result(false, null, "Adresse trop longue.");
        if (BLOCKED_SCHEME.matcher(s).find() || (ANY_SCHEME.matcher(s).find() && !HTTP.matcher(s).find())) {
            return new Result(false, null, "Seules les adresses http et https sont acceptées.");
        }
        if (s.startsWith("//")) s = "https:" + s;
        else if (!HTTP.matcher(s).find()) s = "https://" + s;
        Uri u;
        try {
            u = Uri.parse(s);
        } catch (Exception e) {
            return new Result(false, null, "Cette adresse n’est pas valide.");
        }
        String host = u.getHost();
        if (host == null || host.isEmpty()) return new Result(false, null, "Cette adresse n’est pas valide.");
        boolean looksLikeHost = host.contains(".") || host.equals("localhost");
        if (!looksLikeHost || host.startsWith(".") || host.endsWith("..")) {
            return new Result(false, null, "Cette adresse ne ressemble pas à un site web.");
        }
        return new Result(true, u.toString(), null);
    }

    static boolean isHttp(String url) {
        return url != null && HTTP.matcher(url).find();
    }

    /** Domaine « enregistrable » approximatif : www.arte.tv → arte.tv, a.bbc.co.uk → bbc.co.uk. */
    static String siteKey(String hostOrUrl) {
        String host = hostOrUrl == null ? "" : hostOrUrl;
        if (ANY_SCHEME.matcher(host).find()) {
            String h = Uri.parse(host).getHost();
            host = h == null ? "" : h;
        }
        host = host.toLowerCase(Locale.ROOT);
        if (host.endsWith(".")) host = host.substring(0, host.length() - 1);
        if (host.isEmpty() || host.matches("[\\d.]+") || host.contains(":") || host.equals("localhost")) return host;
        String[] parts = host.split("\\.");
        if (parts.length <= 2) return host;
        String last2 = parts[parts.length - 2] + "." + parts[parts.length - 1];
        if (MULTI_SUFFIX.contains(last2)) return parts[parts.length - 3] + "." + last2;
        return last2;
    }

    static boolean isAuthSite(String url) {
        return AUTH_SITES.contains(siteKey(url));
    }

    static boolean isSameSite(String target, String reference) {
        if (!isHttp(target) || reference == null || reference.isEmpty()) return false;
        return siteKey(target).equals(siteKey(reference));
    }
}
