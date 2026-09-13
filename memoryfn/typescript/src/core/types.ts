export type MemoryType = 
  | "profile_static"
  | "profile_dynamic"
  | "conversational"
  | "procedural"
  | "document"
  | "derived";

export interface Memory {
  id: string;                          // UUID
  tenantId: string;                    // Primary tenant
  containerTags: string[];             // Scoping tags
  type: MemoryType;                    // Memory classification
  content: string;                     // Normalized fact text
  embedding: number[] | null;          // Vector embedding
  metadata: Record<string, any>;       // Extensible metadata
  revision?: number;
  deletedAt?: number | null;
  isLatest: boolean;                   // For update chains
  createdAt: number;                   // Unix timestamp
  updatedAt: number;                   // Unix timestamp
}

export type RelationType = "updates" | "extends" | "contradicts" | "derives";

export interface MemoryRelationship {
  id: string;                          // UUID
  fromId: string;                      // Source memory ID
  toId: string;                        // Target memory ID
  type: RelationType;                  // Relationship type
  confidence: number;                  // 0-1 confidence
  reasoning?: string;                  // LLM explanation
  createdAt: number;                   // Unix timestamp
}

export interface IngestEvent {
  id: string;                          // UUID
  tenantId: string;
  source: "chat" | "doc" | "api" | "connector";
  payloadRef?: string;                 // Reference to original payload
  status: IngestStatus;
  error?: string;
  progress?: {
    total: number;
    completed: number;
    currentStep: string;
  };
  result?: {
    memoriesCreated: number;
    memoriesUpdated: number;
    memoriesMerged: number;
    relationshipsCreated: number;
  };
  createdAt: number;
  updatedAt: number;
}

export type IngestStatus = 
  | "queued"
  | "extracting"
  | "embedding"
  | "indexing"
  | "graphing"
  | "done"
  | "error";

export interface AddMemoryInput {
  content?: string;
  messages?: Array<{ role: string; content: string }>;
  documentRef?: string;
  containerTags: string[];
  type?: MemoryType;
  metadata?: Record<string, any>;
  tenantId?: string; // Optional if inferred from context/config
}

export interface AddMemoryResult {
  memories: Memory[];
  relationships: MemoryRelationship[];
  summary: {
    created: number;
    updated: number;
    deduplicated: number;
  };
  cost?: {
    llm: number;
    embeddings: number;
    total: number;
  };
}

export interface SearchMemoryInput {
  q: string;
  /** Tenant boundary enforced by every storage adapter. Defaults to `default`. */
  tenantId?: string;
  containerTags: string[];
  filters?: Record<string, any>;
  limit?: number; // topK
  threshold?: number;
  rerank?: boolean;
  traverseRelationships?: boolean;
  onlyLatest?: boolean;
  maxTokens?: number;
  hybridRank?: boolean;
}

export interface SearchMemoryResult {
  results: Memory[];
  metadata: {
    totalFound: number;
    afterRerank?: number;
    returned: number;
  };
}
