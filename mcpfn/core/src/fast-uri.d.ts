declare module "fast-uri" {
  const uri: {
    resolve(baseURI: string, relativeURI: string): string;
  };
  export default uri;
}
