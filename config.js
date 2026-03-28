// ═══════════════════════════════════════════════════════════════
//  CONFIGURACIÓN DE LA MODELO — editar este archivo para personalizar
// ═══════════════════════════════════════════════════════════════
const MODEL_CONFIG = {

  // ─── Identificador interno ────────────────────────────────────
  modelo_id: "MODEL_ID_PLACEHOLDER",

  // ─── Nombre que aparece en la landing ────────────────────────
  nombre: "Nombre Modelo",

  // ─── Tagline bilingüe ─────────────────────────────────────────
  tagline: {
    es: "Contenido exclusivo para ti 🖤",
    en: "Exclusive content just for you 🖤"
  },

  // ─── Links principales (¡IMPORTANTE: actualizar!) ─────────────
  links: {
    onlyfans: "#of-link-placeholder",   // e.g. "https://onlyfans.com/tu-usuario"
    telegram: "#tg-link-placeholder"    // e.g. "https://t.me/tu-canal"
  },

  // ─── Stats del perfil (sección de estadísticas) ───────────────
  stats: {
    posts:  "240+",    // e.g. "500+", "1.2k"
    fans:   "4.8k",    // e.g. "10k", "25k+"
    rating: "4.9"      // e.g. "4.8" — se mostrará como "★ 4.9"
  },

  // ─── Foto hero principal (null = usa imagen embebida en HTML) ─
  foto: null,          // e.g. "https://cdn.tudominio.com/hero.jpg"

  // ─── Foto de avatar circular (null = sincroniza con foto hero) ─
  foto_avatar: null,   // e.g. "https://cdn.tudominio.com/avatar.jpg"

  // ─── Color de acento principal ────────────────────────────────
  colores: {
    accent: "#c9a96e"  // gold por defecto — cambia el color del anillo del avatar, etc.
  }

};

// Alias para retrocompatibilidad con app.js
const MODELO_ID = MODEL_CONFIG.modelo_id;
