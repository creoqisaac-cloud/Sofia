package mx.sofia.mario;

import android.content.SharedPreferences;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import java.lang.reflect.Field;

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
        if (bridge != null) bridge.setWebViewClient(new SofiaWebViewClient(bridge, prefs));
    }
}
