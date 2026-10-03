package cat.servidor.bridge.tags;

import cat.servidor.bridge.BridgePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import net.luckperms.api.LuckPerms;
import net.luckperms.api.model.user.User;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.persistence.PersistentDataType;
import org.jetbrains.annotations.NotNull;

/** /tags obre el menú; /tags off treu el tag. També gestiona els clics del menú. */
public final class TagsCommand implements CommandExecutor, Listener {

    private final BridgePlugin plugin;
    private final LuckPerms luckPerms;
    private final TagService tags;

    public TagsCommand(BridgePlugin plugin, LuckPerms luckPerms, TagService tags) {
        this.plugin = plugin;
        this.luckPerms = luckPerms;
        this.tags = tags;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String @NotNull [] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Component.text("Només els jugadors poden fer servir /tags.", NamedTextColor.RED));
            return true;
        }
        if (args.length > 0 && args[0].equalsIgnoreCase("off")) {
            select(player, null);
            return true;
        }
        User user = luckPerms.getPlayerAdapter(Player.class).getUser(player);
        player.openInventory(new TagMenu(plugin, tags, user).getInventory());
        return true;
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getInventory().getHolder(false) instanceof TagMenu)) {
            return;
        }
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player) || event.getClickedInventory() != event.getView().getTopInventory()) {
            return;
        }
        ItemStack item = event.getCurrentItem();
        if (item == null || !item.hasItemMeta()) {
            return;
        }
        String id = item.getItemMeta().getPersistentDataContainer().get(TagMenu.key(plugin), PersistentDataType.STRING);
        if (id == null) {
            return;
        }
        player.closeInventory();
        if (id.equals(TagMenu.OFF)) {
            select(player, null);
            return;
        }
        User user = luckPerms.getPlayerAdapter(Player.class).getUser(player);
        if (!tags.isUnlocked(user, id)) {
            player.sendMessage(Component.text("Encara no has desbloquejat aquest tag.", NamedTextColor.RED));
            return;
        }
        select(player, id);
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getInventory().getHolder(false) instanceof TagMenu) {
            event.setCancelled(true);
        }
    }

    private void select(Player player, String id) {
        tags.select(player.getUniqueId(), id).thenRun(() -> {
            if (id == null) {
                player.sendMessage(Component.text("Ja no portes cap tag.", NamedTextColor.GRAY));
            } else {
                Component display = tags.get(id)
                        .map(t -> LegacyComponentSerializer.legacyAmpersand().deserialize(t.display()))
                        .orElse(Component.text(id));
                player.sendMessage(Component.text("Ara portes el tag ", NamedTextColor.GREEN).append(display));
            }
        });
    }
}
