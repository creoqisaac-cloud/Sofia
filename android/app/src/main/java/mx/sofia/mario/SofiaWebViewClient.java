package mx.sofia.mario;

import android.content.SharedPreferences;
import android.webkit.HttpAuthHandler;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Responde el Basic Auth del servidor (SOFIA_BASIC_AUTH) con el usuario/contraseña guardados
 * en la tablet. Si no hay o son incorrectos, abre la pantalla de conexión.
 */
public class SofiaWebViewClient extends BridgeWebViewClient {

    private final Bridge bridge;
    private final SharedPreferences prefs;
    private int attempts = 0;

    public SofiaWebViewClient(Bridge bridge, SharedPreferences prefs) {
        super(bridge);
        this.bridge = bridge;
        this.prefs = prefs;
    }

    @Override
    public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler, String host, String realm) {
        String user = prefs.getString("authUser", "");
        String pass = prefs.getString("authPass", "");
        if (attempts < 1 && user != null && !user.isEmpty()) {
            attempts++;
            handler.proceed(user, pass);
            return;
        }
        handler.cancel();
        String errorUrl = bridge.getErrorUrl();
        if (errorUrl != null) view.post(() -> view.loadUrl(errorUrl + "?auth=1"));
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        attempts = 0;
    }
}
