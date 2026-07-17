/// <reference types="vite/client" />

interface BarcodeDetectorOptions {
  formats?: string[];
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  static getSupportedFormats(): Promise<string[]>;
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
}
