package mx.sofia.mario;

import android.app.Activity;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanner;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;

/**
 * Escáner de documentos nativo: ML Kit Document Scanner (captura guiada, bordes, recorte,
 * enderezado, mejora) + ML Kit Text Recognition v2 en el dispositivo.
 *
 * - No guarda nada en la galería: las imágenes quedan en la caché privada de la app y se borran
 *   después de entregarlas (scanAndRecognize).
 * - No hay llaves ni servicios externos: el OCR corre en la tablet (cero tokens).
 * - Nunca escribe texto reconocido en logs.
 */
@CapacitorPlugin(name = "SofiaDocumentScanner")
public class SofiaDocumentScannerPlugin extends Plugin {

    private static final int MAX_FILE_BYTES = 14 * 1024 * 1024;

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private ActivityResultLauncher<IntentSenderRequest> launcher;
    private PluginCall pending;
    private boolean pendingRecognize;

    @Override
    public void load() {
        // Se registra durante onCreate de la actividad (antes de STARTED), como exige AndroidX.
        launcher = getActivity().registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), this::onScanResult);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        int gms = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext());
        JSObject ret = new JSObject();
        ret.put("scanner", gms == ConnectionResult.SUCCESS);
        ret.put("ocr", true);
        call.resolve(ret);
    }

    /** Escanea y devuelve las páginas (URIs en caché) y el archivo, sin OCR. */
    @PluginMethod
    public void scanDocument(PluginCall call) {
        startScan(call, false);
    }

    /** Escanea, reconoce el texto de cada página y devuelve observación + archivo para subir. */
    @PluginMethod
    public void scanAndRecognize(PluginCall call) {
        startScan(call, true);
    }

    /** OCR de una imagen ya existente (file:// o content://). */
    @PluginMethod
    public void recognizeText(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || uri.isEmpty()) {
            call.reject("Falta uri");
            return;
        }
        worker.execute(() -> {
            try {
                JSObject ret = new JSObject();
                ret.put("engine", "mlkit-text-v2");
                JSONArray pages = new JSONArray();
                pages.put(SofiaOcr.recognize(getContext(), Uri.parse(uri)));
                ret.put("pages", pages);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("No se pudo leer el texto de la imagen.", "OCR_FAILED");
            }
        });
    }

    /**
     * OCR de una foto que ya tiene la página (cámara o galería), en base64. Se escribe en la caché
     * privada solo para que ML Kit respete la orientación EXIF, y se borra al terminar.
     */
    @PluginMethod
    public void recognizeImage(PluginCall call) {
        String b64 = call.getString("base64");
        if (b64 == null || b64.isEmpty()) {
            call.reject("Falta la imagen");
            return;
        }
        worker.execute(() -> {
            File tmp = null;
            try {
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                if (bytes.length > MAX_FILE_BYTES) {
                    call.reject("La foto pesa demasiado.", "TOO_LARGE");
                    return;
                }
                tmp = File.createTempFile("ocr-", ".img", getContext().getCacheDir());
                try (java.io.FileOutputStream fo = new java.io.FileOutputStream(tmp)) {
                    fo.write(bytes);
                }
                JSObject ret = new JSObject();
                ret.put("engine", "mlkit-text-v2");
                JSONArray pages = new JSONArray();
                pages.put(SofiaOcr.recognize(getContext(), Uri.fromFile(tmp)));
                ret.put("pages", pages);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("No se pudo leer el texto de la foto.", "OCR_FAILED");
            } finally {
                if (tmp != null) {
                    //noinspection ResultOfMethodCallIgnored
                    tmp.delete();
                }
            }
        });
    }

    private void startScan(PluginCall call, boolean recognize) {
        if (pending != null) {
            call.reject("Ya hay un escaneo en curso.", "BUSY");
            return;
        }
        int gms = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext());
        if (gms != ConnectionResult.SUCCESS) {
            call.reject("Esta tablet no tiene Google Play services: usa “Tomar foto” o “Elegir archivos”.", "UNAVAILABLE");
            return;
        }
        int pageLimit = Math.max(1, Math.min(10, call.getInt("pageLimit", 2)));
        boolean gallery = Boolean.TRUE.equals(call.getBoolean("galleryImport", true));
        GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(gallery)
            .setPageLimit(pageLimit)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG, GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build();
        GmsDocumentScanner scanner = GmsDocumentScanning.getClient(options);
        pending = call;
        pendingRecognize = recognize;
        scanner
            .getStartScanIntent(getActivity())
            .addOnSuccessListener(sender -> launcher.launch(new IntentSenderRequest.Builder(sender).build()))
            .addOnFailureListener(e -> {
                PluginCall c = pending;
                pending = null;
                if (c != null) c.reject("No se pudo abrir el escáner. Si es la primera vez, Google Play lo está descargando: intenta en un minuto.", "UNAVAILABLE");
            });
    }

    private void onScanResult(ActivityResult result) {
        PluginCall call = pending;
        boolean recognize = pendingRecognize;
        pending = null;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Escaneo cancelado.", "CANCELLED");
            return;
        }
        GmsDocumentScanningResult scan = GmsDocumentScanningResult.fromActivityResultIntent(result.getData());
        if (scan == null || scan.getPages() == null || scan.getPages().isEmpty()) {
            call.reject("El escáner no devolvió páginas.", "EMPTY");
            return;
        }
        worker.execute(() -> deliver(call, scan, recognize));
    }

    private void deliver(PluginCall call, GmsDocumentScanningResult scan, boolean recognize) {
        List<Uri> toDelete = new ArrayList<>();
        try {
            List<GmsDocumentScanningResult.Page> pages = scan.getPages();
            JSObject ret = new JSObject();
            ret.put("engine", "mlkit-text-v2");
            ret.put("pageCount", pages.size());
            JSONArray obsPages = new JSONArray();
            JSONArray uris = new JSONArray();
            for (GmsDocumentScanningResult.Page p : pages) {
                Uri uri = p.getImageUri();
                uris.put(uri.toString());
                toDelete.add(uri);
                if (recognize) obsPages.put(SofiaOcr.recognize(getContext(), uri));
            }
            ret.put("uris", uris);
            if (recognize) ret.put("pages", obsPages);

            // Archivo a subir: 1 página → JPEG; varias (frente y reverso) → el PDF del escáner.
            GmsDocumentScanningResult.Pdf pdf = scan.getPdf();
            if (pdf != null) toDelete.add(pdf.getUri());
            Uri fileUri = pages.size() == 1 || pdf == null ? pages.get(0).getImageUri() : pdf.getUri();
            String mime = pages.size() == 1 || pdf == null ? "image/jpeg" : "application/pdf";
            byte[] bytes = readAll(fileUri);
            if (bytes.length > MAX_FILE_BYTES) {
                call.reject("El escaneo pesa demasiado. Escanea menos páginas.", "TOO_LARGE");
                return;
            }
            JSObject file = new JSObject();
            file.put("mime", mime);
            file.put("name", mime.equals("application/pdf") ? "escaneo.pdf" : "escaneo.jpg");
            file.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
            ret.put("file", file);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("No se pudo procesar el escaneo.", "OCR_FAILED");
        } finally {
            // Solo en scanAndRecognize: los archivos ya viajaron al servidor privado; no quedan en la tablet.
            if (recognize) for (Uri u : toDelete) deleteQuietly(u);
        }
    }

    private byte[] readAll(Uri uri) throws Exception {
        try (InputStream in = getContext().getContentResolver().openInputStream(uri); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (in == null) throw new IllegalStateException("sin datos");
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > MAX_FILE_BYTES + 1) break;
            }
            return out.toByteArray();
        }
    }

    private void deleteQuietly(Uri uri) {
        try {
            if ("file".equals(uri.getScheme()) && uri.getPath() != null) {
                //noinspection ResultOfMethodCallIgnored
                new File(uri.getPath()).delete();
            }
        } catch (Exception ignored) {
            // nada
        }
    }

    @Override
    protected void handleOnDestroy() {
        worker.shutdown();
    }
}
