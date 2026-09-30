package mx.sofia.mario;

import android.content.Context;
import android.graphics.Rect;
import android.net.Uri;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * OCR EN EL DISPOSITIVO con ML Kit Text Recognition v2 (modelo incluido en la APK: funciona sin
 * internet y sin costo por documento). Conserva la estructura: bloques → renglones → elementos,
 * con cajas y confianza. Nunca registra el texto en logs (es PII).
 */
public final class SofiaOcr {

    private SofiaOcr() {}

    /** Bloqueante: llamar fuera del hilo principal. */
    public static JSONObject recognize(Context ctx, Uri uri) throws Exception {
        return recognize(InputImage.fromFilePath(ctx, uri), uri.toString());
    }

    /** Bloqueante: llamar fuera del hilo principal. */
    public static JSONObject recognize(InputImage image, String uri) throws Exception {
        TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        try {
            Text text = Tasks.await(recognizer.process(image));
            return toPage(text, image.getWidth(), image.getHeight(), uri);
        } finally {
            recognizer.close();
        }
    }

    static JSONObject toPage(Text text, int width, int height, String uri) throws JSONException {
        JSONObject page = new JSONObject();
        if (uri != null) page.put("uri", uri);
        page.put("width", width);
        page.put("height", height);
        JSONArray blocks = new JSONArray();
        for (Text.TextBlock b : text.getTextBlocks()) {
            Rect bb = b.getBoundingBox();
            if (bb == null) continue;
            JSONObject block = new JSONObject();
            block.put("text", b.getText());
            block.put("box", box(bb));
            JSONArray lines = new JSONArray();
            for (Text.Line l : b.getLines()) {
                Rect lb = l.getBoundingBox();
                if (lb == null) continue;
                JSONObject line = new JSONObject();
                line.put("text", l.getText());
                line.put("box", box(lb));
                putConfidence(line, l.getConfidence());
                JSONArray elements = new JSONArray();
                for (Text.Element e : l.getElements()) {
                    JSONObject el = new JSONObject();
                    el.put("text", e.getText());
                    Rect eb = e.getBoundingBox();
                    if (eb != null) el.put("box", box(eb));
                    putConfidence(el, e.getConfidence());
                    elements.put(el);
                }
                line.put("elements", elements);
                lines.put(line);
            }
            block.put("lines", lines);
            blocks.put(block);
        }
        page.put("blocks", blocks);
        return page;
    }

    private static void putConfidence(JSONObject o, float c) throws JSONException {
        // ML Kit v2 expone confianza por renglón/elemento (0..1); si no la calcula, no se inventa.
        if (c > 0f && c <= 1f) o.put("confidence", (double) c);
    }

    private static JSONObject box(Rect r) throws JSONException {
        JSONObject o = new JSONObject();
        o.put("left", r.left);
        o.put("top", r.top);
        o.put("right", r.right);
        o.put("bottom", r.bottom);
        return o;
    }
}
