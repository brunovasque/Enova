const dependencyMap: Record<string, string[]> = {
  composicao: ["parceiro_p2", "familiar", "p3"],
  docs: ["correspondente"],
  correspondente: ["visita"]
};

export const getDependentSlots = (slotName: string): string[] =>
  dependencyMap[slotName] ?? [];
