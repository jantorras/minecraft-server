package cat.servidor.bridge.api;

import cat.servidor.bridge.BridgePlugin;
import cat.servidor.bridge.effects.EffectService;
import cat.servidor.bridge.luckperms.RoleService;
import cat.servidor.bridge.tab.TabService;
import cat.servidor.bridge.tags.TagService;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.logging.Level;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * API HTTP mínima (JDK HttpServer) protegida amb token Bearer.
 * Totes les respostes són JSON.
 */
public final class ApiServer {

    private static final int MAX_BODY_BYTES = 64 * 1024;

    private final BridgePlugin plugin;
    private final RoleService roles;
    private final TagService tags;
    private final TabService tab;
    private final EffectService effects;
    private final byte[] token;
    private final Gson gson = new GsonBuilder().serializeNulls().create();
    private final List<Route> routes = new ArrayList<>();

    private HttpServer server;
    private ExecutorService executor;

    public ApiServer(BridgePlugin plugin, RoleService roles, TagService tags, TabService tab, EffectService effects, String token) {
        this.plugin = plugin;
        this.roles = roles;
        this.tags = tags;
        this.tab = tab;
        this.effects = effects;
        this.token = token.getBytes(StandardCharsets.UTF_8);
        registerRoutes();
    }

    private void registerRoutes() {
        route("GET", "/api/health", (req) -> roles.health());

        route("GET", "/api/groups", (req) -> roles.listGroups());
        route("POST", "/api/groups", (req) -> roles.createGroup(req.body()));
        route("GET", "/api/groups/([^/]+)", (req) -> roles.getGroup(req.param(1)));
        route("PATCH", "/api/groups/([^/]+)", (req) -> roles.updateGroup(req.param(1), req.body()));
        route("DELETE", "/api/groups/([^/]+)", (req) -> roles.deleteGroup(req.param(1)));

        route("GET", "/api/players", (req) -> roles.listPlayers());
        route("GET", "/api/players/([^/]+)", (req) -> roles.getPlayer(req.param(1)));
        route("PUT", "/api/players/([^/]+)/group", (req) -> roles.setPlayerGroup(req.param(1), req.body()));
        route("POST", "/api/players/([^/]+)/groups", (req) -> roles.addPlayerGroup(req.param(1), req.body()));
        route("DELETE", "/api/players/([^/]+)/groups/([^/]+)", (req) -> roles.removePlayerGroup(req.param(1), req.param(2)));
        route("PATCH", "/api/players/([^/]+)/meta", (req) -> roles.updatePlayerMeta(req.param(1), req.body()));

        route("GET", "/api/tags", (req) -> tags.list());
        route("POST", "/api/tags", (req) -> tags.create(req.body()));
        route("GET", "/api/tags/([^/]+)", (req) -> tags.require(req.param(1)));
        route("PATCH", "/api/tags/([^/]+)", (req) -> tags.update(req.param(1), req.body()));
        route("DELETE", "/api/tags/([^/]+)", (req) -> {
            tags.delete(req.param(1));
            return null;
        });

        route("POST", "/api/players/([^/]+)/tags", (req) -> roles.grantTag(req.param(1), req.body()));
        route("DELETE", "/api/players/([^/]+)/tags/([^/]+)", (req) -> roles.revokeTag(req.param(1), req.param(2)));
        route("PUT", "/api/players/([^/]+)/tag", (req) -> roles.selectTag(req.param(1), req.body()));

        route("GET", "/api/tab", (req) -> tab.get());
        route("PATCH", "/api/tab", (req) -> tab.update(req.body()));

        route("GET", "/api/effects", (req) -> EffectService.EFFECTS);
        route("POST", "/api/players/([^/]+)/effect", (req) -> effects.apply(req.param(1), req.body()));
        route("DELETE", "/api/players/([^/]+)/effect", (req) -> effects.clear(req.param(1)));
    }

    public void start(String host, int port) throws IOException {
        executor = Executors.newFixedThreadPool(4, r -> {
            Thread t = new Thread(r, "Bridge-API");
            t.setDaemon(true);
            return t;
        });
        server = HttpServer.create(new InetSocketAddress(host, port), 0);
        server.setExecutor(executor);
        server.createContext("/", this::handle);
        server.start();
        plugin.getLogger().info("API escoltant a " + host + ":" + port);
    }

    public void stop() {
        if (server != null) {
            server.stop(0);
        }
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    private void handle(HttpExchange exchange) throws IOException {
        try {
            if (!authorized(exchange)) {
                send(exchange, 401, error("No autoritzat"));
                return;
            }

            String method = exchange.getRequestMethod();
            String path = exchange.getRequestURI().getRawPath();
            boolean pathMatched = false;

            for (Route route : routes) {
                Matcher m = route.pattern.matcher(path);
                if (!m.matches()) {
                    continue;
                }
                pathMatched = true;
                if (!route.method.equals(method)) {
                    continue;
                }
                Object result = route.handler.handle(new Request(exchange, m));
                send(exchange, 200, result == null ? Map.of("ok", true) : result);
                return;
            }
            send(exchange, pathMatched ? 405 : 404, error(pathMatched ? "Mètode no permès" : "Ruta no trobada"));
        } catch (Throwable t) {
            Throwable cause = t instanceof CompletionException && t.getCause() != null ? t.getCause() : t;
            if (cause instanceof ApiException api) {
                send(exchange, api.status(), error(api.getMessage()));
            } else if (cause instanceof JsonParseException) {
                send(exchange, 400, error("JSON invàlid"));
            } else {
                plugin.getLogger().log(Level.WARNING, "Error a l'API", cause);
                send(exchange, 500, error("Error intern"));
            }
        } finally {
            exchange.close();
        }
    }

    private boolean authorized(HttpExchange exchange) {
        String header = exchange.getRequestHeaders().getFirst("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            return false;
        }
        byte[] given = header.substring("Bearer ".length()).trim().getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(given, token);
    }

    private void send(HttpExchange exchange, int status, Object body) {
        try {
            byte[] bytes = gson.toJson(body).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        } catch (IOException ignored) {
            // El client ha tancat la connexió.
        }
    }

    private static Map<String, Object> error(String message) {
        return Map.of("error", message);
    }

    private void route(String method, String regex, Handler handler) {
        routes.add(new Route(method, Pattern.compile(regex), handler));
    }

    private record Route(String method, Pattern pattern, Handler handler) {
    }

    @FunctionalInterface
    private interface Handler {
        Object handle(Request request) throws Exception;
    }

    /** Petició amb accés als paràmetres de ruta i al cos JSON. */
    public final class Request {
        private final HttpExchange exchange;
        private final Matcher matcher;

        private Request(HttpExchange exchange, Matcher matcher) {
            this.exchange = exchange;
            this.matcher = matcher;
        }

        public String param(int index) {
            return URLDecoder.decode(matcher.group(index), StandardCharsets.UTF_8);
        }

        public JsonObject body() throws IOException {
            try (InputStream in = exchange.getRequestBody()) {
                byte[] bytes = in.readNBytes(MAX_BODY_BYTES + 1);
                if (bytes.length > MAX_BODY_BYTES) {
                    throw ApiException.badRequest("Cos massa gran");
                }
                if (bytes.length == 0) {
                    return new JsonObject();
                }
                JsonObject obj = gson.fromJson(new String(bytes, StandardCharsets.UTF_8), JsonObject.class);
                return obj == null ? new JsonObject() : obj;
            }
        }
    }
}
