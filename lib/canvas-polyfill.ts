/* Minimal polyfills for DOMMatrix, Path2D, and ImageData.
 *
 * pdfjs-dist checks for these globals at import time. On server environments
 * without @napi-rs/canvas (e.g. Alpine Docker), the check throws and blocks
 * even pure text extraction. These stubs satisfy the check so text extraction
 * works; actual canvas rendering still requires the native module.
 */

if (typeof globalThis.DOMMatrix === 'undefined') {
  class Poly2DMatrix {
    a: number; b: number; c: number; d: number; e: number; f: number;

    constructor(init?: string | number[]) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      } else {
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      }
    }

    get is2D() { return true; }
    get isIdentity() {
      return this.a === 1 && this.b === 0 && this.c === 0
          && this.d === 1 && this.e === 0 && this.f === 0;
    }

    get m11() { return this.a; } set m11(v) { this.a = v; }
    get m12() { return this.b; } set m12(v) { this.b = v; }
    get m21() { return this.c; } set m21(v) { this.c = v; }
    get m22() { return this.d; } set m22(v) { this.d = v; }
    get m41() { return this.e; } set m41(v) { this.e = v; }
    get m42() { return this.f; } set m42(v) { this.f = v; }
    get m13() { return 0; } get m14() { return 0; }
    get m23() { return 0; } get m24() { return 0; }
    get m31() { return 0; } get m32() { return 0; }
    get m33() { return 1; } get m34() { return 0; }
    get m43() { return 0; } get m44() { return 1; }

    multiply(o: Poly2DMatrix): Poly2DMatrix {
      return new Poly2DMatrix([
        this.a * o.a + this.c * o.b,
        this.b * o.a + this.d * o.b,
        this.a * o.c + this.c * o.d,
        this.b * o.c + this.d * o.d,
        this.a * o.e + this.c * o.f + this.e,
        this.b * o.e + this.d * o.f + this.f,
      ]);
    }

    inverse(): Poly2DMatrix {
      const det = this.a * this.d - this.b * this.c;
      if (det === 0) return new Poly2DMatrix([0, 0, 0, 0, 0, 0]);
      return new Poly2DMatrix([
        this.d / det, -this.b / det,
        -this.c / det, this.a / det,
        (this.c * this.f - this.d * this.e) / det,
        (this.b * this.e - this.a * this.f) / det,
      ]);
    }

    translate(tx: number, ty = 0): Poly2DMatrix {
      return this.multiply(new Poly2DMatrix([1, 0, 0, 1, tx, ty]));
    }

    scale(sx: number, sy?: number): Poly2DMatrix {
      return this.multiply(new Poly2DMatrix([sx, 0, 0, sy ?? sx, 0, 0]));
    }

    rotate(_angle: number): Poly2DMatrix { return this; }

    transformPoint(p?: { x?: number; y?: number; z?: number; w?: number }) {
      const x = p?.x ?? 0, y = p?.y ?? 0;
      return {
        x: this.a * x + this.c * y + this.e,
        y: this.b * x + this.d * y + this.f,
        z: p?.z ?? 0, w: p?.w ?? 1,
      };
    }

    toString() {
      return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
    }
  }

  (globalThis as Record<string, unknown>).DOMMatrix = Poly2DMatrix;
}

if (typeof globalThis.Path2D === 'undefined') {
  (globalThis as Record<string, unknown>).Path2D = class Path2D {
    moveTo(_x: number, _y: number) {}
    lineTo(_x: number, _y: number) {}
    bezierCurveTo(_c1x: number, _c1y: number, _c2x: number, _c2y: number, _x: number, _y: number) {}
    quadraticCurveTo(_cx: number, _cy: number, _x: number, _y: number) {}
    arc(_x: number, _y: number, _r: number, _s: number, _e: number, _ccw?: boolean) {}
    rect(_x: number, _y: number, _w: number, _h: number) {}
    closePath() {}
    addPath(_path: unknown) {}
  };
}

if (typeof globalThis.ImageData === 'undefined') {
  (globalThis as Record<string, unknown>).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(sw: number, sh: number) {
      this.width = sw;
      this.height = sh;
      this.data = new Uint8ClampedArray(sw * sh * 4);
    }
  };
}
