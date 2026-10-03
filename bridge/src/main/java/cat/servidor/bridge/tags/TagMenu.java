package cat.servidor.bridge.tags;

import cat.servidor.bridge.BridgePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import net.luckperms.api.model.user.User;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.jetbrains.annotations.NotNull;

import java.util.ArrayList;
import java.util.List;

/** Menú de /tags. Cada ítem porta l'id del tag al PersistentDataContainer. */
public final class TagMenu implements InventoryHolder {

    public static final String OFF = "__off";
    private static final int MAX_TAGS = 53;
    private static final LegacyComponentSerializer LEGACY = LegacyComponentSerializer.legacyAmpersand();

    private final Inventory inventory;

    public TagMenu(BridgePlugin plugin, TagService tags, User user) {
        NamespacedKey key = key(plugin);
        List<TagService.Tag> all = tags.list();
        if (all.size() > MAX_TAGS) {
            all = all.subList(0, MAX_TAGS);
        }
        int rows = Math.clamp((all.size() + 1 + 8) / 9, 1, 6);
        this.inventory = Bukkit.createInventory(this, rows * 9, Component.text("Els teus tags"));

        String selected = tags.activeTag(user).map(TagService.Tag::id).orElse(null);
        int slot = 0;
        for (TagService.Tag tag : all) {
            boolean unlocked = tags.isUnlocked(user, tag.id());
            inventory.setItem(slot++, tagItem(key, tag, unlocked, tag.id().equals(selected)));
        }

        ItemStack off = new ItemStack(Material.BARRIER);
        ItemMeta meta = off.getItemMeta();
        meta.displayName(plain("Treure el tag", NamedTextColor.RED));
        meta.getPersistentDataContainer().set(key, PersistentDataType.STRING, OFF);
        off.setItemMeta(meta);
        inventory.setItem(rows * 9 - 1, off);
    }

    private static ItemStack tagItem(NamespacedKey key, TagService.Tag tag, boolean unlocked, boolean selected) {
        Material material = unlocked ? Material.matchMaterial(tag.material()) : Material.GRAY_STAINED_GLASS_PANE;
        ItemStack item = new ItemStack(material == null ? Material.NAME_TAG : material);
        ItemMeta meta = item.getItemMeta();
        meta.displayName(LEGACY.deserialize(tag.display()).decoration(TextDecoration.ITALIC, false));

        List<Component> lore = new ArrayList<>();
        if (!tag.description().isEmpty()) {
            lore.add(plain(tag.description(), NamedTextColor.GRAY));
            lore.add(Component.empty());
        }
        if (selected) {
            lore.add(plain("✔ Seleccionat", NamedTextColor.GREEN));
            meta.setEnchantmentGlintOverride(true);
        } else if (unlocked) {
            lore.add(plain("Clic per fer-lo servir", NamedTextColor.YELLOW));
        } else {
            lore.add(plain("🔒 Bloquejat", NamedTextColor.RED));
        }
        meta.lore(lore);
        meta.getPersistentDataContainer().set(key, PersistentDataType.STRING, tag.id());
        item.setItemMeta(meta);
        return item;
    }

    private static Component plain(String text, NamedTextColor color) {
        return Component.text(text, color).decoration(TextDecoration.ITALIC, false);
    }

    public static NamespacedKey key(BridgePlugin plugin) {
        return new NamespacedKey(plugin, "tag-id");
    }

    @Override
    public @NotNull Inventory getInventory() {
        return inventory;
    }
}
