// Paint the authenticated workspace background before application bundles load.
try {
  const user = JSON.parse(localStorage.getItem('pos-auth') || 'null')?.state?.user;
  if (user?.tenantId && !user.isDeveloper && !user.isSuperAdmin) {
    const cached = JSON.parse(localStorage.getItem('pos-appearance-palette:' + user.tenantId) || 'null');
    const mode = cached?.mode;
    const dark = mode === 'dark' || ((!mode || mode === 'system') && matchMedia('(prefers-color-scheme: dark)').matches);
    const root = document.documentElement;
    const colors = (dark ? cached?.dark : cached?.light) || {};
    root.classList.toggle('dark', dark);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.appearance = /^(minimal|modern|enterprise|premium|compact|glassmorphism|skeuomorphism|neo-brutalism|claymorphism|liquid-glass)$/.test(cached?.preset) ? cached.preset : 'minimal';
    const background = /^#[a-f0-9]{6}$/i.test(colors['--appearance-bg']) ? colors['--appearance-bg'] : dark ? '#0B1220' : '#F8FAFC';
    root.style.backgroundColor = background;
    root.style.setProperty('--appearance-bg', background);
    for (const [name, value] of Object.entries(colors)) {
      if (/^--appearance-[a-z-]+$/.test(name) && /^#[a-f0-9]{6}$/i.test(value)) root.style.setProperty(name, value);
    }
  }
} catch { /* Startup uses the default palette if storage is unavailable. */ }
