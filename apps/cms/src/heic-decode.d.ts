declare module "heic-decode" {
  interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }
  interface ImageHandle {
    width: number;
    height: number;
    decode(): Promise<DecodedImage>;
  }
  interface ImageHandles extends Array<ImageHandle> {
    dispose(): void;
  }
  const decode: {
    all(options: { buffer: Buffer }): Promise<ImageHandles>;
  };
  export default decode;
}
