function setTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            document.querySelectorAll('.tbtn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.theme === theme);
            });
            try { localStorage.setItem('nkanyezi-theme', theme); } catch(e) {}
        }
 
        try {
            const saved = localStorage.getItem('nkanyezi-theme');
            if (saved) setTheme(saved);
        } catch(e) {}