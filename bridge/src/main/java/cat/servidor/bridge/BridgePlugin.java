package cat.servidor.bridge;

import cat.servidor.bridge.api.ApiServer;
import cat.servidor.bridge.chat.ChatFormatter;
import cat.servidor.bridge.effects.EffectService;
import cat.servidor.bridge.luckperms.RoleService;
import cat.servidor.bridge.tab.TabService;
import cat.servidor.bridge.tags.TagPlaceholders;
import cat.servidor.bridge.tags.TagService;
import cat.servidor.bridge.tags.TagsCommand;
import net.luckperms.api.LuckPerms;
import org.bukkit.plugin.RegisteredServiceProvider;
import org.bukkit.plugin.java.JavaPlugin;

import java.security.SecureRandom;
import java.util.HexFormat;

public final class BridgePlugin extends JavaPlugin {

    private ApiServer apiServer;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        String token = ensureToken();

        RegisteredServiceProvider<LuckPerms> provider = getServer().getServicesManager().getRegistration(LuckPerms.class);
        if (provider == null) {
            getLogger().severe("No s'ha trobat LuckPerms. Desactivant Bridge.");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        LuckPerms luckPerms = provider.getProvider();
        TagService tags = new TagService(this, luckPerms);
        tags.load();

        TagsCommand tagsCommand = new TagsCommand(this, luckPerms, tags);
        getCommand("tags").setExecutor(tagsCommand);
        getServer().getPluginManager().registerEvents(tagsCommand, this);
        getServer().getPluginManager().registerEvents(new ChatFormatter(luckPerms, tags), this);

        if (getServer().getPluginManager().isPluginEnabled("PlaceholderAPI")) {
            new TagPlaceholders(this, luckPerms, tags).register();
            getLogger().info("Placeholders %bridge_...% registrats");
        } else {
            getLogger().warning("PlaceholderAPI no hi és: els tags no sortiran al TAB ni al xat");
        }

        RoleService roles = new RoleService(this, luckPerms, tags, getConfig().getInt("personal-meta-priority", 1000));
        apiServer = new ApiServer(this, roles, tags, new TabService(this), new EffectService(this), token);
        try {
            apiServer.start(getConfig().getString("api.host", "127.0.0.1"), getConfig().getInt("api.port", 8765));
        } catch (Exception e) {
            getLogger().severe("No s'ha pogut obrir l'API: " + e.getMessage());
            getServer().getPluginManager().disablePlugin(this);
        }
    }

    @Override
    public void onDisable() {
        if (apiServer != null) {
            apiServer.stop();
        }
    }

    private String ensureToken() {
        String token = getConfig().getString("api.token", "");
        if (token == null || token.isBlank()) {
            byte[] bytes = new byte[32];
            new SecureRandom().nextBytes(bytes);
            token = HexFormat.of().formatHex(bytes);
            getConfig().set("api.token", token);
            saveConfig();
            getLogger().info("S'ha generat un token nou per a l'API a plugins/Bridge/config.yml");
        }
        return token;
    }
}
