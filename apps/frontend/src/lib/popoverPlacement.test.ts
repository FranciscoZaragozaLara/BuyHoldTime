import { describe, expect, it } from 'vitest';
import { placePinned, placePopover } from './popoverPlacement';

const vp = { w: 1400, h: 800 }, size = { w: 720, h: 500 };

describe('placePopover', () => {
  it('a la derecha del cursor cuando cabe', () => {
    expect(placePopover({ x: 300, y: 400 }, size, vp)).toEqual({ left: 316, top: 150 });
  });
  it('a la izquierda cuando no cabe a la derecha: no tapa el cursor ni se sale', () => {
    const p = placePopover({ x: 1200, y: 400 }, size, vp);
    expect(p.left).toBe(1200 - 16 - 720);
    expect(p.left + size.w).toBeLessThan(1200);
  });
  it('sin espacio en ningún lado: lado con más espacio, dentro de la pantalla', () => {
    const p = placePopover({ x: 500, y: 400 }, size, { w: 1000, h: 800 });
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + size.w).toBeLessThanOrEqual(1000 - 8);
  });
  it('vertical centrado en el cursor y recortado a la pantalla', () => {
    expect(placePopover({ x: 300, y: 50 }, size, vp).top).toBe(8);
    expect(placePopover({ x: 300, y: 790 }, size, vp).top).toBe(800 - 8 - 500);
  });
});

describe('placePinned', () => {
  const vp = { w: 1358, h: 739 }, size = { w: 720, h: 400 };
  it('punto a la izquierda: popover pegado al borde derecho', () => {
    expect(placePinned({ x: 300, y: 400 }, size, vp)).toEqual({ left: 1358 - 8 - 720, top: 170 });
  });
  it('punto a la derecha: popover pegado al borde izquierdo', () => {
    expect(placePinned({ x: 1000, y: 400 }, size, vp).left).toBe(8);
  });
  it('no salta al moverse un día dentro de la misma mitad', () => {
    expect(placePinned({ x: 640, y: 400 }, size, vp).left).toBe(placePinned({ x: 646, y: 400 }, size, vp).left);
  });
});
