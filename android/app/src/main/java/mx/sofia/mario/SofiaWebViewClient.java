package mx.sofia.mario;

import android.content.SharedPreferences;
import android.net.http.SslError;
import android.webkit.HttpAuthHandler;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.view.View;
import android.view.ViewGroup;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * WebView tolerante a fallos.
 *
 * Un servidor remoto caído, una URL inválida o un error SSL/HTTP nunca deben
 * dejar la app en negro: el frame principal vuelve a conexion.html.
 */
public class SofiaWebViewClient extends BridgeWebViewClient {

    private final Bridge bridge;
    private final SharedPreferences prefs;
    private int attempts = 0; // permite varios retos HTTP Basic durante una misma carga
    private volatile boolean remoteLoaded = false;
    private volatile boolean showingFallback = false;
    private View loadingOverlay;

    void setLoadingOverlay(View overlay) {
        loadingOverlay = overlay;
    }

    private void hideLoadingOverlay(WebView view) {
        final View overlay = loadingOverlay;
        if (overlay == null) return;
        loadingOverlay = null;
        view.post(() -> {
            if (overlay.getParent() instanceof ViewGroup) {
                ((ViewGroup) overlay.getParent()).removeView(overlay);
            }
        });
    }

    public SofiaWebViewClient(Bridge bridge, SharedPreferences prefs) {
        super(bridge);
        this.bridge = bridge;
        this.prefs = prefs;
    }

    boolean hasLoadedRemotePage() {
        return remoteLoaded;
    }

    private String localBase() {
        return bridge.getScheme() + "://" + bridge.getHost();
    }

    private boolean isLocal(String url) {
        return url != null && url.startsWith(localBase());
    }

    void showConnection(WebView view, String query) {
        if (view == null || showingFallback) return;
        showingFallback = true;
        hideLoadingOverlay(view);
        String errorUrl = bridge.getErrorUrl();
        if (errorUrl == null || errorUrl.isEmpty()) {
            errorUrl = localBase() + "/conexion.html";
        }
        final String target = errorUrl + ((query == null || query.isEmpty()) ? "" : "?" + query);
        view.post(() -> view.loadUrl(target));
    }

    @Override
    public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler, String host, String realm) {
        String user = prefs.getString("authUser", "");
        String pass = prefs.getString("authPass", "");

        if (attempts < 4 && user != null && !user.isEmpty()) {
            attempts++;
            handler.proceed(user, pass);
            return;
        }

        handler.cancel();
        showConnection(view, "auth=1");
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (request != null && request.isForMainFrame()) {
            String url = request.getUrl() != null ? request.getUrl().toString() : "";
            if (!isLocal(url)) showConnection(view, "network=1");
        }
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
        super.onReceivedHttpError(view, request, response);
        if (request != null && request.isForMainFrame()) {
            String url = request.getUrl() != null ? request.getUrl().toString() : "";
            int status = response != null ? response.getStatusCode() : 0;
            if (!isLocal(url) && status >= 400 && status != 401) {
                showConnection(view, "http=" + status);
            }
        }
    }

    @Override
    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        handler.cancel();
        showConnection(view, "ssl=1");
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        hideLoadingOverlay(view);
        attempts = 0;

        if (isLocal(url)) {
            showingFallback = url != null && url.contains("/conexion.html");
            return;
        }

        if (url != null && (url.startsWith("https://") || url.startsWith("http://"))) {
            remoteLoaded = true;
            showingFallback = false;
        }
    }
}
