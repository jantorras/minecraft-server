package cat.servidor.bridge.tags;

import cat.servidor.bridge.BridgePlugin;
import cat.servidor.bridge.api.ApiException;
import cat.servidor.bridge.api.Json;
import com.google.gson.JsonObject;
import net.luckperms.api.LuckPerms;
import net.luckperms.api.model.user.User;
import net.luckperms.api.node.NodeType;
import net.luckperms.api.node.types.MetaNode;
import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Pattern;

/**
 * Tags desbloquejables. Les definicions viuen a tags.yml; el desbloqueig és el permís
 * bridge.tag.&lt;id&gt; de LuckPerms i el tag triat es desa com a meta "bridge-tag" de l'usuari.
 */
public final class TagService {

    public static final String META_KEY = "bridge-tag";
    public static final String PERMISSION_PREFIX = "bridge.tag.";
    private static final Pattern ID = Pattern.compile("[a-z0-9_-]{1,32}");
    private static final String DEFAULT_MATERIAL = "NAME_TAG";

    public record Tag(String id, String display, String description, String material) {
        public String permission() {
            return PERMISSION_PREFIX + id;
        }
    }

    private final BridgePlugin plugin;
    private final LuckPerms luckPerms;
    private final File file;
    private final Map<String, Tag> tags = new LinkedHashMap<>();

    public TagService(BridgePlugin plugin, LuckPerms luckPerms) {
        this.plugin = plugin;
        this.luckPerms = luckPerms;
        this.file = new File(plugin.getDataFolder(), "tags.yml");
    }

    // ---- Definicions ----

    public synchronized void load() {
        if (!file.exists()) {
            plugin.saveResource("tags.yml", false);
        }
        tags.clear();
        ConfigurationSection section = YamlConfiguration.loadConfiguration(file).getConfigurationSection("tags");
        if (section == null) {
            return;
        }
        for (String id : section.getKeys(false)) {
            ConfigurationSection t = section.getConfigurationSection(id);
            if (t == null || !ID.matcher(id).matches()) {
                plugin.getLogger().warning("Tag ignorat a tags.yml: " + id);
                continue;
            }
            tags.put(id, new Tag(id, t.getString("display", id), t.getString("description", ""),
                    validMaterial(t.getString("material", DEFAULT_MATERIAL))));
        }
        plugin.getLogger().info("Carregats " + tags.size() + " tags");
    }

    private synchronized void save() {
        YamlConfiguration yaml = new YamlConfiguration();
        yaml.options().setHeader(List.of(
                "Tags que els jugadors poden desbloquejar (permís bridge.tag.<id>) i triar amb /tags.",
                "Es gestionen des del panell; si l'edites a mà, reinicia el servidor."));
        for (Tag tag : tags.values()) {
            String path = "tags." + tag.id();
            yaml.set(path + ".display", tag.display());
            yaml.set(path + ".description", tag.description());
            yaml.set(path + ".material", tag.material());
        }
        try {
            yaml.save(file);
        } catch (IOException e) {
            throw new IllegalStateException("No s'ha pogut desar tags.yml", e);
        }
    }

    public synchronized List<Tag> list() {
        return new ArrayList<>(tags.values());
    }

    public synchronized Optional<Tag> get(String id) {
        return Optional.ofNullable(tags.get(id));
    }

    public synchronized Tag require(String id) {
        Tag tag = tags.get(id);
        if (tag == null) {
            throw ApiException.notFound("El tag '" + id + "' no existeix");
        }
        return tag;
    }

    public synchronized Tag create(JsonObject body) {
        String id = Json.requiredString(body, "id", 32).toLowerCase();
        if (!ID.matcher(id).matches()) {
            throw ApiException.badRequest("L'id del tag només pot tenir a-z, 0-9, _ i -");
        }
        if (tags.containsKey(id)) {
            throw ApiException.conflict("El tag '" + id + "' ja existeix");
        }
        Tag tag = new Tag(id,
                Json.requiredString(body, "display", 64),
                orEmpty(Json.string(body, "description", 200)),
                parseMaterial(Json.string(body, "material", 64)));
        tags.put(id, tag);
        save();
        plugin.getLogger().info("[API] Tag creat: " + id);
        return tag;
    }

    public synchronized Tag update(String id, JsonObject body) {
        Tag old = require(id);
        String display = body.has("display") ? Json.requiredString(body, "display", 64) : old.display();
        String description = body.has("description") ? orEmpty(Json.string(body, "description", 200)) : old.description();
        String material = body.has("material") ? parseMaterial(Json.string(body, "material", 64)) : old.material();
        Tag tag = new Tag(id, display, description, material);
        tags.put(id, tag);
        save();
        plugin.getLogger().info("[API] Tag modificat: " + id);
        return tag;
    }

    public synchronized void delete(String id) {
        require(id);
        tags.remove(id);
        save();
        plugin.getLogger().info("[API] Tag esborrat: " + id);
    }

    private static String parseMaterial(String name) {
        if (name == null) {
            return DEFAULT_MATERIAL;
        }
        Material material = Material.matchMaterial(name);
        if (material == null || !material.isItem() || material.isAir()) {
            throw ApiException.badRequest("Material desconegut: " + name);
        }
        return material.name();
    }

    private String validMaterial(String name) {
        Material material = name == null ? null : Material.matchMaterial(name);
        if (material == null || !material.isItem() || material.isAir()) {
            plugin.getLogger().warning("Material invàlid a tags.yml: " + name + ", faig servir " + DEFAULT_MATERIAL);
            return DEFAULT_MATERIAL;
        }
        return material.name();
    }

    private static String orEmpty(String value) {
        return value == null ? "" : value;
    }

    // ---- Per jugador ----

    public boolean isUnlocked(User user, String tagId) {
        return user.getCachedData().getPermissionData().checkPermission(PERMISSION_PREFIX + tagId).asBoolean();
    }

    public List<String> unlockedIds(User user) {
        return list().stream().map(Tag::id).filter(id -> isUnlocked(user, id)).toList();
    }

    public String selectedId(User user) {
        return user.getCachedData().getMetaData().getMetaValue(META_KEY);
    }

    /** El tag triat, només si existeix i el jugador encara el té desbloquejat. */
    public Optional<Tag> activeTag(User user) {
        String id = selectedId(user);
        if (id == null) {
            return Optional.empty();
        }
        return get(id).filter(tag -> isUnlocked(user, tag.id()));
    }

    /** Desa el tag triat (null = cap). No comprova el desbloqueig; ho ha de fer qui crida. */
    public CompletableFuture<Void> select(UUID uuid, String tagId) {
        return luckPerms.getUserManager().modifyUser(uuid, user -> {
            user.data().clear(NodeType.META.predicate(meta -> meta.getMetaKey().equals(META_KEY)));
            if (tagId != null) {
                user.data().add(MetaNode.builder(META_KEY, tagId).build());
            }
        });
    }
}
