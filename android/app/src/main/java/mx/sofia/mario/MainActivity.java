package mx.sofia.mario;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Collections;

/**
 * Cascarón de Sofía.
 *
 * Regla de arranque:
 * - si hay servidor guardado en la tablet, intenta abrirlo;
 * - si no hay servidor guardado, carga el shell local;
 * - si el servidor guardado falla o tarda demasiado, vuelve a "Conexión".
 */
public class MainActivity extends BridgeActivity {

    static final String PREFS = "sofia";
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SofiaServerPlugin.class);
        registerPlugin(SofiaDocumentScannerPlugin.class);

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String savedUrl = prefs.getString("serverUrl", null);
        boolean hasSavedRemote = savedUrl != null && !savedUrl.trim().isEmpty();

        if (hasSavedRemote) {
            try {
                CapConfig cfg = CapConfig.loadDefault(this);
                Field f = CapConfig.class.getDeclaredField("serverUrl");
                f.setAccessible(true);
                f.set(cfg, savedUrl.trim());
                this.config = cfg;
            } catch (Exception ignored) {
                // Si falla el override, Capacitor conserva el shell local del APK.
            }
        }

        super.onCreate(savedInstanceState);

        if (bridge != null) {
            SofiaWebViewClient client = new SofiaWebViewClient(bridge, prefs);
            bridge.setWebViewClient(client);
            injectBridgeIntoLocalPages(bridge);

            if (hasSavedRemote) {
                mainHandler.postDelayed(() -> {
                    if (!isFinishing() && bridge != null && !client.hasLoadedRemotePage()) {
                        client.showConnection(bridge.getWebView(), "timeout=1");
                    }
                }, 9000);
            }
        }
    }

    /**
     * Con servidor remoto, la pantalla local de conexión también necesita el
     * puente Capacitor para poder guardar la nueva URL.
     */
    private void injectBridgeIntoLocalPages(Bridge b) {
        if (b.getServerUrl() == null || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
        try {
            String local = b.getScheme() + "://" + b.getHost();
            if (b.getServerUrl().startsWith(local)) return;

            Method m = Bridge.class.getDeclaredMethod("getJSInjector");
            m.setAccessible(true);
            Object injector = m.invoke(b);
            if (injector == null) return;

            Method script = injector.getClass().getDeclaredMethod("getScriptString");
            script.setAccessible(true);
            WebViewCompat.addDocumentStartJavaScript(
                b.getWebView(),
                (String) script.invoke(injector),
                Collections.singleton(local)
            );
        } catch (Exception ignored) {
            // conexion.html mostrará un aviso visible si el puente no está disponible.
        }
    }
}
