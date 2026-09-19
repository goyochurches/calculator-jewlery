/** Gemstone looks for Render / Ray-trace: body color + real refractive index. */
export interface GemLook { color: string; ior: number }

/** Colorless diamond, the default look. */
export const DIAMOND_LOOK: GemLook = { color: '#ffffff', ior: 2.417 }

export const GEM_LOOKS: Record<string, GemLook & { label: string }> = {
  diamond: { ...DIAMOND_LOOK, label: 'Diamond' },
  ruby: { color: '#e0115f', ior: 1.77, label: 'Ruby' },
  sapphire: { color: '#3d72ff', ior: 1.77, label: 'Sapphire' },
  emerald: { color: '#0e9a55', ior: 1.58, label: 'Emerald' },
  amethyst: { color: '#8b4fc7', ior: 1.55, label: 'Amethyst' },
  topaz: { color: '#f2a33c', ior: 1.63, label: 'Topaz' },
  aquamarine: { color: '#7fd6e6', ior: 1.58, label: 'Aquamarine' },
}
