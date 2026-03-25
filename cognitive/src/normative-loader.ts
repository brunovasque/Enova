export interface NormativeDocumentRef {
  id: string;
  title: string;
  path: string;
}

export interface NormativeLoader {
  listDocuments(): Promise<NormativeDocumentRef[]>;
  loadDocument(path: string): Promise<string>;
}

export const createNullNormativeLoader = (): NormativeLoader => ({
  async listDocuments() {
    return [];
  },
  async loadDocument() {
    return "";
  }
});
