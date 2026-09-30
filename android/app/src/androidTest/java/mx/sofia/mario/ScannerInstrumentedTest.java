package mx.sofia.mario;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Pruebas en un Android real (emulador de CI) con una credencial INE SINTÉTICA (persona inexistente):
 *  1. ML Kit Text Recognition v2 (modelo incluido) lee el frente y el reverso → observación estructurada.
 *  2. El plugin SofiaDocumentScanner está expuesto a la página del servidor dentro de la APK.
 *  3. Flujo completo DENTRO DE LA APK contra un servidor Sofía real: Escanear → OBSERVADO → Confirmar →
 *     solicitud BBVA → PDF. Lo único sustituido es la pantalla de cámara del escáner de Google Play
 *     (no se puede operar en un emulador): en su lugar se entrega la imagen sintética, y el OCR sí es
 *     el real de ML Kit en este dispositivo.
 */
@RunWith(AndroidJUnit4.class)
public class ScannerInstrumentedTest {

    private static final String TAG = "SOFIA_OCR";
    private static final String DEMO = "SOFIA_DEMO";

    private Context testCtx() {
        return InstrumentationRegistry.getInstrumentation().getContext();
    }

    private Context appCtx() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    private Bitmap asset(String name) throws Exception {
        try (InputStream in = testCtx().getAssets().open(name)) {
            return BitmapFactory.decodeStream(in);
        }
    }

    private JSONObject ocrSynthetic() throws Exception {
        JSONArray pages = new JSONArray();
        for (String name : new String[] { "ine-sintetica-frente.png", "ine-sintetica-reverso.png" }) {
            Bitmap bmp = asset(name);
            JSONObject page = SofiaOcr.recognize(com.google.mlkit.vision.common.InputImage.fromBitmap(bmp, 0), name);
            pages.put(page);
        }
        JSONObject obs = new JSONObject();
        obs.put("engine", "mlkit-text-v2");
        obs.put("pages", pages);
        return obs;
    }

    @Test
    public void ocrMlKitEnElDispositivo() throws Exception {
        JSONObject obs = ocrSynthetic();
        // Se publica ANTES de validar (datos SINTÉTICOS) para el reporte de CI y como fixture de regresión.
        String b64 = Base64.encodeToString(obs.toString().getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
        int size = 3000;
        int n = (b64.length() + size - 1) / size;
        for (int i = 0; i < n; i++) Log.i(TAG, "CHUNK " + (i + 1) + "/" + n + " " + b64.substring(i * size, Math.min(b64.length(), (i + 1) * size)));
        JSONArray pages = obs.getJSONArray("pages");
        assertEquals(2, pages.length());
        StringBuilder all = new StringBuilder();
        for (int p = 0; p < pages.length(); p++) {
            JSONArray blocks = pages.getJSONObject(p).getJSONArray("blocks");
            assertTrue("sin bloques en la página " + p, blocks.length() > 0);
            JSONObject first = blocks.getJSONObject(0);
            assertNotNull(first.getJSONObject("box"));
            assertTrue(first.getJSONArray("lines").length() > 0);
            for (int b = 0; b < blocks.length(); b++) all.append(blocks.getJSONObject(b).getString("text")).append('\n');
        }
        String text = all.toString();
        assertTrue("no se leyó NOMBRE", text.contains("NOMBRE"));
        // ML Kit puede confundir 0/O: aquí solo se exige que lea el texto; la validación estricta es del parser.
        assertTrue("no se leyó la CURP sintética", text.replace(" ", "").contains("SIEP850505MDFNJR"));
    }

    // ───────── WebView de la APK ─────────

    private String js(ActivityScenario<MainActivity> sc, String script) throws Exception {
        AtomicReference<String> out = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        sc.onActivity(a -> {
            WebView wv = a.getBridge().getWebView();
            wv.evaluateJavascript(script, v -> {
                out.set(v);
                latch.countDown();
            });
        });
        assertTrue("JS sin respuesta", latch.await(20, TimeUnit.SECONDS));
        return out.get();
    }

    private void waitFor(ActivityScenario<MainActivity> sc, String cond, int seconds, String what) throws Exception {
        long end = System.currentTimeMillis() + seconds * 1000L;
        while (System.currentTimeMillis() < end) {
            if ("true".equals(js(sc, "(function(){try{return !!(" + cond + ")}catch(e){return false}})()"))) return;
            Thread.sleep(500);
        }
        throw new AssertionError("Tiempo agotado esperando: " + what + " · url=" + js(sc, "location.href"));
    }

    private void screenshot(String name) {
        try {
            Thread.sleep(700);
            Bitmap shot = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
            File dir = appCtx().getExternalFilesDir("demo");
            if (shot == null || dir == null) return;
            try (FileOutputStream fo = new FileOutputStream(new File(dir, name + ".png"))) {
                shot.compress(Bitmap.CompressFormat.PNG, 100, fo);
            }
        } catch (Exception e) {
            Log.w(DEMO, "screenshot " + name + " falló");
        }
    }

    private ActivityScenario<MainActivity> launchWith(String serverUrl) {
        appCtx().getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE).edit().putString("serverUrl", serverUrl).commit();
        return ActivityScenario.launch(MainActivity.class);
    }

    @Test
    public void pluginExpuestoALaPagina() throws Exception {
        // Servidor inexistente → pantalla local "Conexión" (misma inyección del puente que el servidor).
        try (ActivityScenario<MainActivity> sc = launchWith("http://127.0.0.1:9")) {
            waitFor(sc, "window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SofiaDocumentScanner", 40, "puente Capacitor");
            assertEquals("\"function\"", js(sc, "typeof window.Capacitor.Plugins.SofiaDocumentScanner.scanAndRecognize"));
            assertEquals("\"function\"", js(sc, "typeof window.Capacitor.Plugins.SofiaDocumentScanner.recognizeText"));
            assertEquals("\"function\"", js(sc, "typeof window.Capacitor.Plugins.SofiaServer.set"));
            // La pantalla Conexión puede hablar con lo nativo (antes no tenía puente)
            js(sc, "window.__srv = null; window.Capacitor.Plugins.SofiaServer.get().then(r => window.__srv = r.url); true");
            waitFor(sc, "window.__srv === 'http://127.0.0.1:9'", 20, "SofiaServer.get() desde Conexión");
        }
    }

    @Test
    public void flujoEscanearObservadoConfirmarSolicitud() throws Exception {
        Bundle args = InstrumentationRegistry.getArguments();
        String server = args.getString("sofiaServer");
        String customer = args.getString("sofiaCustomer");
        assumeTrue("Sin servidor de demo (argumentos sofiaServer/sofiaCustomer)", server != null && customer != null);

        // OCR real en este dispositivo + la imagen que entregaría el escáner (JPEG).
        JSONObject obs = ocrSynthetic();
        ByteArrayOutputStream jpg = new ByteArrayOutputStream();
        asset("ine-sintetica-frente.png").compress(Bitmap.CompressFormat.JPEG, 85, jpg);
        JSONObject file = new JSONObject();
        file.put("base64", Base64.encodeToString(jpg.toByteArray(), Base64.NO_WRAP));
        file.put("mime", "image/jpeg");
        file.put("name", "escaneo.jpg");
        obs.put("file", file);
        obs.put("pageCount", 2);

        try (ActivityScenario<MainActivity> sc = launchWith(server)) {
            waitFor(sc, "window.Capacitor && document.readyState === 'complete' && location.href.indexOf('" + server + "') === 0", 60, "servidor Sofía");
            js(sc, "location.href = '" + server + "/customers/" + customer + "/documents?modo=tablet'");
            waitFor(sc, "[...document.querySelectorAll('button')].some(b => b.textContent.includes('Escanear documento'))", 60, "botón Escanear documento (DocumentUploader dentro de la APK)");
            screenshot("1-documentos-boton-escanear");

            // Tipo INE (select controlado por React)
            js(sc, "(function(){const s=document.querySelector('select');const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,'ine');s.dispatchEvent(new Event('change',{bubbles:true}));return s.value})()");
            // Única sustitución: la pantalla de cámara del escáner de Google Play entrega la imagen sintética + OCR real de ML Kit.
            js(sc, "window.__scan = " + obs.toString() + "; window.Capacitor.Plugins.SofiaDocumentScanner.scanAndRecognize = async () => window.__scan; true");
            js(sc, "[...document.querySelectorAll('button')].find(b => b.textContent.includes('Escanear documento')).click()");

            waitFor(sc, "/\\/documents\\/[0-9a-f-]{36}/.test(location.pathname) && document.body.innerText.includes('DATOS ENCONTRADOS') && document.body.innerText.includes('confianza')", 90, "pantalla de revisión con datos OBSERVADOS");
            String docId = js(sc, "location.pathname.split('/').pop()").replace("\"", "");
            int observed = Integer.parseInt(js(sc, "[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Confirmar').length"));
            assertTrue("se esperaban datos observados por confirmar, hubo " + observed, observed >= 8);
            screenshot("2-revision-observados");

            // Mario confirma cada dato (uno por uno, como en la tablet)
            for (int i = 0; i < 25; i++) {
                String left = js(sc, "(function(){const b=[...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Confirmar' && !x.disabled); if(!b) return 0; b.click(); return 1})()");
                if ("0".equals(left)) break;
                Thread.sleep(1500);
            }
            js(sc, "location.reload()");
            waitFor(sc, "document.body.innerText.includes('DATOS ENCONTRADOS') && ![...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Confirmar')", 60, "todos los datos confirmados");
            int confirmed = Integer.parseInt(js(sc, "[...document.querySelectorAll('span')].filter(s => s.textContent.trim() === 'Confirmado').length"));
            assertTrue("confirmados: " + confirmed, confirmed >= observed);
            screenshot("3-confirmados");

            // Solicitud BBVA con lo confirmado
            js(sc, "location.href = '" + server + "/customers/" + customer + "/credit'");
            waitFor(sc, "[...document.querySelectorAll('button')].some(b => /BBVA/.test(b.textContent))", 60, "botón BBVA");
            js(sc, "[...document.querySelectorAll('button')].find(b => /BBVA/.test(b.textContent)).click()");
            waitFor(sc, "/\\/credit\\/[0-9a-f-]{36}/.test(location.pathname)", 60, "solicitud creada");
            String appId = js(sc, "location.pathname.split('/').pop()").replace("\"", "");
            js(sc, "location.href = location.pathname + '?step=pdf'");
            waitFor(sc, "[...document.querySelectorAll('button')].some(b => b.textContent.includes('Generar borrador PDF'))", 60, "paso PDF");
            js(sc, "[...document.querySelectorAll('button')].find(b => b.textContent.includes('Generar borrador PDF')).click()");
            waitFor(sc, "document.body.innerText.includes('SOLICITUD GENERADA')", 90, "SOLICITUD GENERADA");
            String gen = js(sc, "document.querySelector('a[href^=\"/api/documents/generated/\"]').getAttribute('href').split('/').pop()").replace("\"", "");
            screenshot("4-solicitud-generada");
            Log.i(DEMO, "RESULT doc=" + docId + " app=" + appId + " generated=" + gen + " observed=" + observed + " confirmed=" + confirmed);
        }
    }
}
