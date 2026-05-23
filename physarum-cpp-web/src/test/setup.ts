import "@testing-library/jest-dom/vitest";

class MockCanvasGradient {
  addColorStop() {}
}

class MockImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

const context = {
  setTransform: () => {},
  clearRect: () => {},
  fillRect: () => {},
  beginPath: () => {},
  arc: () => {},
  fill: () => {},
  stroke: () => {},
  moveTo: () => {},
  lineTo: () => {},
  save: () => {},
  restore: () => {},
  drawImage: () => {},
  putImageData: () => {},
  createImageData: (width: number, height: number) => new MockImageData(width, height),
  createLinearGradient: () => new MockCanvasGradient(),
  createRadialGradient: () => new MockCanvasGradient(),
  set fillStyle(_value: string | CanvasGradient) {},
  set strokeStyle(_value: string | CanvasGradient) {},
  set lineWidth(_value: number) {},
  set lineCap(_value: CanvasLineCap) {},
  set globalCompositeOperation(_value: GlobalCompositeOperation) {},
  set imageSmoothingEnabled(_value: boolean) {}
};

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: () => context
});
