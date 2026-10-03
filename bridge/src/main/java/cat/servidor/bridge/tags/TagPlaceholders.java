package cat.servidor.bridge.tags;

import cat.servidor.bridge.BridgePlugin;
import me.clip.placeholderapi.expansion.PlaceholderExpansion;
import net.luckperms.api.LuckPerms;
import net.luckperms.api.model.user.User;
import org.bukkit.OfflinePlayer;
import org.jetbrains.annotations.NotNull;

/**
 * Placeholders per al TAB i el xat:
 * %bridge_tag%        tag actiu (codis &), o buit
 * %bridge_tag_spaced% igual però amb un espai al davant si n'hi ha
 * %bridge_tag_id%     id del tag actiu, o buit
 */
public final class TagPlaceholders extends PlaceholderExpansion {

    private final BridgePlugin plugin;
    private final LuckPerms luckPerms;
    private final TagService tags;

    public TagPlaceholders(BridgePlugin plugin, LuckPerms luckPerms, TagService tags) {
        this.plugin = plugin;
        this.luckPerms = luckPerms;
        this.tags = tags;
    }

    @Override
    public @NotNull String getIdentifier() {
        return "bridge";
    }

    @Override
    public @NotNull String getAuthor() {
        return "servidor";
    }

    @Override
    public @NotNull String getVersion() {
        return plugin.getPluginMeta().getVersion();
    }

    @Override
    public boolean persist() {
        return true;
    }

    @Override
    public String onRequest(OfflinePlayer player, @NotNull String params) {
        if (player == null) {
            return "";
        }
        User user = luckPerms.getUserManager().getUser(player.getUniqueId());
        if (user == null) {
            return "";
        }
        var active = tags.activeTag(user);
        return switch (params) {
            case "tag" -> active.map(TagService.Tag::display).orElse("");
            case "tag_spaced" -> active.map(t -> " " + t.display()).orElse("");
            case "tag_id" -> active.map(TagService.Tag::id).orElse("");
            default -> null;
        };
    }
}
