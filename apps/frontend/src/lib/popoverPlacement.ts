// Posición del popover junto al cursor sin taparlo: va a un lado (derecha si cabe, si no izquierda;
// si no cabe en ninguno, el lado con más espacio y se recorre dentro de la pantalla) y en vertical
// se centra en el cursor, sin salirse de la pantalla. Así la línea vertical del crosshair queda libre.
export type Placement = { left: number; top: number };

export function placePopover(
  cursor: { x: number; y: number }, size: { w: number; h: number }, viewport: { w: number; h: number },
  gap = 16, margin = 8,
): Placement {
  const w = Math.min(size.w, viewport.w - 2 * margin), h = Math.min(size.h, viewport.h - 2 * margin);
  const right = cursor.x + gap, leftSide = cursor.x - gap - w;
  let left: number;
  if (right + w <= viewport.w - margin) left = right;
  else if (leftSide >= margin) left = leftSide;
  else left = viewport.w - cursor.x > cursor.x ? right : leftSide;
  left = Math.min(Math.max(margin, left), viewport.w - margin - w);
  const top = Math.min(Math.max(margin, cursor.y - h / 2), viewport.h - margin - h);
  return { left, top };
}
