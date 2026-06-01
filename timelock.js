/**
 * Ball-Trap Master Pro — Time Lock (version bêta)
 *
 * Activez le verrou en passant BETA_EXPIRY à une date future.
 * Désactivez en mettant BETA_EXPIRY à null.
 *
 * Format : 'YYYY-MM-DD' (minuit UTC ce jour-là)
 * Exemple : BETA_EXPIRY = '2026-09-01' → bloque après le 1er septembre 2026
 */

const BETA_EXPIRY = null; // ← Mettre une date pour activer, ex: '2026-09-01'

(function checkTimeLock() {
    if (!BETA_EXPIRY) return; // Pas de verrou = version complète

    const expiryDate = new Date(BETA_EXPIRY + 'T23:59:59');
    const now = new Date();

    if (now >= expiryDate) {
        // Version expirée — bloquer l'application
        document.addEventListener('DOMContentLoaded', () => {
            const app = document.getElementById('app');
            if (app) {
                const daysSinceExpiry = Math.floor((now - expiryDate) / (1000 * 60 * 60 * 24));
                app.innerHTML = `
                    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:40px;text-align:center;background:var(--bg, #d1d8e0);">
                        <div style="font-size:64px;margin-bottom:24px;opacity:0.3;">🚫</div>
                        <h1 style="font-size:1.4rem;font-weight:800;color:#e74c3c;margin-bottom:12px;">Version d'essai expirée</h1>
                        <p style="font-size:0.95rem;color:#666;max-width:280px;line-height:1.5;margin-bottom:8px;">
                            Cette version de test n'est plus disponible depuis ${daysSinceExpiry} jour${daysSinceExpiry > 1 ? 's' : ''}.
                        </p>
                        <p style="font-size:0.85rem;color:#999;max-width:280px;line-height:1.5;">
                            Contactez le développeur pour obtenir la version complète.
                        </p>
                    </div>`;
            }
            // Supprimer le service worker pour empêcher le hors-ligne
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(regs => {
                    regs.forEach(reg => reg.unregister());
                });
            }
        });
        throw new Error('BETA_EXPIRED');
    } else {
        // Version active — afficher le temps restant dans la console
        const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
        console.log(`🔒 Version bêta — ${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}`);
    }
})();
