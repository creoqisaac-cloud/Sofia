package mx.sofia.mario;

import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.service.notification.StatusBarNotification;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.MethodSorters;

/**
 * Funciones de la tablet probadas EN la APK contra un servidor Sofía real (emulador de CI), con datos
 * sintéticos: arranque sin servidor, alarma real de Android, recordatorios programados, INE por foto
 * (OCR real de ML Kit, sin sustituciones) hasta la solicitud, y correo de placas enviado por Sofía.
 */
@RunWith(AndroidJUnit4.class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class TabletFeaturesInstrumentedTest {

    private static final String TAG = "SOFIA_DEMO";
    private static final String PKG = "mx.sofia.mario";

    private Context appCtx() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    private Bundle args() {
        return InstrumentationRegistry.getArguments();
    }

    private void shell(String cmd) {
        try {
            ParcelFileDescriptor pfd = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(cmd);
            try (InputStream in = new FileInputStream(pfd.getFileDescriptor())) {
                byte[] buf = new byte[1024];
                while (in.read(buf) > 0) {
                    // consumir la salida para que el comando termine
                }
            }
            pfd.close();
        } catch (Exception e) {
            Log.w(TAG, "shell falló: " + cmd);
        }
    }

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

    private void click(ActivityScenario<MainActivity> sc, String selector, String textPart) throws Exception {
        String r = js(sc, "(function(){const el=[...document.querySelectorAll('" + selector + "')].find(b => b.textContent.includes('" + textPart + "') && !b.disabled); if(!el) return 0; el.click(); return 1})()");
        assertTrue("No encontré '" + textPart + "'", "1".equals(r));
    }

    private void screenshot(String name) {
        try {
            Thread.sleep(800);
            Bitmap shot = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
            File dir = appCtx().getExternalFilesDir("demo");
            if (shot == null || dir == null) return;
            try (FileOutputStream fo = new FileOutputStream(new File(dir, name + ".png"))) {
                shot.compress(Bitmap.CompressFormat.PNG, 100, fo);
            }
        } catch (Exception e) {
            Log.w(TAG, "screenshot " + name + " falló");
        }
    }

    private ActivityScenario<MainActivity> launch(String serverUrl) {
        android.content.SharedPreferences.Editor e = appCtx().getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE).edit().clear();
        if (serverUrl != null) e.putString("serverUrl", serverUrl);
        e.commit();
        return ActivityScenario.launch(MainActivity.class);
    }

    private ActivityScenario<MainActivity> launchServer(String server) throws Exception {
        shell("pm grant " + PKG + " android.permission.POST_NOTIFICATIONS");
        shell("appops set " + PKG + " SCHEDULE_EXACT_ALARM allow");
        ActivityScenario<MainActivity> sc = launch(server);
        waitFor(sc, "window.Capacitor && document.readyState === 'complete' && location.href.indexOf('" + server + "') === 0", 60, "servidor Sofía");
        return sc;
    }

    private void go(ActivityScenario<MainActivity> sc, String url) throws Exception {
        js(sc, "location.href = '" + url + "'; true");
        Thread.sleep(1200);
    }

    private String server() {
        String s = args().getString("sofiaServer");
        assumeTrue("Sin servidor de demo", s != null);
        return s;
    }

    // ───────── 1. Arranque sin servidor: nunca en negro ─────────

    @Test
    public void a1_arranqueSinServidorMuestraConexion() throws Exception {
        try (ActivityScenario<MainActivity> sc = launch(null)) {
            waitFor(sc, "location.href.indexOf('conexion.html') >= 0 && document.body && document.body.innerText.length > 30", 15, "pantalla Conexión local");
            screenshot("0-arranque-sin-servidor");
        }
    }

    // ───────── 2. Alarma real de Android ─────────

    @Test
    public void a2_alarmaSuenaEnLaTablet() throws Exception {
        String server = server();
        try (ActivityScenario<MainActivity> sc = launchServer(server)) {
            go(sc, server + "/settings/reminders?modo=tablet");
            waitFor(sc, "document.body.innerText.includes('Avisos en esta tablet')", 60, "ajustes de recordatorios (nativo)");
            screenshot("5-recordatorios-ajustes");
            click(sc, "button", "Probar alarma");
            NotificationManager nm = (NotificationManager) appCtx().getSystemService(Context.NOTIFICATION_SERVICE);
            boolean shown = false;
            long end = System.currentTimeMillis() + 40_000;
            while (!shown && System.currentTimeMillis() < end) {
                for (StatusBarNotification n : nm.getActiveNotifications()) {
                    CharSequence t = n.getNotification().extras.getCharSequence(Notification.EXTRA_TITLE);
                    if (t != null && t.toString().contains("Prueba de Sofía")) shown = true;
                }
                if (!shown) Thread.sleep(1000);
            }
            screenshot("6-alarma-en-la-tablet");
            assertTrue("La alarma de prueba no apareció en Android", shown);
            Log.i(TAG, "ALARM shown=true");
        }
    }

    // ───────── 3. Recordatorios del servidor programados en Android ─────────

    @Test
    public void a3_recordatoriosQuedanProgramados() throws Exception {
        String server = server();
        try (ActivityScenario<MainActivity> sc = launchServer(server)) {
            go(sc, server + "/settings/reminders?modo=tablet");
            waitFor(sc, "document.body.innerText.includes('Avisos en esta tablet')", 60, "ajustes de recordatorios");
            js(sc, "window.__r = null; fetch('/api/reminders', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({at: new Date(Date.now()+2*3600e3).toISOString(), text:'Llamar a cliente sintético', alarm:true})}).then(r => window.__r = r.status); true");
            waitFor(sc, "window.__r === 200", 20, "recordatorio creado");
            click(sc, "button", "Actualizar avisos");
            waitFor(sc, "document.body.innerText.includes('aviso(s) programados')", 30, "sincronización");
            js(sc, "window.__p = null; window.Capacitor.Plugins.LocalNotifications.getPending().then(p => window.__p = JSON.stringify(p.notifications.map(n => n.title))); true");
            waitFor(sc, "window.__p !== null", 20, "pendientes de Android");
            String pending = js(sc, "window.__p");
            assertTrue("No quedó programado en Android: " + pending, pending.contains("Llamar a cliente sintético"));
            go(sc, server + "/settings/reminders?modo=tablet");
            waitFor(sc, "document.body.innerText.includes('Llamar a cliente sintético')", 30, "lista de próximos avisos");
            screenshot("7-recordatorios-programados");
            Log.i(TAG, "REMINDERS pending=" + pending.length());
        }
    }

    // ───────── 4. INE por foto → datos observados → confirmar todos → solicitud ─────────

    @Test
    public void a4_fotoIneLlenaSolicitud() throws Exception {
        String server = server();
        String customer = args().getString("sofiaCustomer2");
        assumeTrue("Sin cliente 2", customer != null);
        // Foto (JPEG) de la credencial sintética: como la que toma la cámara.
        Bitmap bmp;
        try (InputStream in = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("ine-sintetica-frente.png")) {
            bmp = BitmapFactory.decodeStream(in);
        }
        ByteArrayOutputStream jpg = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.JPEG, 88, jpg);
        String b64 = Base64.encodeToString(jpg.toByteArray(), Base64.NO_WRAP);

        try (ActivityScenario<MainActivity> sc = launchServer(server)) {
            go(sc, server + "/customers/" + customer + "/credit?modo=tablet");
            waitFor(sc, "[...document.querySelectorAll('button')].some(b => /BBVA/.test(b.textContent))", 60, "botón BBVA");
            click(sc, "button", "BBVA");
            waitFor(sc, "/\\/credit\\/[0-9a-f-]{36}/.test(location.pathname)", 60, "solicitud creada");
            String appId = js(sc, "location.pathname.split('/').pop()").replace("\"", "");
            waitFor(sc, "[...document.querySelectorAll('a')].some(a => a.textContent.includes('Llenar con foto o escaneo de la INE'))", 60, "atajo INE en la solicitud");
            screenshot("8-solicitud-atajo-ine");
            click(sc, "a", "Llenar con foto o escaneo de la INE");
            waitFor(sc, "location.pathname.endsWith('/documents') && location.search.includes('tipo=ine') && document.querySelector('input[capture]')", 60, "documentos con tipo INE");
            // La foto entra por el mismo <input> de la cámara; el OCR corre en la tablet (ML Kit real).
            js(sc, "window.__ine = '" + b64 + "'; true");
            js(sc, "(function(){const bin=atob(window.__ine);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);const f=new File([u],'foto-ine.jpg',{type:'image/jpeg'});const dt=new DataTransfer();dt.items.add(f);const inp=document.querySelector('input[capture]');inp.files=dt.files;inp.dispatchEvent(new Event('change',{bubbles:true}));return 1})()");
            waitFor(sc, "/\\/documents\\/[0-9a-f-]{36}/.test(location.pathname) && document.body.innerText.includes('DATOS ENCONTRADOS') && document.body.innerText.includes('confianza')", 120, "revisión con datos OBSERVADOS de la foto");
            String docId = js(sc, "location.pathname.split('/').pop()").replace("\"", "");
            int observed = Integer.parseInt(js(sc, "[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Confirmar').length"));
            assertTrue("La foto debía producir datos observados: " + observed, observed >= 6);
            screenshot("9-foto-ine-observados");
            click(sc, "button", "confirmar todos");
            Thread.sleep(3000);
            js(sc, "location.reload(); true");
            waitFor(sc, "document.body.innerText.includes('DATOS ENCONTRADOS') && ![...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Confirmar')", 60, "todo confirmado");
            screenshot("10-foto-ine-confirmados");
            click(sc, "a", "Volver a la solicitud");
            waitFor(sc, "location.pathname.endsWith('/credit/" + appId + "')", 60, "regreso a la solicitud");
            go(sc, server + "/customers/" + customer + "/credit/" + appId + "?step=pdf");
            waitFor(sc, "[...document.querySelectorAll('button')].some(b => b.textContent.includes('Generar borrador PDF'))", 60, "paso PDF");
            click(sc, "button", "Generar borrador PDF");
            waitFor(sc, "document.body.innerText.includes('SOLICITUD GENERADA')", 90, "SOLICITUD GENERADA");
            String gen = js(sc, "document.querySelector('a[href^=\"/api/documents/generated/\"]').getAttribute('href').split('/').pop()").replace("\"", "");
            screenshot("11-solicitud-desde-foto");
            Log.i(TAG, "PHOTO doc=" + docId + " app=" + appId + " generated=" + gen + " observed=" + observed);
        }
    }

    // ───────── 5. Correo de placas enviado por Sofía (con adjunto) ─────────

    @Test
    public void a5_correoPlacasSaleDesdeSofia() throws Exception {
        String server = server();
        String customer = args().getString("sofiaCustomer2");
        String to = args().getString("sofiaPlatesTo");
        assumeTrue("Sin cliente/destinatario", customer != null && to != null);
        try (ActivityScenario<MainActivity> sc = launchServer(server)) {
            go(sc, server + "/settings/email?modo=tablet");
            waitFor(sc, "document.body.innerText.includes('conectada')", 60, "cuenta de correo conectada");
            screenshot("12-correo-de-sofia");
            go(sc, server + "/plates/new?customer=" + customer + "&modo=tablet");
            waitFor(sc, "[...document.querySelectorAll('button')].some(b => b.textContent.includes('Abrir trámite de placas'))", 60, "abrir trámite");
            click(sc, "button", "Abrir trámite de placas");
            waitFor(sc, "/\\/plates\\/[0-9a-f-]{36}/.test(location.pathname) && [...document.querySelectorAll('button')].some(b => b.textContent.includes('Preparar correo de placas'))", 60, "trámite de placas");
            click(sc, "button", "Preparar correo de placas");
            waitFor(sc, "/\\/emails\\/[0-9a-f-]{36}/.test(location.pathname) && document.querySelector('input[name=to]')", 60, "borrador del correo");
            String emailId = js(sc, "location.pathname.split('/').pop()").replace("\"", "");
            js(sc, "(function(){const i=document.querySelector('input[name=to]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'" + to + "');i.dispatchEvent(new Event('input',{bubbles:true}));return i.value})()");
            click(sc, "button", "Guardar cambios");
            waitFor(sc, "document.body.innerText.includes('Borrador guardado')", 30, "borrador guardado");
            screenshot("13-correo-placas-borrador");
            click(sc, "button", "Enviar");
            waitFor(sc, "[...document.querySelectorAll('button')].some(b => b.textContent.includes('Sí, enviar'))", 20, "confirmación de envío");
            click(sc, "button", "Sí, enviar");
            waitFor(sc, "document.body.innerText.includes('Correo enviado')", 60, "correo enviado");
            screenshot("14-correo-placas-enviado");
            Log.i(TAG, "EMAIL id=" + emailId + " to=" + to);
        }
    }
}
