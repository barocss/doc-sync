/** A small, non-executable vocabulary for optional bot presence. */
export type BotCharacter = "cat" | "fox" | "owl" | "robot";
export type BotExpression = "thinking" | "editing" | "happy" | "concerned" | "curious" | "focused" | "surprised";

/** Return only known glyphs; presence metadata from remote peers is untrusted. */
export function botFace(character: unknown, expression: unknown): string | null {
    const avatars: Record<BotCharacter, string> = {cat: "🐱", fox: "🦊", owl: "🦉", robot: "🤖"};
    const faces: Record<BotExpression, string> = {thinking: "🤔", editing: "😐", happy: "😊", concerned: "😟", curious: "🧐", focused: "😌", surprised: "😮"};
    if (typeof character !== "string" || !Object.hasOwn(avatars, character) || typeof expression !== "string" || !Object.hasOwn(faces, expression)) return null;
    return `${avatars[character as BotCharacter]} ${faces[expression as BotExpression]}`;
}

/** A reported activity, not a claim about an unreported document position. */
export type BotActivity = "reading" | "thinking" | "editing" | "done" | "needs_attention";

/** Build the same decorative avatar in each editor. Values come from the fixed vocabulary above. */
export function createBotAvatar(character: BotCharacter, expression: BotExpression): HTMLSpanElement {
    const avatar = document.createElement("span");
    avatar.className = "bot-avatar";
    avatar.dataset.character = character;
    avatar.dataset.expression = expression;
    avatar.setAttribute("aria-hidden", "true");
    // Existing character IDs remain wire-compatible; they now select a round mascot palette.
    const colors: Record<BotCharacter, string> = {
        cat: "#f2b9bb", fox: "#f4b57e", owl: "#b9aadf", robot: "#8dcfc2",
    };
    const faces: Record<BotExpression, string> = {
        thinking: '<g class="bot-eyes"><path d="M12 15l4-1m8 0 4 1"/><ellipse cx="14" cy="19" rx="1.6" ry="2"/><ellipse cx="26" cy="19" rx="1.6" ry="2"/></g><circle cx="20" cy="27" r="1.6" fill="none"/>',
        editing: '<g class="bot-eyes"><path d="m11.5 15 4.5 1m8 0 4.5-1"/><ellipse cx="14" cy="19.5" rx="1.5" ry="2"/><ellipse cx="26" cy="19.5" rx="1.5" ry="2"/></g><path d="M17.5 27h5" fill="none"/>',
        happy: '<g class="bot-eyes" fill="none"><path d="M11.5 19q2.5-3.5 5 0m7 0q2.5-3.5 5 0"/></g><path d="M16 25q4 5 8 0" fill="none"/>',
        concerned: '<g class="bot-eyes"><path d="m12 15 4-1.5m8 0 4 1.5"/><ellipse cx="14" cy="20" rx="1.5" ry="2"/><ellipse cx="26" cy="20" rx="1.5" ry="2"/></g><path d="M17 28q3-3 6 0" fill="none"/>',
        curious: '<g class="bot-eyes"><path d="m12 14 4 .5m8-1.5 4 1.5"/><ellipse cx="14" cy="19" rx="1.5" ry="2"/><ellipse cx="26" cy="19" rx="2" ry="2.5"/></g><path d="M17.5 26q2.5 2 5-.5" fill="none"/>',
        focused: '<g class="bot-eyes" fill="none"><path d="m11.5 16 4.5 1m8 0 4.5-1M11.5 20q2.5 2 5 0m7 0q2.5 2 5 0"/></g><path d="M18 27h4" fill="none"/>',
        surprised: '<g class="bot-eyes"><ellipse cx="14" cy="19" rx="2" ry="2.5"/><ellipse cx="26" cy="19" rx="2" ry="2.5"/></g><circle cx="20" cy="27" r="2.2" fill="none"/>',
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 40 40");
    svg.innerHTML = `<circle cx="20" cy="20" r="17" fill="${colors[character]}"/><path d="M9 13c2-4 6-6 10-6" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="1.5" stroke-linecap="round"/><g class="bot-face" stroke="#283744" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" fill="#283744">${faces[expression]}</g>`;
    avatar.append(svg);
    return avatar;
}
