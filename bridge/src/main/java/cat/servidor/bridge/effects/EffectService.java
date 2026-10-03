package cat.servidor.bridge.effects;

import cat.servidor.bridge.BridgePlugin;
import cat.servidor.bridge.api.ApiException;
import cat.servidor.bridge.api.Json;
import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * "Bromes": aplica efectes de poció curts a jugadors connectats, des del panell.
 * Només els efectes de la llista blanca, amb durada i nivell limitats: és per riure,
 * no una porta del darrere per donar buffs potents.
 */
public final class EffectService {

    private static final Pattern UUID_FORMAT = Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    private static final Pattern PLAYER_NAME = Pattern.compile("[A-Za-z0-9_]{1,16}");

    /** id de l'efecte (nom de PotionEffectType de Bukkit) -> nom en català, per validar i documentar. */
    public static final Map<String, String> EFFECTS = Map.ofEntries(
            Map.entry("NAUSEA", "Nàusea"),
            Map.entry("BLINDNESS", "Ceguesa"),
            Map.entry("SLOWNESS", "Lentitud"),
            Map.entry("WEAKNESS", "Feblesa"),
            Map.entry("LEVITATION", "Llevitació"),
            Map.entry("DARKNESS", "Foscor"),
            Map.entry("POISON", "Verí"),
            Map.entry("HUNGER", "Gana"),
            Map.entry("GLOWING", "Brillantor")
    );

    private final BridgePlugin plugin;

    public EffectService(BridgePlugin plugin) {
        this.plugin = plugin;
    }

    public Map<String, Object> apply(String id, JsonObject body) throws Exception {
        UUID uuid = resolveOnlineUuid(id);
        String effectName = Json.requiredString(body, "effect", 32).toUpperCase();
        if (!EFFECTS.containsKey(effectName)) {
            throw ApiException.badRequest("Efecte no permès: " + effectName);
        }
        PotionEffectType type = PotionEffectType.getByName(effectName);
        if (type == null) {
            throw ApiException.badRequest("Efecte desconegut: " + effectName);
        }
        Long durationArg = Json.number(body, "durationSeconds", 5, 120);
        Long amplifierArg = Json.number(body, "amplifier", 0, 2);
        long seconds = durationArg == null ? 15 : durationArg;
        long amplifier = amplifierArg == null ? 0 : amplifierArg;

        runSync(() -> {
            Player player = Bukkit.getPlayer(uuid);
            if (player != null) {
                player.addPotionEffect(new PotionEffect(type, (int) (seconds * 20), (int) amplifier, false, true));
            }
        });
        plugin.getLogger().info("[API] Broma " + effectName + " a " + id + " (" + seconds + "s, nivell " + (amplifier + 1) + ")");
        return Map.of("ok", true);
    }

    public Map<String, Object> clear(String id) throws Exception {
        UUID uuid = resolveOnlineUuid(id);
        runSync(() -> {
            Player player = Bukkit.getPlayer(uuid);
            if (player != null) {
                for (String name : EFFECTS.keySet()) {
                    PotionEffectType type = PotionEffectType.getByName(name);
                    if (type != null) {
                        player.removePotionEffect(type);
                    }
                }
            }
        });
        plugin.getLogger().info("[API] Efectes trets a " + id);
        return Map.of("ok", true);
    }

    private UUID resolveOnlineUuid(String id) {
        Player player = UUID_FORMAT.matcher(id).matches() ? Bukkit.getPlayer(UUID.fromString(id)) : null;
        if (player == null && PLAYER_NAME.matcher(id).matches()) {
            player = Bukkit.getPlayerExact(id);
        }
        if (player == null) {
            throw ApiException.conflict("El jugador no està connectat");
        }
        return player.getUniqueId();
    }

    private void runSync(Runnable task) throws Exception {
        Bukkit.getScheduler().callSyncMethod(plugin, () -> {
            task.run();
            return null;
        }).get(5, TimeUnit.SECONDS);
    }
}
