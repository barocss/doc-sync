import {test} from "node:test";
import {restartRecoveryScenario, type Fault} from "./fixtures/restart-recovery-harness.ts";

const skip = process.platform !== "darwin" && process.platform !== "linux" ? "The journal requires a macOS or Linux kernel lock" : false;
for (const fault of ["lease-before", "lease-after", "state", "persistent"] as Fault[]) {
    test(`repeated MCP restart tolerates bounded recovery HTTP failure: ${fault}`, {timeout: 45000, skip}, () => restartRecoveryScenario(fault));
}
