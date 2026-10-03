package cat.servidor.bridge.tab;

import cat.servidor.bridge.BridgePlugin;
import cat.servidor.bridge.api.ApiException;
import cat.servidor.bridge.api.Json;
import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.configuration.InvalidConfigurationException;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.Plugin;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * Edita la configuració del plugin TAB (NEZNAMY, v6): capçalera i peu, ordre dels grups
 * i si el tag de /tags surt al TAB. Després fa "tab reload".
 */
public final class TabService {

    /** Separador de camí que no apareix a cap clau del TAB (n'hi ha amb punts, p. ex. "scoreboard-1.20.3+"). */
    private static final char SEP = '\u0001';
    private static final String SORT_PREFIX = "GROUPS:";
    private static final String TAG_PLACEHOLDER = "%bridge_tag_spaced%";
    private static final Pattern GROUP_NAME = Pattern.compile("[a-z0-9_-]{1,36}");
    private static final int MAX_LINES = 20;
    private static final int MAX_LINE_LENGTH = 256;

    private final BridgePlugin plugin;

    public TabService(BridgePlugin plugin) {
        this.plugin = plugin;
    }

    public record TabSettings(boolean available, List<String> header, List<String> footer,
                              List<String> groupOrder, boolean showTag) {
    }

    public synchronized TabSettings get() {
        File folder = tabFolder();
        if (folder == null) {
            return new TabSettings(false, List.of(), List.of(), List.of(), false);
        }
        YamlConfiguration config = load(new File(folder, "config.yml"));
        YamlConfiguration groups = load(new File(folder, "groups.yml"));

        List<String> order = new ArrayList<>();
        for (String type : config.getStringList(path("scoreboard-teams", "sorting-types"))) {
            if (type.startsWith(SORT_PREFIX)) {
                for (String g : type.substring(SORT_PREFIX.length()).split(",")) {
                    if (!g.isBlank()) order.add(g.trim());
                }
                break;
            }
        }
        String tabSuffix = groups.getString(path("_DEFAULT_", "tabsuffix"), "");
        return new TabSettings(true,
                config.getStringList(path("header-footer", "designs", "default", "header")),
                config.getStringList(path("header-footer", "designs", "default", "footer")),
                order,
                tabSuffix.contains(TAG_PLACEHOLDER));
    }

    public synchronized TabSettings update(JsonObject body) throws Exception {
        File folder = tabFolder();
        if (folder == null) {
            throw ApiException.conflict("El plugin TAB no està instal·lat");
        }

        // Validar-ho tot abans de tocar res
        List<String> header = body.has("header") ? lines(body, "header") : null;
        List<String> footer = body.has("footer") ? lines(body, "footer") : null;
        List<String> order = null;
        if (body.has("groupOrder")) {
            order = new ArrayList<>();
            for (String g : Json.stringList(body, "groupOrder", 50)) {
                String name = g.toLowerCase();
                if (!GROUP_NAME.matcher(name).matches()) {
                    throw ApiException.badRequest("Nom de grup invàlid: " + g);
                }
                order.add(name);
            }
        }
        Boolean showTag = null;
        if (body.has("showTag")) {
            if (!body.get("showTag").isJsonPrimitive() || !body.get("showTag").getAsJsonPrimitive().isBoolean()) {
                throw ApiException.badRequest("'showTag' ha de ser true o false");
            }
            showTag = body.get("showTag").getAsBoolean();
        }

        File configFile = new File(folder, "config.yml");
        YamlConfiguration config = load(configFile);
        if (header != null) {
            config.set(path("header-footer", "designs", "default", "header"), header);
        }
        if (footer != null) {
            config.set(path("header-footer", "designs", "default", "footer"), footer);
        }
        if (order != null) {
            String sortPath = path("scoreboard-teams", "sorting-types");
            List<String> types = new ArrayList<>(config.getStringList(sortPath));
            types.removeIf(t -> t.startsWith(SORT_PREFIX));
            if (!order.isEmpty()) {
                types.addFirst(SORT_PREFIX + String.join(",", order));
            }
            config.set(sortPath, types);
        }
        config.save(configFile);

        if (showTag != null) {
            File groupsFile = new File(folder, "groups.yml");
            YamlConfiguration groups = load(groupsFile);
            for (String key : List.of("tabsuffix", "tagsuffix")) {
                String p = path("_DEFAULT_", key);
                String current = groups.getString(p, "%luckperms-suffix%").replace(TAG_PLACEHOLDER, "");
                groups.set(p, showTag ? current + TAG_PLACEHOLDER : current);
            }
            groups.save(groupsFile);
        }

        reloadTab();
        plugin.getLogger().info("[API] Configuració del TAB actualitzada");
        return get();
    }

    private void reloadTab() throws Exception {
        Bukkit.getScheduler().callSyncMethod(plugin,
                () -> Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "tab reload")).get(10, TimeUnit.SECONDS);
    }

    private static List<String> lines(JsonObject body, String key) {
        List<String> lines = Json.stringList(body, key, MAX_LINES);
        for (String line : lines) {
            if (line.length() > MAX_LINE_LENGTH) {
                throw ApiException.badRequest("Una línia de '" + key + "' és massa llarga (màx. " + MAX_LINE_LENGTH + ")");
            }
        }
        return lines;
    }

    private static File tabFolder() {
        Plugin tab = Bukkit.getPluginManager().getPlugin("TAB");
        if (tab == null || !tab.isEnabled()) {
            return null;
        }
        return tab.getDataFolder();
    }

    private static YamlConfiguration load(File file) {
        YamlConfiguration yaml = new YamlConfiguration();
        yaml.options().pathSeparator(SEP);
        try {
            yaml.load(file);
        } catch (IOException | InvalidConfigurationException e) {
            throw new IllegalStateException("No s'ha pogut llegir " + file.getName() + " del TAB", e);
        }
        return yaml;
    }

    private static String path(String... parts) {
        return String.join(String.valueOf(SEP), parts);
    }
}
