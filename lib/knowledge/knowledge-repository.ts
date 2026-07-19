import type { KnowledgeRepository, KnowledgeSnapshot } from "./knowledge-contract";
import { loadKnowledgeSnapshot, type LoadKnowledgeOptions } from "./load-knowledge";

export function createKnowledgeRepository(options: LoadKnowledgeOptions = {}): KnowledgeRepository {
  return {
    load(): Promise<KnowledgeSnapshot> {
      return loadKnowledgeSnapshot(options);
    }
  };
}
