<script lang="ts">
	let { value = $bindable('NAME_TAG') }: { value: string } = $props();

	// Ítems d'inventari amb icona plana (no funciona amb blocs, caps ni ítems animats
	// com la brúixola: només es renderitzen amb un model 3D, no amb un sprite).
	const ITEMS: { material: string; label: string }[] = [
		{ material: 'NAME_TAG', label: 'Etiqueta' },
		{ material: 'DIAMOND', label: 'Diamant' },
		{ material: 'DIAMOND_SWORD', label: 'Espasa de diamant' },
		{ material: 'NETHERITE_SWORD', label: 'Espasa de netherita' },
		{ material: 'GOLDEN_APPLE', label: 'Poma daurada' },
		{ material: 'NETHER_STAR', label: 'Estrella del Nether' },
		{ material: 'EMERALD', label: 'Maragda' },
		{ material: 'AMETHYST_SHARD', label: "Esquerda d'ametista" },
		{ material: 'ENDER_EYE', label: "Ull d'Ender" },
		{ material: 'ENDER_PEARL', label: "Perla d'Ender" },
		{ material: 'BLAZE_ROD', label: 'Vareta de blaze' },
		{ material: 'GHAST_TEAR', label: 'Llàgrima de ghast' },
		{ material: 'TOTEM_OF_UNDYING', label: 'Tòtem de la immortalitat' },
		{ material: 'ELYTRA', label: 'Èlitres' },
		{ material: 'DIAMOND_PICKAXE', label: 'Pic de diamant' },
		{ material: 'DIAMOND_AXE', label: 'Destral de diamant' },
		{ material: 'DIAMOND_HOE', label: 'Aixada de diamant' },
		{ material: 'DIAMOND_SHOVEL', label: 'Pala de diamant' },
		{ material: 'BOW', label: 'Arc' },
		{ material: 'TRIDENT', label: 'Trident' },
		{ material: 'FISHING_ROD', label: 'Canya de pescar' },
		{ material: 'FILLED_MAP', label: 'Mapa' },
		{ material: 'SPYGLASS', label: 'Ullera' },
		{ material: 'BOOK', label: 'Llibre' },
		{ material: 'ENCHANTED_BOOK', label: 'Llibre encantat' },
		{ material: 'WRITABLE_BOOK', label: 'Llibre i ploma' },
		{ material: 'PAPER', label: 'Paper' },
		{ material: 'FEATHER', label: 'Ploma' },
		{ material: 'BONE', label: 'Os' },
		{ material: 'STICK', label: 'Pal' },
		{ material: 'LANTERN', label: 'Fanal' },
		{ material: 'SOUL_LANTERN', label: "Fanal d'ànimes" },
		{ material: 'REDSTONE', label: 'Pedra roja' },
		{ material: 'LAPIS_LAZULI', label: 'Lapislàtzuli' },
		{ material: 'QUARTZ', label: 'Quars' },
		{ material: 'COAL', label: 'Carbó' },
		{ material: 'IRON_INGOT', label: 'Lingot de ferro' },
		{ material: 'GOLD_INGOT', label: "Lingot d'or" },
		{ material: 'COPPER_INGOT', label: 'Lingot de coure' },
		{ material: 'RAW_GOLD', label: 'Or en brut' },
		{ material: 'DIAMOND_HELMET', label: 'Casc de diamant' },
		{ material: 'NETHERITE_HELMET', label: 'Casc de netherita' },
		{ material: 'TURTLE_HELMET', label: 'Casc de tortuga' },
		{ material: 'SHULKER_SHELL', label: 'Closca de shulker' },
		{ material: 'HONEYCOMB', label: 'Bresca' },
		{ material: 'HONEY_BOTTLE', label: 'Pot de mel' },
		{ material: 'CAKE', label: 'Pastís' },
		{ material: 'COOKIE', label: 'Galeta' },
		{ material: 'APPLE', label: 'Poma' },
		{ material: 'GOLDEN_CARROT', label: 'Pastanaga daurada' },
		{ material: 'PUMPKIN_PIE', label: 'Pastís de carbassa' },
		{ material: 'MELON_SLICE', label: 'Tros de síndria' },
		{ material: 'NAUTILUS_SHELL', label: 'Closca de nàutilus' },
		{ material: 'HEART_OF_THE_SEA', label: 'Cor del mar' },
		{ material: 'PHANTOM_MEMBRANE', label: 'Membrana de fantasma' },
		{ material: 'FIREWORK_ROCKET', label: 'Coet' },
		{ material: 'FIRE_CHARGE', label: 'Càrrega de foc' },
		{ material: 'END_CRYSTAL', label: "Cristall de l'End" },
		{ material: 'CHORUS_FRUIT', label: 'Fruita chorus' },
		{ material: 'NETHER_WART', label: 'Berruga del Nether' },
		{ material: 'BREWING_STAND', label: "Suport d'alquímia" },
		{ material: 'CAULDRON', label: 'Calder' },
		{ material: 'BELL', label: 'Campana' },
		{ material: 'SNOWBALL', label: 'Bola de neu' },
		{ material: 'SLIME_BALL', label: 'Bola de llim' },
		{ material: 'MAGMA_CREAM', label: 'Crema de magma' },
		{ material: 'GUNPOWDER', label: 'Pólvora' },
		{ material: 'SPIDER_EYE', label: "Ull d'aranya" },
		{ material: 'FERMENTED_SPIDER_EYE', label: "Ull d'aranya fermentat" },
		{ material: 'RABBIT_FOOT', label: 'Pota de conill' },
		{ material: 'ARROW', label: 'Fletxa' },
		{ material: 'SADDLE', label: 'Sella' },
		{ material: 'LEAD', label: 'Corretja' },
		{ material: 'MUSIC_DISC_CAT', label: 'Disc de música' },
		{ material: 'GLOWSTONE_DUST', label: 'Pols lluminosa' },
		{ material: 'EXPERIENCE_BOTTLE', label: "Pot d'experiència" }
	];

	let search = $state('');
	let open = $state(false);
	let searchInput = $state<HTMLInputElement | null>(null);
	let root = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (open) searchInput?.focus();
	});

	function onWindowClick(e: MouseEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}
	function onWindowKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') open = false;
	}

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return ITEMS;
		return ITEMS.filter((i) => i.label.toLowerCase().includes(q) || i.material.toLowerCase().includes(q));
	});

	const selected = $derived(ITEMS.find((i) => i.material === value.toUpperCase()));
	const iconUrl = (material: string) =>
		`https://cdn.jsdelivr.net/gh/misode/mcmeta@assets/assets/minecraft/textures/item/${material.toLowerCase()}.png`;

	function pick(material: string) {
		value = material;
		open = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<div class="picker" bind:this={root}>
	<button type="button" class="current secondary" onclick={() => (open = !open)} aria-expanded={open}>
		<span class="slot">
			<img src={iconUrl(value)} alt="" width="20" height="20" />
		</span>
		{selected?.label ?? value}
		<span class="chev">{open ? '▴' : '▾'}</span>
	</button>

	{#if open}
		<div class="panel card">
			<input type="search" placeholder="Cerca un ítem…" bind:value={search} bind:this={searchInput} />
			<div class="grid">
				{#each filtered as item (item.material)}
					<button
						type="button"
						class="item"
						class:selected={item.material === value.toUpperCase()}
						title={item.label}
						onclick={() => pick(item.material)}
					>
						<span class="slot">
							<img src={iconUrl(item.material)} alt="" width="24" height="24" loading="lazy" />
						</span>
						<span class="label">{item.label}</span>
					</button>
				{:else}
					<p class="muted">Cap ítem coincideix. Fes servir el nom del material a sota.</p>
				{/each}
			</div>
		</div>
	{/if}

	<label class="manual">
		Nom del material (si no el trobes a la llista)
		<input bind:value maxlength="64" placeholder="DIAMOND_SWORD" />
	</label>
</div>

<style>
	.picker {
		position: relative;
		margin-bottom: 0.75rem;
	}
	.current {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 12rem;
	}
	.chev {
		margin-left: auto;
		opacity: 0.6;
	}
	.slot {
		width: 1.5rem;
		height: 1.5rem;
		flex: none;
		display: grid;
		place-items: center;
		background: var(--preview-bg);
		border-radius: 3px;
	}
	.slot img {
		width: 70%;
		height: 70%;
		image-rendering: pixelated;
	}
	.panel {
		position: absolute;
		z-index: 5;
		top: calc(100% + 0.3rem);
		left: 0;
		width: min(360px, 90vw);
		box-shadow: 0 2px 0 var(--bevel-dark);
	}
	.panel input[type='search'] {
		width: 100%;
		margin-bottom: 0.6rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
		gap: 0.3rem;
		max-height: 220px;
		overflow-y: auto;
	}
	.item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
		padding: 0.4rem 0.2rem;
		box-shadow: none;
	}
	.item .slot {
		width: 1.8rem;
		height: 1.8rem;
	}
	.item.selected {
		border-color: var(--accent);
		background: var(--bg);
	}
	.item .label {
		font-size: 0.65rem;
		text-align: center;
		line-height: 1.15;
		color: var(--muted);
	}
	.manual {
		margin-top: 0.5rem;
	}
</style>
