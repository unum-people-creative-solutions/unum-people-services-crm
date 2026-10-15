// @vitest-environment node
import { describe, it, expect } from 'vitest'
import path from 'path'
import sharp from 'sharp'

// O launcher do Android recorta o ícone maskable (círculo, squircle...). Só o
// círculo de raio 0,40 × lado, no centro, sobrevive a qualquer recorte (spec
// W3C de maskable icons). Fora dele só pode haver o fundo branco.
const RAIO_ZONA_SEGURA = 0.4
const TOLERANCIA = 3

async function lerPixels(arquivo: string) {
  const { data, info } = await sharp(path.resolve(__dirname, '../../public/icons', arquivo))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, largura: info.width, altura: info.height }
}

describe.each([
  ['icon-maskable-512x512.png', 512],
  ['icon-maskable-192x192.png', 192],
])('%s', (arquivo, lado) => {
  it(`tem ${lado}×${lado}, é opaco e só tem fundo branco fora da zona segura, com o logo dentro dela`, async () => {
    const { data, largura, altura } = await lerPixels(arquivo)
    expect({ largura, altura }).toEqual({ largura: lado, altura: lado })

    const centro = lado / 2
    const raio = RAIO_ZONA_SEGURA * lado
    let transparentes = 0
    let naoBrancosForaDaZona = 0
    let naoBrancosDentroDaZona = 0

    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) {
        const i = (y * lado + x) * 4
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
        if (a !== 255) transparentes++
        const branco = r >= 255 - TOLERANCIA && g >= 255 - TOLERANCIA && b >= 255 - TOLERANCIA
        const foraDaZona = Math.hypot(x + 0.5 - centro, y + 0.5 - centro) > raio
        if (!branco && foraDaZona) naoBrancosForaDaZona++
        if (!branco && !foraDaZona) naoBrancosDentroDaZona++
      }
    }

    expect(transparentes).toBe(0)
    expect(naoBrancosForaDaZona).toBe(0)
    expect(naoBrancosDentroDaZona).toBeGreaterThan(0)
  })
})
