import type {DataValidator} from "../data/access.ts";

/** One lazy policy binding per Client. This is not remote admission. */
export class ClientDataPolicy {
    private readonly validator: DataValidator | undefined;
    private validating = false;
    private readonly owner: object;
    constructor(validator: DataValidator | undefined, owner: object) { this.validator = validator; this.owner = owner; }
    readonly assertMutable = (): void => {
        if (this.validating) throw new Error("Data: validator mutation is not allowed");
    };
    readonly validate: DataValidator = write => {
        this.assertMutable(); this.validating = true;
        try { this.validator?.call(this.owner, write); } finally { this.validating = false; }
    };
}
