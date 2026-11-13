import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
System.out.println("Banana Chips Inventory berjalan di port " + PORT);

public class Main {

    static final int PORT = Integer.parseInt(
    System.getenv().getOrDefault("PORT", "8080")
);
    static final Path WEB = Paths.get("web");
    static final Path DATA = Paths.get("data");
    static final Path PRODUCTS = DATA.resolve("produk.tsv");
    static final Path TRANSACTIONS = DATA.resolve("transaksi.tsv");

    static final List<String> VARIANTS = Arrays.asList(
        "Original", "Cokelat", "Susu", "Keju", "Karamel"
    );

    static List<Product> products = new ArrayList<>();
    static List<Transaction> transactions = new ArrayList<>();

    static class Product {
        String code, name;
        double price;
        int stock;

        Product(String code, String name, double price, int stock) {
            this.code = code;
            this.name = name;
            this.price = price;
            this.stock = stock;
        }
    }

    static class Transaction {
        String id, date, code, type;
        int quantity;

        Transaction(String id, String date, String code,
                    String type, int quantity) {
            this.id = id;
            this.date = date;
            this.code = code;
            this.type = type;
            this.quantity = quantity;
        }
    }

    public static void main(String[] args) throws Exception {
        Files.createDirectories(DATA);

        loadData();

        HttpServer server = HttpServer.create(
            new InetSocketAddress("0.0.0.0", PORT), 0
        );

        server.createContext("/", Main::handleRequest);
        server.setExecutor(null);
        server.start();

        String url = "http://localhost:" + PORT;
        System.out.println("Banana Chips Inventory berjalan di " + url);

        try {
            if (Desktop.isDesktopSupported()) {
                Desktop.getDesktop().browse(URI.create(url));
            }
        } catch (Exception e) {
            System.out.println("Buka browser dan kunjungi: " + url);
        }
    }

    static synchronized void loadData() throws IOException {
        products.clear();
        transactions.clear();

        if (Files.exists(PRODUCTS)) {
            for (String line : Files.readAllLines(PRODUCTS)) {
                String[] p = line.split("\t", -1);
                if (p.length == 4) {
                    products.add(new Product(
                        p[0], p[1],
                        Double.parseDouble(p[2]),
                        Integer.parseInt(p[3])
                    ));
                }
            }
        }

        if (Files.exists(TRANSACTIONS)) {
            for (String line : Files.readAllLines(TRANSACTIONS)) {
                String[] t = line.split("\t", -1);
                if (t.length == 5) {
                    transactions.add(new Transaction(
                        t[0], t[1], t[2], t[3],
                        Integer.parseInt(t[4])
                    ));
                }
            }
        }
    }

    static synchronized void saveProducts() throws IOException {
        List<String> lines = new ArrayList<>();

        for (Product p : products) {
            lines.add(p.code + "\t" + p.name + "\t"
                + p.price + "\t" + p.stock);
        }

        Files.write(PRODUCTS, lines, StandardCharsets.UTF_8);
    }

    static synchronized void saveTransactions() throws IOException {
        List<String> lines = new ArrayList<>();

        for (Transaction t : transactions) {
            lines.add(t.id + "\t" + t.date + "\t"
                + t.code + "\t" + t.type + "\t" + t.quantity);
        }

        Files.write(TRANSACTIONS, lines, StandardCharsets.UTF_8);
    }

    static void handleRequest(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        String method = ex.getRequestMethod();

        try {
            if (path.equals("/api/state") && method.equals("GET")) {
                sendJson(ex, 200, getState());
            } else if (path.equals("/api/product") && method.equals("POST")) {
                addProduct(ex);
            } else if (path.equals("/api/transaction") && method.equals("POST")) {
                addTransaction(ex);
            } else {
                serveStatic(ex, path);
            }
        } catch (IllegalArgumentException e) {
            sendJson(ex, 400, "{\"error\":\"" + jsonEscape(e.getMessage()) + "\"}");
        } catch (Exception e) {
            e.printStackTrace();
            sendJson(ex, 500, "{\"error\":\"Terjadi kesalahan pada server.\"}");
        }
    }

    static synchronized String getState() {
        StringBuilder json = new StringBuilder();
        json.append("{\"products\":[");

        for (int i = 0; i < products.size(); i++) {
            Product p = products.get(i);
            if (i > 0) json.append(",");

            json.append("{")
                .append("\"code\":\"").append(jsonEscape(p.code)).append("\",")
                .append("\"name\":\"").append(jsonEscape(p.name)).append("\",")
                .append("\"price\":").append(p.price).append(",")
                .append("\"stock\":").append(p.stock)
                .append("}");
        }

        json.append("],\"transactions\":[");

        for (int i = transactions.size() - 1; i >= 0; i--) {
            Transaction t = transactions.get(i);
            if (i < transactions.size() - 1) json.append(",");

            Product p = findProduct(t.code);
            String name = p == null ? t.code : p.name;

            json.append("{")
                .append("\"id\":\"").append(jsonEscape(t.id)).append("\",")
                .append("\"date\":\"").append(jsonEscape(t.date)).append("\",")
                .append("\"code\":\"").append(jsonEscape(t.code)).append("\",")
                .append("\"name\":\"").append(jsonEscape(name)).append("\",")
                .append("\"type\":\"").append(jsonEscape(t.type)).append("\",")
                .append("\"quantity\":").append(t.quantity)
                .append("}");
        }

        json.append("]}");
        return json.toString();
    }

    static synchronized void addProduct(HttpExchange ex) throws Exception {
        Map<String, String> form = readForm(ex);

        String code = clean(form.get("code"));
        String name = clean(form.get("name"));
        double price = Double.parseDouble(form.get("price"));
        int stock = Integer.parseInt(form.get("stock"));

        if (code.isEmpty() || name.isEmpty()) {
            throw new IllegalArgumentException("Kode dan nama produk wajib diisi.");
        }

        if (!VARIANTS.contains(name)) {
            throw new IllegalArgumentException("Pilih varian produk yang tersedia.");
        }

        if (price < 0 || stock < 0) {
            throw new IllegalArgumentException("Harga dan stok tidak boleh negatif.");
        }

        if (findProduct(code) != null) {
            throw new IllegalArgumentException("Kode produk sudah digunakan.");
        }

        for (Product p : products) {
            if (p.name.equalsIgnoreCase(name)) {
                throw new IllegalArgumentException("Varian produk tersebut sudah terdaftar.");
            }
        }

        if (products.size() >= 5) {
            throw new IllegalArgumentException("Maksimal hanya 5 varian produk.");
        }

        products.add(new Product(code, name, price, stock));
        saveProducts();

        sendJson(ex, 200, "{\"message\":\"Produk berhasil ditambahkan.\"}");
    }

    static synchronized void addTransaction(HttpExchange ex) throws Exception {
        Map<String, String> form = readForm(ex);

        String code = clean(form.get("code"));
        String type = clean(form.get("type"));
        String date = clean(form.get("date"));
        int quantity = Integer.parseInt(form.get("quantity"));

        Product p = findProduct(code);

        if (p == null) {
            throw new IllegalArgumentException("Produk tidak ditemukan.");
        }

        if (!type.equals("Masuk") && !type.equals("Keluar")) {
            throw new IllegalArgumentException("Jenis transaksi tidak valid.");
        }

        LocalDate.parse(date);

        if (quantity <= 0) {
            throw new IllegalArgumentException("Jumlah harus lebih dari 0.");
        }

        if (type.equals("Keluar") && quantity > p.stock) {
            throw new IllegalArgumentException("Stok tidak mencukupi.");
        }

        if (type.equals("Masuk")) {
            p.stock += quantity;
        } else {
            p.stock -= quantity;
        }

        String id = "TRX" + System.currentTimeMillis();

        transactions.add(new Transaction(
            id, date, code, type, quantity
        ));

        saveProducts();
        saveTransactions();

        sendJson(ex, 200, "{\"message\":\"Transaksi berhasil disimpan.\"}");
    }

    static Product findProduct(String code) {
        for (Product p : products) {
            if (p.code.equalsIgnoreCase(code)) return p;
        }
        return null;
    }

    static Map<String, String> readForm(HttpExchange ex) throws IOException {
        String body = new String(
            ex.getRequestBody().readAllBytes(),
            StandardCharsets.UTF_8
        );

        Map<String, String> result = new HashMap<>();

        for (String pair : body.split("&")) {
            String[] parts = pair.split("=", 2);
            String key = URLDecoder.decode(parts[0], StandardCharsets.UTF_8);
            String value = parts.length > 1
                ? URLDecoder.decode(parts[1], StandardCharsets.UTF_8)
                : "";
            result.put(key, value);
        }

        return result;
    }

    static String clean(String value) {
        if (value == null) return "";
        return value.trim().replace("\t", " ").replace("\n", " ");
    }

    static String jsonEscape(String value) {
        return value.replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r");
    }

    static void serveStatic(HttpExchange ex, String path) throws IOException {
        String file;

        if (path.equals("/") || path.equals("/index.html")) {
            file = "index.html";
        } else if (path.equals("/style.css")) {
            file = "style.css";
        } else if (path.equals("/script.js")) {
            file = "script.js";
        } else {
            sendJson(ex, 404, "{\"error\":\"Halaman tidak ditemukan.\"}");
            return;
        }

        Path target = WEB.resolve(file);

        if (!Files.exists(target)) {
            sendJson(ex, 404, "{\"error\":\"File " + file + " belum tersedia.\"}");
            return;
        }

        String contentType = file.endsWith(".css")
            ? "text/css; charset=UTF-8"
            : file.endsWith(".js")
            ? "application/javascript; charset=UTF-8"
            : "text/html; charset=UTF-8";

        byte[] bytes = Files.readAllBytes(target);
        ex.getResponseHeaders().set("Content-Type", contentType);
        ex.sendResponseHeaders(200, bytes.length);

        try (OutputStream out = ex.getResponseBody()) {
            out.write(bytes);
        }
    }

    static void sendJson(HttpExchange ex, int status, String json)
            throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);

        ex.getResponseHeaders().set(
            "Content-Type", "application/json; charset=UTF-8"
        );

        ex.sendResponseHeaders(status, bytes.length);

        try (OutputStream out = ex.getResponseBody()) {
            out.write(bytes);
        }
    }
}
