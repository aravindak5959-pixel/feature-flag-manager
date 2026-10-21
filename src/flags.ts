import { createHash } from "node:crypto";

export interface FeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  userIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type CreateFlagInput = Pick<FeatureFlag, "key"> &
  Partial<Pick<FeatureFlag, "description" | "enabled" | "rolloutPercentage" | "userIds">>;
export type UpdateFlagInput = Partial<Omit<CreateFlagInput, "key">>;

export class FlagError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "FlagError";
  }
}

/** In-memory storage keeps this exercise easy to run; replace with a repository for persistence. */
export class FlagManager {
  private readonly flags = new Map<string, FeatureFlag>();

  list(): FeatureFlag[] {
    return [...this.flags.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  get(key: string): FeatureFlag {
    const flag = this.flags.get(key);
    if (!flag) throw new FlagError(`Flag '${key}' was not found`, 404);
    return flag;
  }

  create(input: CreateFlagInput): FeatureFlag {
    this.validateKey(input.key);
    if (this.flags.has(input.key)) throw new FlagError(`Flag '${input.key}' already exists`, 409);
    const now = new Date().toISOString();
    const flag: FeatureFlag = {
      key: input.key,
      description: input.description === undefined ? "" : input.description,
      enabled: input.enabled === undefined ? false : input.enabled,
      rolloutPercentage: input.rolloutPercentage === undefined ? 0 : input.rolloutPercentage,
      userIds: input.userIds === undefined ? [] : input.userIds,
      createdAt: now,
      updatedAt: now,
    };
    this.validateFields(flag);
    this.flags.set(flag.key, flag);
    return flag;
  }

  update(key: string, changes: UpdateFlagInput): FeatureFlag {
    const current = this.get(key);
    const updated = { ...current, ...changes, updatedAt: new Date().toISOString() };
    this.validateFields(updated);
    this.flags.set(key, updated);
    return updated;
  }

  delete(key: string): void {
    this.get(key);
    this.flags.delete(key);
  }

  evaluate(key: string, userId: string): { key: string; userId: string; enabled: boolean; reason: string } {
    const flag = this.get(key);
    if (!flag.enabled) return { key, userId, enabled: false, reason: "flag_disabled" };
    if (flag.userIds.includes(userId)) return { key, userId, enabled: true, reason: "targeted_user" };
    const bucket = this.bucket(key, userId);
    const enabled = bucket < flag.rolloutPercentage;
    return { key, userId, enabled, reason: enabled ? "included_in_rollout" : "outside_rollout" };
  }

  private bucket(key: string, userId: string): number {
    const digest = createHash("sha256").update(`${key}:${userId}`).digest();
    return digest.readUInt32BE(0) % 100;
  }

  private validateKey(key: unknown): asserts key is string {
    if (typeof key !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(key)) {
      throw new FlagError("key must be 1-64 characters: letters, numbers, underscores, or hyphens", 400);
    }
  }

  private validateFields(flag: FeatureFlag): void {
    this.validateKey(flag.key);
    if (typeof flag.description !== "string") throw new FlagError("description must be a string", 400);
    if (typeof flag.enabled !== "boolean") throw new FlagError("enabled must be a boolean", 400);
    if (!Number.isInteger(flag.rolloutPercentage) || flag.rolloutPercentage < 0 || flag.rolloutPercentage > 100) {
      throw new FlagError("rolloutPercentage must be an integer from 0 to 100", 400);
    }
    if (!Array.isArray(flag.userIds) || !flag.userIds.every((id) => typeof id === "string" && id.length > 0)) {
      throw new FlagError("userIds must be an array of non-empty strings", 400);
    }
  }
}
