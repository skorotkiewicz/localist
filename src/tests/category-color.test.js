import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getCategoryColor } from '../helpers/categoryColor.js'

test('category colors are stable and ignore case and surrounding whitespace', () => {
  assert.equal(getCategoryColor('Rust'), '#566b28')
  assert.equal(getCategoryColor(' RUST '), getCategoryColor('rust'))
  const custom = getCategoryColor('My custom category')
  getCategoryColor('An unrelated category')
  assert.equal(getCategoryColor('My custom category'), custom)
})

test('Unicode and long category names always select a palette color', () => {
  const colors = new Set([...'abcdefghijklm'].map(getCategoryColor))
  assert.equal(colors.size, 13)
  for (const category of ['工具 🦀', 'CAFÉ', '__proto__', 'x'.repeat(10000)]) {
    assert.ok(colors.has(getCategoryColor(category)))
    assert.equal(getCategoryColor(category), getCategoryColor(category.toLowerCase()))
  }
})

test('every category color has at least 4.5:1 text contrast on its normal and hover backgrounds', () => {
  const luminance = rgb =>
    rgb.reduce((sum, value, index) => {
      const channel = value / 255
      return sum + (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]
    }, 0)
  for (const color of new Set([...'abcdefghijklm'].map(getCategoryColor))) {
    const rgb = color
      .slice(1)
      .match(/../g)
      .map(value => Number.parseInt(value, 16))
    for (const tint of [0.08, 0.12]) {
      const background = rgb.map(value => value * tint + 255 * (1 - tint))
      const contrast = (luminance(background) + 0.05) / (luminance(rgb) + 0.05)
      assert.ok(contrast >= 4.5, `${color} contrast is ${contrast} at ${tint * 100}% tint`)
    }
  }
})
