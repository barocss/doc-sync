import {DocHub} from "./hub.ts";
import type {HubOptions} from "./hub.ts";
import type {Schema} from "../crdt/schema.ts";
import type {Envelope} from "../sync/protocol.ts";
import {schemaVersion} from "../crdt/schema-version.ts";
import {createDataSchema} from "../data/schema.ts";
import {validateDataChange, validateDataPayload} from "../data/admission.ts";

export type DataHubOptions = Omit<HubOptions, "schema" | "validatePayload" | "validateChange">;

class DataHub extends DocHub {
    /** Retain identities and reference targets until metadata-aware compaction exists. */
    override gc(_minStable = 1): Envelope | null { return null; }
    override replayGc(_frontier: number): void { throw new Error("Data: compacted data logs are unsupported"); }
    override transitionSchema(next: Schema, base: {epoch: string; serverSeq: number; schemaVersion: string}): string {
        if (schemaVersion(next) !== schemaVersion(createDataSchema())) throw new Error("Data: storage schema is fixed");
        return super.transitionSchema(next, base);
    }
}

/**
 * Opt in to pre-application Map/List admission. Legacy DocHub remains generic.
 * Deleted data is retained: GC is disabled to preserve stable IDs and hidden
 * reference targets. Storage grows until a metadata-aware compactor is available.
 * Entry births require an explicit tagged value, including {scalar: null};
 * the guarded encoding is stricter than the broad Schema defaults.
 * Replay change records through submit; compacted logs cannot be adopted.
 */
export function createDataHub(options: DataHubOptions = {}): DocHub {
    return new DataHub({...options, schema: createDataSchema(), validatePayload: validateDataPayload, validateChange: validateDataChange});
}
