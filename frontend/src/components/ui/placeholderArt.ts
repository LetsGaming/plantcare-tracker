export type PlaceholderKind = "plant" | "substrate" | "component" | "sale";
export type PlaceholderTheme = "light" | "dark";

interface Palette {
  primary: string;
  primaryRgb: string;
  secondary: string;
  secondaryRgb: string;
  tints: readonly string[];
}

/** A data URI cannot read CSS variables, so these mirror the tokens in theme/variables.css. */
const PALETTES: Record<PlaceholderTheme, Palette> = {
  light: {
    primary: "#1f6b3b",
    primaryRgb: "31,107,59",
    secondary: "#a34a28",
    secondaryRgb: "163,74,40",
    tints: ["#cfe5d3", "#f2dccd", "#cdeaee", "#e4ebc4", "#e9d9ee"],
  },
  dark: {
    primary: "#74cf93",
    primaryRgb: "116,207,147",
    secondary: "#e8a07c",
    secondaryRgb: "232,160,124",
    tints: ["#1e3a29", "#3d2a1f", "#16383d", "#333a1b", "#34253a"],
  },
};

export const TINT_COUNT = 5;
export const VARIANT_COUNT = 3;

const ART: Record<PlaceholderKind, readonly string[]> = {
  plant: [
    '<g transform="rotate(-14 60 62)"><path d="M58 92 Q57 106 46 114" class="line" /><path d="M60 92 C52 101 31 99 24 82 C16 62 24 36 42 25 C50 20 57 17 62 15 C70 19 85 26 93 39 C103 56 101 81 93 91 C85 100 68 101 60 92 Z" class="line fill-soft" /><path d="M60 90 Q58 56 62 20" class="vein" /><path d="M17.3 75.8 L22.2 77.1 Q44.7 80.9 45 80 Q45.3 79.1 23.8 70.9 L19 69.6 Z" class="cut" /><path d="M22.2 77.1 Q44.7 80.9 45 80 Q45.3 79.1 23.8 70.9" class="line slit" /><path d="M15.3 58.1 L20.2 59.3 Q45.8 63 46 62 Q46.2 61 21.8 52.7 L16.9 51.5 Z" class="cut" /><path d="M20.2 59.3 Q45.8 63 46 62 Q46.2 61 21.8 52.7" class="line slit" /><path d="M23.1 37.6 L27.6 39.9 Q48.6 47.9 49 47 Q49.4 46.1 30.4 34.1 L26 31.9 Z" class="cut" /><path d="M27.6 39.9 Q48.6 47.9 49 47 Q49.4 46.1 30.4 34.1" class="line slit" /><path d="M103.4 72 L98.5 72.8 Q75.8 79.1 76 80 Q76.2 80.9 99.5 79.2 L104.5 78.3 Z" class="cut" /><path d="M98.5 72.8 Q75.8 79.1 76 80 Q76.2 80.9 99.5 79.2" class="line slit" /><path d="M104.4 53.9 L99.5 54.6 Q74.8 61 75 62 Q75.2 63 100.5 61.4 L105.5 60.6 Z" class="cut" /><path d="M99.5 54.6 Q74.8 61 75 62 Q75.2 63 100.5 61.4" class="line slit" /><path d="M95.4 33.1 L90.8 35.1 Q72.6 45.1 73 46 Q73.4 46.9 93.2 40.9 L97.8 39 Z" class="cut" /><path d="M90.8 35.1 Q72.6 45.1 73 46 Q73.4 46.9 93.2 40.9" class="line slit" /><ellipse cx="52" cy="71" rx="3.6" ry="2" transform="rotate(30 52 71)" class="line hole" /><ellipse cx="68" cy="71" rx="3.6" ry="2" transform="rotate(-30 68 71)" class="line hole" /><ellipse cx="53" cy="53" rx="3.4" ry="1.9" transform="rotate(25 53 53)" class="line hole" /><ellipse cx="67" cy="53" rx="3.4" ry="1.9" transform="rotate(-25 67 53)" class="line hole" /></g><g transform="translate(86 104) rotate(58)"><path d="M0 0 C-7 1 -11 -6 -10 -12 C-9 -19 -3 -23 0 -27 C3 -23 9 -19 10 -12 C11 -6 7 1 0 0 Z" class="line fill-clay" /><path d="M0 -2 Q1 -12 0 -22" class="vein vein-clay" /></g>',
    '<path d="M60 2 L42 16 M60 2 L78 16" class="vein" /><circle cx="60" cy="2" r="2.2" class="dot" /><path d="M72 30 C84 38 89 52 81 64 C73 76 74 90 84 103" class="line" /><path d="M48 30 C38 40 30 50 31 63" class="line" /><g transform="translate(86 48) rotate(100) scale(0.76)"><path d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z" class="line fill-soft" /><path d="M0 -2 Q1 -18 0 -33" class="vein" /></g><g transform="translate(77 71) rotate(-125) scale(0.72)"><path d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z" class="line fill-soft" /><path d="M0 -2 Q1 -18 0 -33" class="vein" /></g><g transform="translate(77 88) rotate(100) scale(0.64)"><path d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z" class="line fill-soft" /><path d="M0 -2 Q1 -18 0 -33" class="vein" /></g><g transform="translate(84 103) rotate(155) scale(0.54)"><path d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z" class="line fill-clay" /><path d="M0 -2 Q1 -18 0 -33" class="vein vein-clay" /></g><g transform="translate(37 42) rotate(-110) scale(0.68)"><path d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z" class="line fill-clay" /><path d="M0 -2 Q1 -18 0 -33" class="vein vein-clay" /></g><g transform="translate(31 63) rotate(185) scale(0.6)"><path d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z" class="line fill-soft" /><path d="M0 -2 Q1 -18 0 -33" class="vein" /></g><path d="M42 16 H78 L74 31 Q60 36 46 31 Z" class="line fill-clay" /><path d="M40 16 H80" class="line" />',
    '<g transform="translate(52 94) rotate(-58) scale(0.8)"><path d="M0 0 C-13 -12 -15 -40 0 -64 C15 -40 13 -12 0 0 Z" class="line fill-soft" /><path d="M0 -4 Q1 -32 0 -58 M-1 -16 L-7 -22 M1 -27 L7 -33 M-1 -38 L-6 -43 M1 -48 L4 -52" class="vein" /></g><g transform="translate(68 94) rotate(56) scale(0.8)"><path d="M0 0 C-13 -12 -15 -40 0 -64 C15 -40 13 -12 0 0 Z" class="line fill-clay" /><path d="M0 -4 Q1 -32 0 -58 M-1 -16 L-7 -22 M1 -27 L7 -33 M-1 -38 L-6 -43 M1 -48 L4 -52" class="vein vein-clay" /></g><g transform="translate(56 94) rotate(-20) scale(0.95)"><path d="M0 0 C-13 -12 -15 -40 0 -64 C15 -40 13 -12 0 0 Z" class="line fill-soft" /><path d="M0 -4 Q1 -32 0 -58 M-1 -16 L-7 -22 M1 -27 L7 -33 M-1 -38 L-6 -43 M1 -48 L4 -52" class="vein" /></g><g transform="translate(64 94) rotate(20) scale(0.92)"><path d="M0 0 C-13 -12 -15 -40 0 -64 C15 -40 13 -12 0 0 Z" class="line fill-soft" /><path d="M0 -4 Q1 -32 0 -58 M-1 -16 L-7 -22 M1 -27 L7 -33 M-1 -38 L-6 -43 M1 -48 L4 -52" class="vein" /></g><g transform="translate(60 94) rotate(0) scale(1.02)"><path d="M0 0 C-13 -12 -15 -40 0 -64 C15 -40 13 -12 0 0 Z" class="line fill-soft" /><path d="M0 -4 Q1 -32 0 -58 M-1 -16 L-7 -22 M1 -27 L7 -33 M-1 -38 L-6 -43 M1 -48 L4 -52" class="vein" /></g><path d="M38 92 H82 L77 109 Q60 114 43 109 Z" class="line fill-clay" /><path d="M35 92 H85" class="line" /><circle cx="52" cy="101" r="1.6" class="dot" /><circle cx="66" cy="104" r="1.6" class="dot" />',
  ],
  substrate: [
    '<path d="M35 25 Q60 29 85 25 L91 40 L96 91 Q95 98 87 98 H33 Q25 98 24 91 L29 40 Z" class="line fill-soft" /><path d="M29 40 Q60 47 91 40 L85 25 Q60 29 35 25 Z" class="line fill-clay" /><path d="M36 39 Q60 44 84 39" class="vein" /><path d="M60 78 V60 M60 68 Q47 66 48 54 Q60 54 60 68 M60 64 Q61 49 73 48 Q75 60 60 64" class="line" /><path d="M35 87 L42 84 M52 90 l4 -3 M73 89 l6 -4 M84 82 l3 2" class="vein" /><circle cx="43" cy="76" r="1.6" class="dot" /><circle cx="78" cy="72" r="1.6" class="dot" />',
    '<path d="M30 44 L34 102 Q60 107 86 102 L90 44 Z" class="line fill-soft" /><path d="M32 44 Q40 34 52 38 Q60 30 70 38 Q80 34 88 44 Z" class="line fill-clay" /><circle cx="46" cy="40" r="1.5" class="dot" /><path d="M80 22 L94 6" class="line handle" /><path d="M80 22 L94 6" class="line handle-groove" /><path d="M64 40 Q62 26 74 18 L86 26 Q82 40 64 40 Z" class="line fill-soft" /><path d="M68 36 L80 24" class="vein" /><path d="M27 42 Q60 50 93 42 L91 52 Q60 59 29 52 Z" class="line fill-soft" /><rect x="44" y="66" width="32" height="22" rx="5" class="line fill-clay" /><path d="M51 74 H69 M54 81 H66" class="vein vein-clay" /><path d="M90 104 Q98 96 106 104 Z" class="line fill-clay" /><circle cx="98" cy="94" r="1.6" class="dot" /><circle cx="22" cy="104" r="1.6" class="dot" />',
    '<rect x="38" y="16" width="44" height="12" rx="4" class="line fill-clay" /><path d="M46 22 H74" class="vein vein-clay" /><path d="M30 92 Q34 86 48 86 Q60 82 72 86 Q86 86 90 92 V100 Q90 108 82 108 H38 Q30 108 30 100 Z" class="fill-soft" /><path d="M30 68 Q44 62 60 66 Q76 70 90 64 V92 Q86 86 72 86 Q60 82 48 86 Q34 86 30 92 Z" class="fill-clay" /><path d="M30 68 Q44 62 60 66 Q76 70 90 64 M30 92 Q34 86 48 86 Q60 82 72 86 Q86 86 90 92" class="vein" /><path d="M38 74 L48 72 L50 78 L40 80 Z M60 74 L70 76 L66 81 Z M74 78 L84 74 L83 80 Z" class="line fill-clay thin" /><circle cx="40" cy="98" r="3.5" class="line fill-soft thin" /><circle cx="52" cy="100" r="3" class="line fill-soft thin" /><circle cx="64" cy="97" r="3.5" class="line fill-soft thin" /><circle cx="78" cy="100" r="3" class="line fill-soft thin" /><circle cx="46" cy="58" r="1.6" class="dot" /><circle cx="60" cy="54" r="1.4" class="dot" /><circle cx="74" cy="58" r="1.6" class="dot" /><path d="M34 46 Q60 40 86 46" class="vein" /><path d="M38 28 H82 V32 Q90 36 90 46 V100 Q90 108 82 108 H38 Q30 108 30 100 V46 Q30 36 38 32 Z" class="line" /><path d="M36 50 V62" class="vein shine" />',
  ],
  component: [
    '<path d="M17 58 L25 43 L48 32 L56 37 L51 51 L31 65 L20 67 Z" class="line fill-clay" /><path d="M25 55 L43 40 M30 61 L49 48" class="vein vein-clay" /><path d="M44 85 L47 74 L57 68 L70 72 L78 83 L71 94 L55 96 L46 91 Z" class="line fill-soft" /><circle cx="58" cy="81" r="2" class="dot" /><circle cx="68" cy="86" r="1.5" class="dot" /><circle cx="54" cy="90" r="1.5" class="dot" /><circle cx="83" cy="49" r="14" class="line fill-clay" /><circle cx="79" cy="45" r="2" class="dot" /><circle cx="88" cy="52" r="2.5" class="dot" /><circle cx="81" cy="56" r="1.5" class="dot" /><path d="M20 82 l7 -4 6 5 -4 7 -8 -1 Z" class="line fill-clay" /><circle cx="91" cy="80" r="4" class="line fill-soft" />',
    '<path d="M84 70 L106 56" class="line handle" /><path d="M84 70 L106 56" class="line handle-groove" /><path d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z" transform="translate(40 62) rotate(10) scale(1)" class="line fill-soft thin" /><path d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z" transform="translate(52 56) rotate(-20) scale(1.1)" class="line fill-soft thin" /><path d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z" transform="translate(64 58) rotate(30) scale(1)" class="line fill-soft thin" /><path d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z" transform="translate(74 63) rotate(0) scale(0.9)" class="line fill-soft thin" /><path d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z" transform="translate(46 52) rotate(40) scale(0.8)" class="line fill-soft thin" /><path d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z" transform="translate(60 48) rotate(-10) scale(0.9)" class="line fill-soft thin" /><path d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z" transform="translate(70 52) rotate(20) scale(0.8)" class="line fill-soft thin" /><path d="M24 64 H88 Q86 92 56 92 Q26 92 24 64 Z" class="line fill-clay" /><path d="M32 74 Q56 80 80 74" class="vein vein-clay" /><path d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z" transform="translate(30 102) rotate(15) scale(0.8)" class="line fill-soft thin" /><path d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z" transform="translate(44 106) rotate(-30) scale(0.7)" class="line fill-soft thin" /><circle cx="80" cy="102" r="1.6" class="dot" /><circle cx="90" cy="96" r="1.3" class="dot" />',
    '<path d="M24 86 Q18 74 28 68 Q28 54 42 54 Q48 42 62 46 Q74 40 82 52 Q96 52 96 66 Q104 76 94 86 Z" class="line fill-soft" /><path d="M34 66 q4 -6 8 0 q4 6 8 0 M56 58 q4 -6 8 0 q4 6 8 0 M44 76 q4 -6 8 0 q4 6 8 0 M70 72 q4 -6 8 0 q4 6 8 0" class="vein" /><path d="M34 54 l-3 -7 M34 54 l2 -8 M58 45 l-2 -8 M58 45 l3 -7 M84 52 l-1 -8 M84 52 l4 -6" class="line" /><circle cx="31" cy="47" r="1.8" class="dot" /><circle cx="61" cy="38" r="1.8" class="dot" /><circle cx="88" cy="46" r="1.8" class="dot" /><path d="M20 86 H100" class="line" /><path d="M30 100 Q30 92 40 92 Q50 92 50 100 Q50 106 40 106 Q30 106 30 100 Z" class="line fill-clay" /><path d="M70 102 Q70 96 77 96 Q84 96 84 102 Q84 106 77 106 Q70 106 70 102 Z" class="line fill-clay" /><circle cx="60" cy="100" r="1.6" class="dot" /><circle cx="92" cy="98" r="1.3" class="dot" />',
  ],
  sale: [
    '<path d="M52 79 Q51 53 37 34 M53 68 Q68 49 72 30" class="line" /><path d="M38 55 Q19 43 24 23 Q44 24 51 43 Q49 51 38 55 Z" class="line fill-soft" /><path d="M29 30 Q39 41 45 49" class="vein" /><path d="M54 54 Q51 31 74 20 Q83 40 65 53 Z" class="line fill-soft" /><path d="M74 26 L59 47" class="vein" /><path d="M53 67 Q66 45 84 53 Q82 72 57 76 Z" class="line fill-soft" /><path d="M79 57 L59 70" class="vein" /><path d="M27 77 H79 L74 104 Q53 110 32 104 Z" class="line fill-clay" /><path d="M25 76 Q53 82 81 76 L79 83 H27 Z" class="line fill-soft" /><path d="M68 78 L91 82 L103 98 L86 113 L70 99 Z" class="line fill-clay" /><circle cx="80" cy="87" r="2.5" class="line" /><circle cx="82.1" cy="96.1" r="2" class="line thin" /><circle cx="88.9" cy="102.9" r="2" class="line thin" /><path d="M89.8 94.4 L81.2 104.6" class="line thin" />',
    '<g transform="translate(58 76) rotate(-62) scale(0.82)"><path d="M0 0 C-12 -6 -13 -24 0 -36 C13 -24 12 -6 0 0 Z" class="line fill-soft" /><path d="M0 -4 Q1 -18 0 -32" class="vein" /></g><g transform="translate(62 76) rotate(62) scale(0.82)"><path d="M0 0 C-12 -6 -13 -24 0 -36 C13 -24 12 -6 0 0 Z" class="line fill-soft" /><path d="M0 -4 Q1 -18 0 -32" class="vein" /></g><g transform="translate(59 76) rotate(-28) scale(0.95)"><path d="M0 0 C-12 -6 -13 -24 0 -36 C13 -24 12 -6 0 0 Z" class="line fill-clay" /><path d="M0 -4 Q1 -18 0 -32" class="vein vein-clay" /></g><g transform="translate(61 76) rotate(28) scale(0.95)"><path d="M0 0 C-12 -6 -13 -24 0 -36 C13 -24 12 -6 0 0 Z" class="line fill-soft" /><path d="M0 -4 Q1 -18 0 -32" class="vein" /></g><g transform="translate(60 76) rotate(0) scale(1.05)"><path d="M0 0 C-12 -6 -13 -24 0 -36 C13 -24 12 -6 0 0 Z" class="line fill-soft" /><path d="M0 -4 Q1 -18 0 -32" class="vein" /></g><path d="M36 76 H84 L79 104 Q60 109 41 104 Z" class="line fill-clay" /><path d="M33 74 H87 V82 H33 Z" class="line fill-soft" /><path d="M82 82 Q90 86 92 90" class="vein" /><circle cx="96" cy="100" r="12" class="line fill-soft" /><circle cx="92" cy="90" r="2" class="line thin" /><circle cx="94" cy="99" r="1.7" class="line thin" /><circle cx="100" cy="105" r="1.7" class="line thin" /><path d="M100.8 97.5 L93.2 106.5" class="line thin" />',
    '<g transform="translate(48 52) rotate(-30) scale(0.85)"><path d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z" class="line fill-soft" /><path d="M0 -2 Q1 -18 0 -33" class="vein" /></g><g transform="translate(70 52) rotate(25) scale(0.8)"><path d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z" class="line fill-clay" /><path d="M0 -2 Q1 -18 0 -33" class="vein vein-clay" /></g><g transform="translate(60 50) rotate(0) scale(0.95)"><path d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z" class="line fill-soft" /><path d="M0 -2 Q1 -18 0 -33" class="vein" /></g><path d="M46 50 Q46 34 60 34 Q74 34 74 50" class="line" /><path d="M30 48 H90 L94 106 Q94 110 90 110 H30 Q26 110 26 106 Z" class="line fill-clay" /><path d="M30 48 L34 58 H86 L90 48" class="vein vein-clay" /><circle cx="46" cy="62" r="2" class="dot" /><circle cx="74" cy="62" r="2" class="dot" /><path d="M84 75 L87.2 79 L92.1 77.4 L92.7 82.5 L97.6 83.8 L95.4 88.4 L98.8 92.1 L94.5 94.8 L95.3 99.8 L90.2 99.7 L88.2 104.4 L84 101.5 L79.8 104.4 L77.8 99.7 L72.7 99.8 L73.5 94.8 L69.2 92.1 L72.6 88.4 L70.4 83.8 L75.3 82.5 L75.9 77.4 L80.8 79 Z" class="line fill-soft" /><circle cx="81" cy="87" r="1.7" class="line thin" /><circle cx="87" cy="93" r="1.7" class="line thin" /><path d="M87.8 85.5 L80.2 94.5" class="line thin" />',
  ],
};

const styleSheet = (palette: Palette, tint: string): string =>
  [
    `.line{fill:none;stroke:${palette.primary};stroke-width:3;stroke-linecap:round;stroke-linejoin:round}`,
    `.fill-soft{fill:rgba(${palette.primaryRgb},.16)}`,
    `.fill-clay{fill:rgba(${palette.secondaryRgb},.28);stroke:${palette.secondary}}`,
    `.dot{fill:${palette.secondary}}`,
    `.vein{fill:none;stroke:${palette.primary};stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:.6}`,
    `.vein-clay{stroke:${palette.secondary}}`,
    ".thin{stroke-width:2}",
    `.handle{stroke:${palette.secondary};stroke-width:7}`,
    `.handle-groove{stroke:${tint};stroke-width:2}`,
    ".shine{stroke:#fff;opacity:.9}",
    `.cut{fill:${tint}}`,
    ".slit{stroke-width:2.5}",
    `.hole{fill:${tint};stroke-width:2.5}`,
  ].join("");

const cache = new Map<string, string>();

/** Seed-keyed tint (1..5) and drawing (0..2); the same seed always gives the same pair. */
export const placeholderSpec = (
  kind: PlaceholderKind,
  seed: string,
): { tint: number; variant: number } => {
  let h = 0;
  const value = `${kind}:${seed}`;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return { tint: (h % TINT_COUNT) + 1, variant: Math.floor(h / TINT_COUNT) % VARIANT_COUNT };
};

const encodeSvg = (svg: string): string =>
  svg
    .replace(/"/g, "'")
    .replace(
      /[%#<>\r\n]/g,
      (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"),
    );

/** `url("data:image/svg+xml,...")` of one drawing, built once per kind, variant, tint and theme. */
export const placeholderArt = (
  kind: PlaceholderKind,
  variant: number,
  tint: number,
  theme: PlaceholderTheme,
): string => {
  const key = `${kind}|${variant}|${tint}|${theme}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const palette = PALETTES[theme];
  const drawings = ART[kind] ?? ART.plant;
  const body = drawings[variant] ?? drawings[0];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">` +
    `<style>${styleSheet(palette, palette.tints[tint - 1] ?? palette.tints[0])}</style>${body}</svg>`;
  const uri = `url("data:image/svg+xml,${encodeSvg(svg)}")`;
  cache.set(key, uri);
  return uri;
};

const injected = new Set<string>();
let sheet: HTMLStyleElement | null = null;

/**
 * Class name of one drawing. Its rule (tint plus both theme URIs) is added once to a shared
 * stylesheet, so elements carry only the class and the dark palette switches in CSS.
 * At most kinds x variants x tints (60) rules ever exist.
 */
export const placeholderClass = (kind: PlaceholderKind, variant: number, tint: number): string => {
  const name = `ph-${kind}-${variant}-${tint}`;
  if (!injected.has(name)) {
    injected.add(name);
    if (!sheet) {
      sheet = document.createElement("style");
      sheet.setAttribute("data-placeholder-art", "");
      document.head.appendChild(sheet);
    }
    sheet.appendChild(
      document.createTextNode(
        `.${name}{background-color:var(--tint-${tint});background-image:${placeholderArt(kind, variant, tint, "light")}}` +
          `.ion-palette-dark .${name}{background-image:${placeholderArt(kind, variant, tint, "dark")}}`,
      ),
    );
  }
  return name;
};
