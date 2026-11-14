package com.vergel.cashflowhub;

import android.graphics.Bitmap;
import android.graphics.ImageDecoder;
import android.graphics.Rect;
import android.os.Build;
import android.graphics.BitmapFactory;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@CapacitorPlugin(name = "OrderScreenshot")
public class OrderScreenshotPlugin extends Plugin {
    @PluginMethod
    public void recognize(PluginCall call) {
        String encoded = call.getString("image");
        if (encoded == null || encoded.length() > 16_000_000) {
            call.reject("Choose a screenshot under 12 MB.");
            return;
        }
        Bitmap bitmap;
        try {
            bitmap = decode(Base64.decode(encoded, Base64.DEFAULT));
        } catch (Exception error) {
            call.reject("Could not open the selected screenshot.");
            return;
        }
        if (bitmap == null) {
            call.reject("Could not open the selected screenshot.");
            return;
        }
        var recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        recognizer.process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener(result -> {
                JSObject response = new JSObject();
                response.put("text", readRows(result));
                call.resolve(response);
            })
            .addOnFailureListener(error -> call.reject("Android could not read this screenshot.", error))
            .addOnCompleteListener(task -> {
                recognizer.close();
                bitmap.recycle();
            });
    }

    private static Bitmap decode(byte[] bytes) throws java.io.IOException {
        if (Build.VERSION.SDK_INT >= 28) {
            return ImageDecoder.decodeBitmap(ImageDecoder.createSource(ByteBuffer.wrap(bytes)),
                (decoder, info, source) -> {
                    decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                    int width = info.getSize().getWidth();
                    int height = info.getSize().getHeight();
                    double scale = Math.min(1, 2200.0 / Math.max(width, height));
                    decoder.setTargetSize(Math.max(1, (int) (width * scale)),
                        Math.max(1, (int) (height * scale)));
                });
        }
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        options.inSampleSize = 1;
        while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 3000) {
            options.inSampleSize *= 2;
        }
        options.inJustDecodeBounds = false;
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
    }

    private static String readRows(Text result) {
        List<Text.Line> lines = new ArrayList<>();
        for (Text.TextBlock block : result.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                if (line.getBoundingBox() != null) lines.add(line);
            }
        }
        lines.sort(Comparator.comparingInt(line -> line.getBoundingBox().centerY()));
        StringBuilder text = new StringBuilder();
        for (int first = 0; first < lines.size();) {
            Rect anchor = lines.get(first).getBoundingBox();
            int end = first + 1;
            while (end < lines.size()) {
                Rect next = lines.get(end).getBoundingBox();
                int overlap = Math.min(anchor.bottom, next.bottom) - Math.max(anchor.top, next.top);
                if (overlap * 2 < Math.min(anchor.height(), next.height())) break;
                end++;
            }
            List<Text.Line> row = lines.subList(first, end);
            row.sort(Comparator.comparingInt(line -> line.getBoundingBox().left));
            for (Text.Line line : row) text.append(line.getText()).append(' ');
            text.append('\n');
            first = end;
        }
        return text.toString();
    }
}
