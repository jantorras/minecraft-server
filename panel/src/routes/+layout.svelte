<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { hasRole } from '$lib/roles';

	let { data, children } = $props();

	const links = $derived([
		{ href: '/', label: 'Inici', icon: 'home' },
		{ href: '/servidor', label: 'Servidor', icon: 'server' },
		...(hasRole(data.user, 'admin') ? [{ href: '/fitxers', label: 'Fitxers', icon: 'files' }] : []),
		{ href: '/players', label: 'Jugadors', icon: 'players' },
		{ href: '/groups', label: 'Grups', icon: 'groups' },
		{ href: '/tags', label: 'Tags', icon: 'tags' },
		{ href: '/tab', label: 'TAB', icon: 'tab' },
		...(hasRole(data.user, 'admin') ? [{ href: '/bromes', label: 'Calderó', icon: 'jokes' }] : []),
		{ href: '/audit', label: 'Registre', icon: 'log' },
		...(hasRole(data.user, 'owner') ? [{ href: '/users', label: 'Usuaris del panell', icon: 'users' }] : [])
	]);

	const isActive = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Panell del servidor</title>
</svelte:head>

{#if data.user}
	<div class="shell">
		<nav>
			<a href="/" class="brand">
				<span class="brand-mark" aria-hidden="true"></span>
				Panell
			</a>
			<ul>
				{#each links as link (link.href)}
					<li>
						<a href={link.href} class:active={isActive(link.href)}>
							<svg class="icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
								{#if link.icon === 'home'}
									<path d="M3 9.5 10 3l7 6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
									<path d="M5 8.5V16a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
								{:else if link.icon === 'server'}
									<rect x="3" y="3.5" width="14" height="4.5" rx="1" stroke="currentColor" stroke-width="1.6" />
									<rect x="3" y="11.5" width="14" height="4.5" rx="1" stroke="currentColor" stroke-width="1.6" />
									<circle cx="6" cy="5.75" r="0.9" fill="currentColor" />
									<circle cx="6" cy="13.75" r="0.9" fill="currentColor" />
								{:else if link.icon === 'files'}
									<path d="M3 5.5a1 1 0 0 1 1-1h3.5l1.3 1.6H16a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
								{:else if link.icon === 'players'}
									<circle cx="7.5" cy="7" r="2.6" stroke="currentColor" stroke-width="1.6" />
									<circle cx="14" cy="8" r="2" stroke="currentColor" stroke-width="1.6" />
									<path d="M2.5 16.5c.4-2.6 2.4-4.2 5-4.2s4.6 1.6 5 4.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
									<path d="M12.5 12.7c2 .1 3.5 1.5 3.8 3.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
								{:else if link.icon === 'groups'}
									<path d="M10 2.5 16.5 6 10 9.5 3.5 6 10 2.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
									<path d="M3.5 10 10 13.5 16.5 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
									<path d="M3.5 14 10 17.5 16.5 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
								{:else if link.icon === 'tags'}
									<path d="M3 3h6l8 8-6 6-8-8V3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
									<circle cx="6.5" cy="6.5" r="1.1" fill="currentColor" />
								{:else if link.icon === 'tab'}
									<rect x="2.5" y="4" width="15" height="12" rx="1" stroke="currentColor" stroke-width="1.6" />
									<path d="M2.5 8h15" stroke="currentColor" stroke-width="1.6" />
									<path d="M6.5 8v8" stroke="currentColor" stroke-width="1.6" />
								{:else if link.icon === 'jokes'}
									<path d="M6 13 10 3l4 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
									<path d="M4 17h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
									<circle cx="15.5" cy="5" r="1" fill="currentColor" />
									<circle cx="17" cy="9" r="0.8" fill="currentColor" />
								{:else if link.icon === 'log'}
									<circle cx="10" cy="10.5" r="7" stroke="currentColor" stroke-width="1.6" />
									<path d="M10 6.5V11l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
								{:else if link.icon === 'users'}
									<rect x="4" y="9" width="12" height="8" rx="1" stroke="currentColor" stroke-width="1.6" />
									<path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" stroke="currentColor" stroke-width="1.6" />
								{/if}
							</svg>
							{link.label}
						</a>
					</li>
				{/each}
			</ul>
			<div class="me">
				<a href="/account" class="account" class:active={isActive('/account')}>
					<span class="avatar">{data.user.username.slice(0, 1).toUpperCase()}</span>
					<span class="who">
						<strong>{data.user.username}</strong>
						<span class="muted role">{data.user.role}</span>
					</span>
				</a>
				<form method="POST" action="/logout">
					<button class="secondary small" title="Sortir" aria-label="Sortir">⎋</button>
				</form>
			</div>
		</nav>
		<main>
			{@render children()}
		</main>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.shell {
		display: grid;
		grid-template-columns: 216px 1fr;
		min-height: 100vh;
	}
	nav {
		background: var(--bg-deep);
		border-right: 1px solid var(--border);
		padding: 1rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 700;
		font-size: 1.05rem;
		color: var(--text);
		text-decoration: none;
		padding: 0 0.4rem;
	}
	.brand-mark {
		width: 0.85rem;
		height: 0.85rem;
		border-radius: 2px;
		background: var(--accent);
		box-shadow:
			inset 1px 1px 0 var(--bevel-light),
			inset -1px -1px 0 var(--bevel-dark);
		flex: none;
	}
	nav ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	nav a {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.6rem;
		border-radius: var(--radius);
		border-left: 3px solid transparent;
		color: var(--text);
		text-decoration: none;
		font-size: 0.92rem;
	}
	.icon {
		width: 1.1rem;
		height: 1.1rem;
		flex: none;
		opacity: 0.85;
	}
	nav a:hover {
		background: var(--surface);
	}
	nav a.active {
		background: var(--surface);
		border-left-color: var(--accent);
		font-weight: 600;
	}
	.me {
		margin-top: auto;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.account {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-width: 0;
		padding: 0.4rem;
		border-radius: var(--radius);
	}
	.avatar {
		width: 1.8rem;
		height: 1.8rem;
		flex: none;
		display: grid;
		place-items: center;
		background: var(--accent);
		color: var(--accent-text);
		font-weight: 700;
		font-size: 0.85rem;
		border-radius: var(--radius);
		box-shadow:
			inset 1px 1px 0 var(--bevel-light),
			inset -1px -1px 0 var(--bevel-dark);
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.2;
	}
	.who strong {
		font-size: 0.88rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.role {
		font-size: 0.75rem;
	}
	.me form button {
		padding: 0.4rem 0.55rem;
	}
	main {
		padding: 1.5rem;
		min-width: 0;
	}
	@media (max-width: 760px) {
		.shell {
			grid-template-columns: 1fr;
		}
		nav {
			border-right: none;
			border-bottom: 1px solid var(--border);
			flex-direction: row;
			align-items: center;
			flex-wrap: wrap;
		}
		nav ul {
			flex-direction: row;
			flex-wrap: wrap;
		}
		nav a {
			border-left: none;
			border-bottom: 3px solid transparent;
		}
		nav a.active {
			border-bottom-color: var(--accent);
		}
		.me {
			margin-top: 0;
			width: 100%;
		}
		main {
			padding: 1rem;
		}
	}
</style>
