package mx.sofia.mario;

import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Configuración del servidor de Sofía guardada SOLO en la tablet (sin recompilar la APK). */
@CapacitorPlugin(name = "SofiaServer")
public class SofiaServerPlugin extends Plugin {

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(MainActivity.PREFS, android.content.Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void get(PluginCall call) {
        JSObject ret = new JSObject();
        String url = prefs().getString("serverUrl", null);
        ret.put("url", url != null ? url : getBridge().getServerUrl());
        ret.put("user", prefs().getString("authUser", ""));
        call.resolve(ret);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
            call.reject("URL inválida");
            return;
        }
        SharedPreferences.Editor e = prefs().edit().putString("serverUrl", url);
        e.putString("authUser", call.getString("user", ""));
        String pass = call.getString("pass", "");
        if (pass != null && !pass.isEmpty()) e.putString("authPass", pass);
        e.apply();
        call.resolve();
        restart();
    }

    @PluginMethod
    public void reload(PluginCall call) {
        call.resolve();
        restart();
    }

    private void restart() {
        getActivity().runOnUiThread(() -> getActivity().recreate());
    }
}
