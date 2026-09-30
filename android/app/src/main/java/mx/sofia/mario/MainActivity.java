package mx.sofia.mario;

import android.content.SharedPreferences;
import android.os.Bundle;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Collections;

/**
 * Cascarón de Sofía. Carga el servidor configurado en la tablet (pantalla "Conexión");
 * si no hay uno guardado, usa el de capacitor.config (SOFIA_SERVER_URL al compilar).
 * No contiene datos, llaves ni credenciales del servidor.
 */
public class MainActivity extends BridgeActivity {

    static final String PREFS = "sofia";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SofiaServerPlugin.class);
        registerPlugin(SofiaDocumentScannerPlugin.class);
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String url = prefs.getString("serverUrl", null);
        if (url != null && !url.trim().isEmpty()) {
            try {
                CapConfig cfg = CapConfig.loadDefault(this);
                Field f = CapConfig.class.getDeclaredField("serverUrl");
                f.setAccessible(true);
                f.set(cfg, url.trim());
                this.config = cfg;
            } catch (Exception e) {
                // Si falla, se usa la URL por defecto del config.
            }
        }
        super.onCreate(savedInstanceState);
        if (bridge != null) {
            bridge.setWebViewClient(new SofiaWebViewClient(bridge, prefs));
            injectBridgeIntoLocalPages(bridge);
        }
    }

    /**
     * Con un servidor remoto, Capacitor solo inyecta su puente JS en el origen del servidor. La pantalla
     * local "Conexión" (https://localhost/conexion.html) quedaba sin window.Capacitor y no podía guardar
     * el servidor. Se inyecta el mismo puente también en el origen local.
     */
    private void injectBridgeIntoLocalPages(Bridge b) {
        if (b.getServerUrl() == null || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
        try {
            String local = b.getScheme() + "://" + b.getHost();
            if (b.getServerUrl().startsWith(local)) return;
            Method m = Bridge.class.getDeclaredMethod("getJSInjector");
            m.setAccessible(true);
            Object injector = m.invoke(b); // JSInjector (no público)
            if (injector == null) return;
            Method script = injector.getClass().getDeclaredMethod("getScriptString");
            script.setAccessible(true);
            WebViewCompat.addDocumentStartJavaScript(b.getWebView(), (String) script.invoke(injector), Collections.singleton(local));
        } catch (Exception e) {
            // Sin inyección: la pantalla de conexión muestra su aviso de respaldo.
        }
    }
}
