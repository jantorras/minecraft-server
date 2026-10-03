package cat.servidor.bridge.luckperms;

import cat.servidor.bridge.BridgePlugin;
import cat.servidor.bridge.api.ApiException;
import cat.servidor.bridge.api.Json;
import cat.servidor.bridge.tags.TagService;
import com.google.gson.JsonObject;
import net.luckperms.api.LuckPerms;
import net.luckperms.api.cacheddata.CachedMetaData;
import net.luckperms.api.model.data.TemporaryNodeMergeStrategy;
import net.luckperms.api.model.group.Group;
import net.luckperms.api.model.group.GroupManager;
import net.luckperms.api.model.user.User;
import net.luckperms.api.model.user.UserManager;
import net.luckperms.api.node.NodeType;
import net.luckperms.api.node.types.DisplayNameNode;
import net.luckperms.api.node.types.InheritanceNode;
import net.luckperms.api.node.types.PermissionNode;
import net.luckperms.api.node.types.PrefixNode;
import net.luckperms.api.node.types.SuffixNode;
import net.luckperms.api.node.types.WeightNode;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.time.Duration;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/** Operacions sobre grups i jugadors via l'API oficial de LuckPerms. */
public final class RoleService {

    private static final Pattern GROUP_NAME = Pattern.compile("[a-z0-9_-]{1,36}");
    private static final Pattern PLAYER_NAME = Pattern.compile("[A-Za-z0-9_]{1,16}");
    private static final Pattern UUID_FORMAT = Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    private static final int MAX_META_LENGTH = 128;
    private static final long MAX_DURATION_SECONDS = 10L * 365 * 24 * 3600;

    private final BridgePlugin plugin;
    private final LuckPerms luckPerms;
    private final GroupManager groups;
    private final UserManager users;
    private final TagService tags;
    private final int personalPriority;

    public RoleService(BridgePlugin plugin, LuckPerms luckPerms, TagService tags, int personalPriority) {
        this.plugin = plugin;
        this.luckPerms = luckPerms;
        this.tags = tags;
        this.groups = luckPerms.getGroupManager();
        this.users = luckPerms.getUserManager();
        this.personalPriority = personalPriority;
    }

    public record GroupDto(String name, String displayName, int weight, String prefix, String suffix, List<String> parents) {
    }

    public record Membership(String group, Long expiresAt) {
    }

    public record TagGrant(String tag, Long expiresAt) {
    }

    /**
     * unlockedTags inclou els desbloquejats per grup; tagGrants només els donats
     * directament al jugador (els únics que es poden treure per jugador).
     */
    public record PlayerDto(String uuid, String name, boolean online, String primaryGroup, List<Membership> groups,
                            String prefix, String suffix, String personalPrefix, String personalSuffix,
                            String tag, List<String> unlockedTags, List<TagGrant> tagGrants) {
    }

    // ---- Estat ----

    public Map<String, Object> health() throws Exception {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("bridgeVersion", plugin.getPluginMeta().getVersion());
        out.put("server", Bukkit.getVersion());
        out.put("onlinePlayers", onlinePlayers().size());
        return out;
    }

    // ---- Grups ----

    public List<GroupDto> listGroups() {
        groups.loadAllGroups().join();
        return groups.getLoadedGroups().stream()
                .sorted(Comparator.comparingInt((Group g) -> g.getWeight().orElse(0)).reversed()
                        .thenComparing(Group::getName))
                .map(this::toDto)
                .toList();
    }

    public GroupDto getGroup(String name) {
        return toDto(requireGroup(name));
    }

    public GroupDto createGroup(JsonObject body) {
        String name = Json.requiredString(body, "name", 36).toLowerCase();
        if (!GROUP_NAME.matcher(name).matches()) {
            throw ApiException.badRequest("El nom del grup només pot tenir a-z, 0-9, _ i -");
        }
        groups.loadAllGroups().join();
        if (groups.getGroup(name) != null) {
            throw ApiException.conflict("El grup '" + name + "' ja existeix");
        }
        GroupChanges changes = parseGroupChanges(name, body);
        Group group = groups.createAndLoadGroup(name).join();
        applyGroupChanges(group, changes);
        groups.saveGroup(group).join();
        plugin.getLogger().info("[API] Grup creat: " + name);
        return toDto(group);
    }

    public GroupDto updateGroup(String name, JsonObject body) {
        Group group = requireGroup(name);
        GroupChanges changes = parseGroupChanges(group.getName(), body);
        applyGroupChanges(group, changes);
        groups.saveGroup(group).join();
        luckPerms.runUpdateTask();
        plugin.getLogger().info("[API] Grup modificat: " + group.getName());
        return toDto(group);
    }

    public Map<String, Object> deleteGroup(String name) {
        Group group = requireGroup(name);
        if (group.getName().equals("default")) {
            throw ApiException.badRequest("No es pot esborrar el grup 'default'");
        }
        groups.deleteGroup(group).join();
        luckPerms.runUpdateTask();
        plugin.getLogger().info("[API] Grup esborrat: " + group.getName());
        return Map.of("ok", true);
    }

    /** Camps a modificar d'un grup. has* indica si el camp venia al cos (null = esborrar). */
    private record GroupChanges(boolean hasDisplayName, String displayName,
                                boolean hasWeight, Long weight,
                                boolean hasParents, List<String> parents,
                                boolean hasPrefix, String prefix,
                                boolean hasSuffix, String suffix) {
    }

    /** Valida tot el cos abans de tocar res, perquè un error no deixi el grup a mitges. */
    private GroupChanges parseGroupChanges(String groupName, JsonObject body) {
        List<String> parents = Json.stringList(body, "parents", 20).stream().map(String::toLowerCase).toList();
        for (String parent : parents) {
            if (parent.equals(groupName)) {
                throw ApiException.badRequest("Un grup no pot heretar de si mateix");
            }
            requireGroup(parent);
        }
        return new GroupChanges(
                body.has("displayName"), Json.string(body, "displayName", 64),
                body.has("weight"), Json.number(body, "weight", 0, 10_000),
                body.has("parents"), parents,
                body.has("prefix"), Json.string(body, "prefix", MAX_META_LENGTH),
                body.has("suffix"), Json.string(body, "suffix", MAX_META_LENGTH));
    }

    private void applyGroupChanges(Group group, GroupChanges c) {
        if (c.hasDisplayName()) {
            group.data().clear(NodeType.DISPLAY_NAME::matches);
            if (c.displayName() != null) {
                group.data().add(DisplayNameNode.builder(c.displayName()).build());
            }
        }

        if (c.hasWeight()) {
            group.data().clear(NodeType.WEIGHT::matches);
            if (c.weight() != null) {
                group.data().add(WeightNode.builder(c.weight().intValue()).build());
            }
        }

        if (c.hasParents()) {
            group.data().clear(NodeType.INHERITANCE::matches);
            for (String parent : c.parents()) {
                group.data().add(InheritanceNode.builder(parent).build());
            }
        }

        // El prefix/sufix d'un grup té la prioritat igual al seu pes, així el grup
        // més important guanya. Es reescriuen sempre per si el pes ha canviat.
        int priority = group.data().toCollection().stream()
                .filter(NodeType.WEIGHT::matches).map(NodeType.WEIGHT::cast)
                .mapToInt(WeightNode::getWeight).max().orElse(0);

        String prefix = c.hasPrefix() ? c.prefix() : ownPrefix(group);
        group.data().clear(NodeType.PREFIX::matches);
        if (prefix != null) {
            group.data().add(PrefixNode.builder(prefix, priority).build());
        }

        String suffix = c.hasSuffix() ? c.suffix() : ownSuffix(group);
        group.data().clear(NodeType.SUFFIX::matches);
        if (suffix != null) {
            group.data().add(SuffixNode.builder(suffix, priority).build());
        }
    }

    private Group requireGroup(String name) {
        String lower = name.toLowerCase();
        if (!GROUP_NAME.matcher(lower).matches()) {
            throw ApiException.badRequest("Nom de grup invàlid: " + name);
        }
        Group group = groups.loadGroup(lower).join().orElse(null);
        if (group == null) {
            throw ApiException.notFound("El grup '" + lower + "' no existeix");
        }
        return group;
    }

    private GroupDto toDto(Group group) {
        List<String> parents = group.getNodes(NodeType.INHERITANCE).stream()
                .map(InheritanceNode::getGroupName).sorted().toList();
        return new GroupDto(group.getName(), group.getDisplayName(), group.getWeight().orElse(0),
                ownPrefix(group), ownSuffix(group), parents);
    }

    private static String ownPrefix(Group group) {
        return group.getNodes(NodeType.PREFIX).stream()
                .max(Comparator.comparingInt(PrefixNode::getPriority))
                .map(PrefixNode::getMetaValue).orElse(null);
    }

    private static String ownSuffix(Group group) {
        return group.getNodes(NodeType.SUFFIX).stream()
                .max(Comparator.comparingInt(SuffixNode::getPriority))
                .map(SuffixNode::getMetaValue).orElse(null);
    }

    // ---- Jugadors ----

    public List<PlayerDto> listPlayers() throws Exception {
        Set<UUID> online = onlinePlayers();
        Set<UUID> known = new HashSet<>(users.getUniqueUsers().join());
        known.addAll(online);

        List<CompletableFuture<User>> loads = known.stream().map(users::loadUser).toList();
        CompletableFuture.allOf(loads.toArray(CompletableFuture[]::new)).join();

        return loads.stream()
                .map(CompletableFuture::join)
                .map(user -> toDto(user, online))
                .sorted(Comparator.comparing(PlayerDto::online).reversed()
                        .thenComparing(p -> p.name() == null ? "" : p.name().toLowerCase()))
                .toList();
    }

    public PlayerDto getPlayer(String id) throws Exception {
        User user = users.loadUser(resolveUuid(id)).join();
        return toDto(user, onlinePlayers());
    }

    /** Substitueix tots els grups del jugador per un de sol (permanent). */
    public PlayerDto setPlayerGroup(String id, JsonObject body) throws Exception {
        UUID uuid = resolveUuid(id);
        String group = requireGroup(Json.requiredString(body, "group", 36)).getName();
        users.modifyUser(uuid, user -> {
            user.data().clear(NodeType.INHERITANCE::matches);
            user.data().add(InheritanceNode.builder(group).build());
            user.setPrimaryGroup(group);
        }).join();
        plugin.getLogger().info("[API] " + id + " -> grup " + group);
        return getPlayer(uuid.toString());
    }

    /** Afegeix un grup extra, opcionalment temporal (durationSeconds). */
    public PlayerDto addPlayerGroup(String id, JsonObject body) throws Exception {
        UUID uuid = resolveUuid(id);
        String group = requireGroup(Json.requiredString(body, "group", 36)).getName();
        Long seconds = Json.number(body, "durationSeconds", 60, MAX_DURATION_SECONDS);
        users.modifyUser(uuid, user -> {
            if (seconds == null) {
                user.data().add(InheritanceNode.builder(group).build());
            } else {
                user.data().add(InheritanceNode.builder(group).expiry(Duration.ofSeconds(seconds)).build(),
                        TemporaryNodeMergeStrategy.REPLACE_EXISTING_IF_DURATION_LONGER);
            }
        }).join();
        plugin.getLogger().info("[API] " + id + " + grup " + group + (seconds == null ? "" : " (" + seconds + "s)"));
        return getPlayer(uuid.toString());
    }

    public PlayerDto removePlayerGroup(String id, String groupName) throws Exception {
        UUID uuid = resolveUuid(id);
        String group = groupName.toLowerCase();
        users.modifyUser(uuid, user -> user.data().clear(node ->
                node instanceof InheritanceNode in && in.getGroupName().equals(group))).join();
        plugin.getLogger().info("[API] " + id + " - grup " + group);
        return getPlayer(uuid.toString());
    }

    /** Prefix/sufix personal del jugador (per sobre del del grup). null o "" l'esborra. */
    public PlayerDto updatePlayerMeta(String id, JsonObject body) throws Exception {
        UUID uuid = resolveUuid(id);
        boolean hasPrefix = body.has("prefix");
        boolean hasSuffix = body.has("suffix");
        String prefix = Json.string(body, "prefix", MAX_META_LENGTH);
        String suffix = Json.string(body, "suffix", MAX_META_LENGTH);
        users.modifyUser(uuid, user -> {
            if (hasPrefix) {
                user.data().clear(NodeType.PREFIX::matches);
                if (prefix != null) {
                    user.data().add(PrefixNode.builder(prefix, personalPriority).build());
                }
            }
            if (hasSuffix) {
                user.data().clear(NodeType.SUFFIX::matches);
                if (suffix != null) {
                    user.data().add(SuffixNode.builder(suffix, personalPriority).build());
                }
            }
        }).join();
        plugin.getLogger().info("[API] " + id + " prefix/sufix personal actualitzat");
        return getPlayer(uuid.toString());
    }

    private UUID resolveUuid(String id) {
        if (UUID_FORMAT.matcher(id).matches()) {
            return UUID.fromString(id);
        }
        if (!PLAYER_NAME.matcher(id).matches()) {
            throw ApiException.badRequest("Identificador de jugador invàlid");
        }
        UUID uuid = users.lookupUniqueId(id).join();
        if (uuid == null) {
            throw ApiException.notFound("El jugador '" + id + "' no ha entrat mai al servidor");
        }
        return uuid;
    }

    private PlayerDto toDto(User user, Set<UUID> online) {
        List<Membership> memberships = user.getNodes(NodeType.INHERITANCE).stream()
                .map(n -> new Membership(n.getGroupName(), n.hasExpiry() ? n.getExpiry().getEpochSecond() : null))
                .sorted(Comparator.comparing(Membership::group))
                .toList();
        CachedMetaData meta = user.getCachedData().getMetaData();
        String personalPrefix = user.getNodes(NodeType.PREFIX).stream()
                .max(Comparator.comparingInt(PrefixNode::getPriority)).map(PrefixNode::getMetaValue).orElse(null);
        String personalSuffix = user.getNodes(NodeType.SUFFIX).stream()
                .max(Comparator.comparingInt(SuffixNode::getPriority)).map(SuffixNode::getMetaValue).orElse(null);
        List<TagGrant> tagGrants = user.getNodes(NodeType.PERMISSION).stream()
                .filter(n -> n.getPermission().startsWith(TagService.PERMISSION_PREFIX) && n.getValue())
                .map(n -> new TagGrant(n.getPermission().substring(TagService.PERMISSION_PREFIX.length()),
                        n.hasExpiry() ? n.getExpiry().getEpochSecond() : null))
                .sorted(Comparator.comparing(TagGrant::tag))
                .toList();
        return new PlayerDto(user.getUniqueId().toString(), user.getUsername(), online.contains(user.getUniqueId()),
                user.getPrimaryGroup(), memberships, meta.getPrefix(), meta.getSuffix(), personalPrefix, personalSuffix,
                tags.activeTag(user).map(TagService.Tag::id).orElse(null), tags.unlockedIds(user), tagGrants);
    }

    // ---- Tags per jugador ----

    /** Desbloqueja un tag al jugador, opcionalment temporal (durationSeconds). */
    public PlayerDto grantTag(String id, JsonObject body) throws Exception {
        UUID uuid = resolveUuid(id);
        TagService.Tag tag = tags.require(Json.requiredString(body, "tag", 32).toLowerCase());
        Long seconds = Json.number(body, "durationSeconds", 60, MAX_DURATION_SECONDS);
        users.modifyUser(uuid, user -> {
            if (seconds == null) {
                user.data().add(PermissionNode.builder(tag.permission()).build());
            } else {
                user.data().add(PermissionNode.builder(tag.permission()).expiry(Duration.ofSeconds(seconds)).build(),
                        TemporaryNodeMergeStrategy.REPLACE_EXISTING_IF_DURATION_LONGER);
            }
        }).join();
        plugin.getLogger().info("[API] " + id + " + tag " + tag.id() + (seconds == null ? "" : " (" + seconds + "s)"));
        return getPlayer(uuid.toString());
    }

    /** Treu el tag donat directament al jugador (no el que ve d'un grup). */
    public PlayerDto revokeTag(String id, String tagId) throws Exception {
        UUID uuid = resolveUuid(id);
        String permission = TagService.PERMISSION_PREFIX + tagId.toLowerCase();
        users.modifyUser(uuid, user -> user.data().clear(node ->
                node instanceof PermissionNode pn && pn.getPermission().equals(permission))).join();
        plugin.getLogger().info("[API] " + id + " - tag " + tagId);
        return getPlayer(uuid.toString());
    }

    /** Tria el tag que porta el jugador. {"tag": null} el treu. Ha d'estar desbloquejat. */
    public PlayerDto selectTag(String id, JsonObject body) throws Exception {
        UUID uuid = resolveUuid(id);
        String tagId = Json.string(body, "tag", 32);
        if (tagId != null) {
            TagService.Tag tag = tags.require(tagId.toLowerCase());
            if (!tags.isUnlocked(users.loadUser(uuid).join(), tag.id())) {
                throw ApiException.conflict("El jugador no té el tag '" + tag.id() + "' desbloquejat");
            }
            tagId = tag.id();
        }
        tags.select(uuid, tagId).join();
        plugin.getLogger().info("[API] " + id + " porta el tag " + tagId);
        return getPlayer(uuid.toString());
    }

    /** Llegeix els jugadors connectats des del fil principal del servidor. */
    private Set<UUID> onlinePlayers() throws Exception {
        return Bukkit.getScheduler().callSyncMethod(plugin, () -> {
            Set<UUID> set = new HashSet<>();
            for (Player p : Bukkit.getOnlinePlayers()) {
                set.add(p.getUniqueId());
            }
            return set;
        }).get(5, TimeUnit.SECONDS);
    }
}
