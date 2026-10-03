package cat.servidor.bridge.chat;

import cat.servidor.bridge.tags.TagService;
import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import net.luckperms.api.LuckPerms;
import net.luckperms.api.cacheddata.CachedMetaData;
import net.luckperms.api.model.user.User;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;

/**
 * Posa el prefix de LuckPerms (grup + personal) i el tag actiu davant del nom al xat.
 * Des de TAB 6.x el plugin TAB ja no formata el xat, només el tablist i les nametags.
 */
public final class ChatFormatter implements Listener {

    private static final LegacyComponentSerializer LEGACY = LegacyComponentSerializer.builder()
            .character('&')
            .hexColors()
            .build();

    private final LuckPerms luckPerms;
    private final TagService tags;

    public ChatFormatter(LuckPerms luckPerms, TagService tags) {
        this.luckPerms = luckPerms;
        this.tags = tags;
    }

    @EventHandler
    public void onChat(AsyncChatEvent event) {
        event.renderer((source, sourceDisplayName, message, viewer) -> {
            User user = luckPerms.getUserManager().getUser(source.getUniqueId());
            if (user == null) {
                return Component.empty().append(sourceDisplayName).append(Component.text(": ")).append(message);
            }
            CachedMetaData meta = user.getCachedData().getMetaData();
            String prefix = meta.getPrefix() != null ? meta.getPrefix() : "";
            String tagSpaced = tags.activeTag(user).map(t -> " " + t.display()).orElse("");
            return Component.empty()
                    .append(LEGACY.deserialize(prefix))
                    .append(sourceDisplayName)
                    .append(LEGACY.deserialize(tagSpaced))
                    .append(Component.text(": "))
                    .append(message);
        });
    }
}
